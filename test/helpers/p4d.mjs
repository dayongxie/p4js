/**
 * Start and stop an isolated local p4d for one integration test file.
 *
 * Two transports are supported:
 *
 *  - "rsh" (default): P4PORT is `rsh:<p4d> -r <root> -L <log> -vserver=3 -i`.
 *    P4 spawns p4d for the duration of the client session, so there is no
 *    listening port and no SSL trust handling. This is the preferred mode.
 *  - "tcp": a standalone `p4d -C1 -r <root> -p 127.0.0.1:<freeport>` child
 *    process. Useful when a test needs a persistent server (cancellation) or
 *    when RSH is unavailable.
 *
 * Every server root, client root, log, enviro file and ticket file lives in a
 * fresh directory under test/tmp, and the caller's P4* environment is restored
 * on teardown.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';

import {
  applyIsolatedProcessEnv,
  buildInitArgs,
  buildRshPort,
  buildTcpArgs,
  createTempRoot,
  errorText,
  findFreePort,
  loadApi,
  locateP4d,
  osUserName,
  removeTempRoot,
  uniqueClientName,
  waitForTcpPort,
} from './env.mjs';

/** Password used for the bootstrapped super user. */
export const TEST_PASSWORD = 'P4js!Super1';

/** Charset used for the non-unicode test servers. */
export const TEST_CHARSET = 'none';

/** Charset used when a TCP server root is initialized with -xi (unicode). */
export const TEST_UNICODE_CHARSET = 'utf8';

/** Default per-test timeout for the slow operations (ms). */
export const TEST_TIMEOUT_MS = 120_000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizePathForCompare(value) {
  return String(value)
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function readLogTail(file, lines = 40) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return text.split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '(no p4d log available)';
  }
}

/**
 * Start an isolated p4d and bootstrap a super user, a ticket and a workspace.
 *
 * The returned context is deliberately plain (no class) so tests can destructure
 * it. It also owns a bootstrap `p4` client which is already connected.
 *
 * @param {{
 *   api?: ReturnType<typeof loadApi>,
 *   label?: string,
 *   transport?: 'rsh' | 'tcp',
 *   unicode?: boolean,
 *   password?: string,
 * }} [options]
 */
export async function setupP4d(options = {}) {
  const api = options.api ?? loadApi();
  if (!api.ok) throw new Error(`cannot start p4d: ${api.reason}`);

  const located = locateP4d();
  if (!located) {
    throw new Error(
      'cannot start p4d: executable not found (set P4D_BIN or put p4d on PATH)',
    );
  }

  const transport = options.transport ?? 'rsh';
  if (transport !== 'rsh' && transport !== 'tcp') {
    throw new Error(`unsupported transport "${transport}" (expected "rsh" or "tcp")`);
  }
  const unicode = options.unicode === true;
  const label = options.label ?? 'p4js';
  const password = options.password ?? TEST_PASSWORD;
  const charset = unicode ? TEST_UNICODE_CHARSET : TEST_CHARSET;

  const baseDir = createTempRoot(label);
  const serverRoot = path.join(baseDir, 'server');
  const clientRoot = path.join(baseDir, 'client');
  const logFile = path.join(baseDir, 'p4d.log');
  fs.mkdirSync(serverRoot, { recursive: true });
  fs.mkdirSync(clientRoot, { recursive: true });

  // P4 reads P4ENVIRO/P4CONFIG/... from the process environment, so isolate it
  // before the first `new P4(...)` of this test file.
  const isolatedEnv = applyIsolatedProcessEnv(baseDir);
  const user = osUserName();
  const clientName = uniqueClientName(label);

  const state = {
    transport,
    unicode,
    label,
    serverRoot,
    clientRoot,
    logFile,
    baseDir,
    clientName,
    user,
    password,
    charset,
    isolatedEnv,
    enviroFile: isolatedEnv.P4ENVIRO,
    ticketFile: isolatedEnv.P4TICKETS,
    p4dPath: located.path,
    p4dSource: located.source,
    api,
    port: null,
    p4: null,
    tcpChild: null,
    loggedIn: false,
    passwordSet: false,
    teardownWarnings: [],
  };

  const clients = new Set();
  let tornDown = false;
  let envRestored = false;

  const ctx = {
    ...state,
    /** P4 client options shared by every client of this server. */
    clientOptions: {
      port: null,
      user,
      client: clientName,
      charset,
      password,
      ticketFile: isolatedEnv.P4TICKETS,
    },
    /** Create a new (not yet connected) P4 client bound to this server. */
    newP4(overrides = {}) {
      const client = new api.P4({ ...ctx.clientOptions, ...overrides });
      clients.add(client);
      return client;
    },
    /** Absolute path inside the client root. */
    clientPath(relativePath) {
      return path.join(clientRoot, ...String(relativePath).split('/'));
    },
    /** Convert a native absolute path to the forward-slash form P4 prefers. */
    toP4Path(absolutePath) {
      return path.resolve(absolutePath).replace(/\\/g, '/');
    },
    /** Depot path corresponding to a client-relative path (default view). */
    depotPath(relativePath) {
      return `//depot/${String(relativePath).replace(/\\/g, '/').replace(/^\/+/, '')}`;
    },
    /** Write a file below the client root and return its absolute path. */
    createFile(relativePath, contents, fileOptions = {}) {
      const absolutePath = ctx.clientPath(relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, contents, fileOptions);
      return absolutePath;
    },
    /** Read a file below the client root as UTF-8 text. */
    readFile(relativePath) {
      return fs.readFileSync(ctx.clientPath(relativePath), 'utf8');
    },
    /** Remove a file below the client root (ignore misses). */
    removeFile(relativePath) {
      fs.rmSync(ctx.clientPath(relativePath), { force: true });
    },
    /**
     * Run a login on an existing client, tolerating servers that do not need
     * one (security level 0). Throws only on unexpected errors.
     */
    async login(p4) {
      try {
        await p4.runLogin(password);
        return true;
      } catch {
        // Already-ticketed, passwordless, or login not required: verify with a
        // trivial command; if that works there is nothing to do.
        try {
          await p4.run('info');
          return true;
        } catch (error) {
          throw new Error(`login failed on ${state.transport} server: ${errorText(error)}`);
        }
      }
    },
    teardown,
    readLogTail(lines) {
      return readLogTail(logFile, lines);
    },
    /** Structured summary used in assertion messages. */
    describe() {
      return `transport=${transport} port=${state.port} serverRoot=${serverRoot} client=${clientName} user=${user}`;
    },
  };

  async function teardown() {
    if (tornDown) return;
    tornDown = true;

    for (const client of clients) {
      try {
        await client.disconnect();
      } catch {
        // Already disconnected, or the connection died with the server.
      }
    }
    clients.clear();

    if (state.tcpChild) {
      await stopChild(state.tcpChild);
      state.tcpChild = null;
    }

    if (!envRestored) {
      envRestored = true;
      isolatedEnv.restore();
    }

    if (!(await removeTempRoot(baseDir))) {
      state.teardownWarnings.push(`could not remove temp root ${baseDir}`);
    }
  }

  // ---------------------------------------------------------------- startup --
  let startupError;
  try {
    if (transport === 'tcp') {
      await startTcpServer();
    } else {
      state.port = buildRshPort({
        p4dPath: state.p4dPath,
        serverRoot,
        logFile,
      });
    }

    ctx.port = state.port;
    ctx.clientOptions.port = state.port;

    // --------------------------------------------------------- bootstrap --
    const p4 = ctx.newP4();
    ctx.p4 = p4;
    try {
      await connectWithRetry(p4);
    } catch (error) {
      throw new Error(
        `could not connect to p4d (${transport}) at ${state.port}\n` +
          `p4d=${state.p4dPath}\n` +
          `error: ${errorText(error)}\n` +
          `p4d log tail:\n${readLogTail(logFile)}`,
      );
    }

    state.loggedIn = await bootstrapAuth(p4, user, password);
    await createClientWorkspace(p4, clientName, clientRoot);
  } catch (error) {
    startupError = error;
  }

  if (startupError) {
    await teardown();
    throw startupError;
  }

  async function startTcpServer() {
    // A brand new p4d root is created by the server process itself when it
    // starts with an explicit -p (verified: p4d prints "db files ... will be
    // created if missing" and keeps running). Only the unicode variant needs an
    // explicit initialization pass, because the Unicode mode is chosen at
    // creation time with `-xi` (that pass exits immediately).
    if (unicode) {
      const initLog = path.join(baseDir, 'p4d-init.log');
      try {
        execFileSync(state.p4dPath, buildInitArgs({ serverRoot, logFile: initLog, unicode: true }), {
          stdio: 'pipe',
          windowsHide: true,
        });
      } catch (error) {
        throw new Error(
          `p4d unicode initialization failed: ${errorText(error)}\n` +
            `${error.stderr ? String(error.stderr) : ''}\n` +
            `log tail:\n${readLogTail(initLog)}`,
        );
      }
    }

    const port = await findFreePort();
    const child = spawn(
      state.p4dPath,
      buildTcpArgs({ serverRoot, port, logFile }),
      { stdio: 'ignore', windowsHide: true },
    );
    state.tcpChild = child;

    const spawnError = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 0);
      timer.unref?.();
      child.once('error', (error) => resolve(error));
      child.once('spawn', () => resolve(null));
    });
    if (spawnError) throw new Error(`could not spawn p4d: ${errorText(spawnError)}`);

    const ready = await waitForTcpPort(port);
    if (!ready) {
      throw new Error(
        `p4d (${state.p4dPath}) did not start listening on 127.0.0.1:${port}\n` +
          `p4d log tail:\n${readLogTail(logFile)}`,
      );
    }

    state.port = `127.0.0.1:${port}`;
    ctx.port = state.port;
    ctx.clientOptions.port = state.port;
  }

  async function connectWithRetry(p4) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await p4.connect();
        if (p4.connected !== false) return;
      } catch (error) {
        lastError = error;
      }
      await delay(200 * attempt);
    }
    throw lastError ?? new Error('connect() did not report a connection');
  }

  async function bootstrapAuth(p4, userName, testPassword) {
    // On p4d < 2026.1 the user record must exist before a password can be set.
    // On 2026.1+ Secure-By-Default this fails silently until a password is set,
    // which is expected: keep going and set the password first instead.
    try {
      const userSpec = await p4.fetchUser(userName);
      await p4.saveUser(userSpec, '-f');
    } catch {
      // Tolerated: not needed on Secure-By-Default servers.
    }

    // Initial password: two prompts ("Enter new password", "Re-enter ...").
    // p4go uses two inputs for this; runPassword('', pw) is the JS-layer way to
    // answer exactly those two prompts.
    try {
      await p4.runPassword('', testPassword);
      state.passwordSet = true;
    } catch {
      // Password may already be set from a recycled root; try the login anyway.
    }
    if (!state.passwordSet) {
      try {
        await p4.runPassword(testPassword, testPassword);
        state.passwordSet = true;
      } catch {
        // Older servers without security=4 may not need a password at all.
      }
    }

    try {
      await p4.runLogin(testPassword);
      return true;
    } catch {
      try {
        await p4.runLogin();
        return true;
      } catch {
        // No ticket required for an unauthenticated local server.
        return false;
      }
    }
  }

  async function createClientWorkspace(p4, client, root) {
    const description = `p4js integration test workspace (${client})`;
    const view = [`//depot/... //${client}/...`];
    let lastError;

    const verify = async () => {
      const saved = await p4.fetchClient(client);
      if (normalizePathForCompare(saved.Root) !== normalizePathForCompare(root)) {
        throw new Error(
          `client Root did not persist: expected ${root}, got ${JSON.stringify(saved.Root)}`,
        );
      }
      const savedView = Array.isArray(saved.View) ? saved.View : [];
      if (!savedView.some((line) => String(line).includes('//depot/...'))) {
        throw new Error(
          `client View did not persist (got ${JSON.stringify(saved.View)}); ` +
            'formatSpec() may be dropping array-valued spec fields',
        );
      }
      return saved;
    };

    // Preferred path: the documented fetchClient/saveClient API, using the
    // server-generated form (keeps server defaults).
    try {
      const spec = await p4.fetchClient(client);
      spec.Client = client;
      spec.Root = root;
      spec.Description = description;
      spec.View = view;
      await p4.saveClient(spec);
      return await verify();
    } catch (error) {
      lastError = error;
    }

    // Fallback: send a hand-written client form through `p4.input` +
    // `p4.run('client', '-i')`. This is needed while the native formatSpec()
    // implementation drops array-valued fields such as View (see
    // test/integration/specs.test.mjs for the documented-API assertions).
    try {
      const spec = await p4.fetchClient(client).catch(() => ({}));
      const options =
        typeof spec.Options === 'string' && spec.Options !== ''
          ? spec.Options
          : 'noallwrite noclobber nocompress unlocked nomodtime normdir';
      const submitOptions =
        typeof spec.SubmitOptions === 'string' && spec.SubmitOptions !== ''
          ? spec.SubmitOptions
          : 'submitunchanged';
      const lineEnd = typeof spec.LineEnd === 'string' && spec.LineEnd !== '' ? spec.LineEnd : 'local';
      const form = [
        `Client:\t${client}`,
        `Owner:\t${user}`,
        `Description:\n\t${description}`,
        `Root:\t${root}`,
        `Options:\t${options}`,
        `SubmitOptions:\t${submitOptions}`,
        `LineEnd:\t${lineEnd}`,
        'View:',
        ...view.map((line) => `\t${line}`),
        '',
      ].join('\n');

      p4.input = form;
      await p4.run('client', '-i');
      return await verify();
    } catch (error) {
      lastError = error;
    }

    throw new Error(
      `could not create client workspace "${client}" at ${root}: ${errorText(lastError)}\n` +
        `p4d log tail:\n${readLogTail(logFile)}`,
    );
  }

  // ------------------------------------------------------------------ files --
  /**
   * Write a file in the client root, `p4 add` it and submit it with
   * `description`. Returns the paths and the submit results.
   */
  ctx.submitFile = async function submitFile(p4, relativePath, contents, description, fileOptions = {}) {
    const absolutePath = ctx.createFile(relativePath, contents, fileOptions);
    const p4Path = ctx.toP4Path(absolutePath);
    const addArgs = [];
    if (fileOptions.fileType) addArgs.push('-t', fileOptions.fileType);
    await p4.run('add', ...addArgs, p4Path);

    const change = await p4.fetchChange();
    change.Description = description;
    const results = await p4.runSubmit(change);

    return {
      absolutePath,
      p4Path,
      depotPath: ctx.depotPath(relativePath),
      change: change.Change,
      results,
    };
  };
  return ctx;
}

/** Stop a child process, tolerating a process that already exited. */
async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill();
  } catch {
    return;
  }
  await Promise.race([once(child, 'exit'), delay(5000)]).catch(() => {});
  if (child.exitCode === null && child.signalCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Best effort only.
    }
  }
}

/**
 * Run `fn` with a fresh isolated p4d and always tear it down.
 *
 * @template T
 * @param {(ctx: Awaited<ReturnType<typeof setupP4d>>) => Promise<T>} fn
 * @param {Parameters<typeof setupP4d>[0]} [options]
 * @returns {Promise<T>}
 */
export async function withP4d(fn, options = {}) {
  const ctx = await setupP4d(options);
  try {
    return await fn(ctx);
  } finally {
    await ctx.teardown();
  }
}
