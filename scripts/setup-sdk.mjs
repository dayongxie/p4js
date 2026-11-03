#!/usr/bin/env node
// Download and unpack the Perforce C++ API and OpenSSL development files.
//
// Usage:
//   node scripts/setup-sdk.mjs
//   node scripts/setup-sdk.mjs --openssl-from "C:\Program Files\PostgreSQL\17"
//
// Environment overrides:
//   P4API_URL / P4SSL_URL   override download URLs
//   P4API_ROOT / P4SSL_ROOT override destination directories

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = path.resolve(import.meta.dirname, '..');
const thirdParty = path.join(root, 'third_party');
const downloads = path.join(thirdParty, 'downloads');
const p4apiDir = path.resolve(process.env.P4API_ROOT || path.join(thirdParty, 'p4api'));
const p4sslDir = path.resolve(process.env.P4SSL_ROOT || path.join(thirdParty, 'openssl'));

const P4API_VERSION = 'r26.1';
const P4API_WIN_URL =
  process.env.P4API_URL ||
  `https://ftp.perforce.com/perforce/${P4API_VERSION}/bin.ntx64/p4api_vs2022_static_openssl3.zip`;
const P4API_LINUX_URL =
  process.env.P4API_URL ||
  `https://ftp.perforce.com/perforce/${P4API_VERSION}/bin.linux26x86_64/p4api-glibc2.12-openssl3.tgz`;
const P4API_MAC_URL =
  process.env.P4API_URL ||
  `https://ftp.perforce.com/perforce/${P4API_VERSION}/bin.macosx12u/p4api-openssl3.tgz`;
const P4SSL_WIN_URL =
  process.env.P4SSL_URL || 'https://slproweb.com/download/Win64OpenSSL-3_5_9.exe';
const INNOEXTRACT_URL =
  process.env.INNOEXTRACT_URL ||
  'https://github.com/dscharrer/innoextract/releases/download/1.9/innoextract-1.9-windows.zip';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function log(message) {
  console.log(`[setup-sdk] ${message}`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile() && fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

function find7z() {
  const candidates = [
    process.env.SEVEN_ZIP,
    '7z',
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['i'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error('7-Zip not found. Install 7-Zip or set SEVEN_ZIP to 7z.exe.');
}

function walk(dir, visit) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

function findOne(dir, predicate) {
  let found;
  walk(dir, (file) => {
    if (!found && predicate(file)) found = file;
  });
  return found;
}

function copyFile(source, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(source, dest);
}

function copyDir(source, dest) {
  if (!fs.existsSync(source)) return;
  ensureDir(dest);
  fs.cpSync(source, dest, { recursive: true, force: true });
}

async function download(url, dest) {
  if (isFile(dest)) {
    log(`using cached ${path.basename(dest)}`);
    return dest;
  }
  log(`downloading ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`download failed: HTTP ${response.status} ${url}`);
  }
  ensureDir(path.dirname(dest));
  const partial = `${dest}.part`;
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
  fs.renameSync(partial, dest);
  log(`downloaded ${path.basename(dest)} (${fs.statSync(dest).size} bytes)`);
  return dest;
}

function extractZip(archive, dest) {
  const sevenZip = find7z();
  ensureDir(dest);
  log(`extracting ${path.basename(archive)}`);
  execFileSync(sevenZip, ['x', '-y', `-o${dest}`, archive], { stdio: 'inherit' });
}

function extractTarGz(archive, dest) {
  ensureDir(dest);
  log(`extracting ${path.basename(archive)}`);
  execFileSync('tar', ['-xzf', archive, '-C', dest], { stdio: 'inherit' });
}

function installP4ApiWindows() {
  const archive = path.join(downloads, 'p4api_vs2022_static_openssl3.zip');
  const extractDir = path.join(downloads, 'p4api-win-extract');
  const marker = path.join(p4apiDir, 'include', 'p4', 'clientapi.h');
  if (isFile(marker)) {
    log(`P4API already available at ${p4apiDir}`);
    return;
  }
  if (!isFile(archive)) {
    throw new Error(`P4API archive not found: ${archive}`);
  }
  fs.rmSync(extractDir, { recursive: true, force: true });
  extractZip(archive, extractDir);
  const clientapi = findOne(extractDir, (file) =>
    file.replace(/\\/g, '/').endsWith('/include/p4/clientapi.h'),
  );
  if (!clientapi) throw new Error('cannot find include/p4/clientapi.h in P4API archive');
  const sourceRoot = path.resolve(path.dirname(clientapi), '..', '..');
  log(`installing P4API from ${sourceRoot}`);
  copyDir(path.join(sourceRoot, 'include'), path.join(p4apiDir, 'include'));
  copyDir(path.join(sourceRoot, 'lib'), path.join(p4apiDir, 'lib'));
  for (const name of ['Version', 'LICENSE', 'README']) {
    const file = path.join(sourceRoot, name);
    if (fs.existsSync(file)) copyFile(file, path.join(p4apiDir, name));
  }
}

function installP4ApiUnix(archiveUrl, archiveName) {
  const marker = path.join(p4apiDir, 'include', 'p4', 'clientapi.h');
  if (isFile(marker)) {
    log(`P4API already available at ${p4apiDir}`);
    return;
  }
  const archive = path.join(downloads, archiveName);
  if (!isFile(archive)) throw new Error(`P4API archive not found: ${archive}`);
  const extractDir = path.join(downloads, 'p4api-unix-extract');
  fs.rmSync(extractDir, { recursive: true, force: true });
  extractTarGz(archive, extractDir);
  const clientapi = findOne(extractDir, (file) =>
    file.replace(/\\/g, '/').endsWith('/include/p4/clientapi.h'),
  );
  if (!clientapi) throw new Error('cannot find include/p4/clientapi.h in P4API archive');
  const sourceRoot = path.resolve(path.dirname(clientapi), '..', '..');
  copyDir(path.join(sourceRoot, 'include'), path.join(p4apiDir, 'include'));
  copyDir(path.join(sourceRoot, 'lib'), path.join(p4apiDir, 'lib'));
  for (const name of ['Version', 'LICENSE', 'README']) {
    const file = path.join(sourceRoot, name);
    if (fs.existsSync(file)) copyFile(file, path.join(p4apiDir, name));
  }
}

function findInnoExtract() {
  const toolDir = path.join(downloads, 'innoextract');
  const existing = findOne(toolDir, (file) => path.basename(file).toLowerCase() === 'innoextract.exe');
  if (existing) return existing;

  const archive = path.join(downloads, 'innoextract.zip');
  if (!isFile(archive)) return undefined;
  const sevenZip = find7z();
  ensureDir(toolDir);
  log('extracting innoextract');
  execFileSync(sevenZip, ['x', '-y', `-o${toolDir}`, archive], { stdio: 'inherit' });
  return findOne(toolDir, (file) => path.basename(file).toLowerCase() === 'innoextract.exe');
}

async function downloadInnoExtract() {
  const archive = path.join(downloads, 'innoextract.zip');
  await download(INNOEXTRACT_URL, archive);
  return findInnoExtract();
}

async function installOpenSsl(opensslFrom) {
  const marker = path.join(p4sslDir, 'include', 'openssl', 'opensslv.h');
  if (isFile(marker)) {
    log(`OpenSSL already available at ${p4sslDir}`);
    return;
  }

  let sourceRoot;
  if (opensslFrom) {
    sourceRoot = path.resolve(opensslFrom);
    if (!isFile(path.join(sourceRoot, 'include', 'openssl', 'opensslv.h'))) {
      throw new Error(`--openssl-from ${sourceRoot} does not contain include/openssl/opensslv.h`);
    }
    log(`copying OpenSSL from ${sourceRoot}`);
  } else {
    const archive = path.join(downloads, 'Win64OpenSSL.exe');
    const extractDir = path.join(downloads, 'openssl-extract');
    if (!isFile(archive)) throw new Error(`OpenSSL archive not found: ${archive}`);
    fs.rmSync(extractDir, { recursive: true, force: true });

    let header;
    try {
      extractZip(archive, extractDir);
      header = findOne(extractDir, (file) =>
        file.replace(/\\/g, '/').endsWith('/include/openssl/opensslv.h'),
      );
    } catch (error) {
      log(`7-Zip could not extract the OpenSSL installer (${error.message})`);
    }

    if (!header) {
      log('retrying OpenSSL extraction with innoextract');
      let innoextract = findInnoExtract();
      if (!innoextract) innoextract = await downloadInnoExtract();
      if (!innoextract) {
        throw new Error(
          'cannot extract the OpenSSL installer; install 7-Zip and innoextract, or pass --openssl-from <dir>',
        );
      }
      fs.rmSync(extractDir, { recursive: true, force: true });
      ensureDir(extractDir);
      execFileSync(innoextract, ['-e', '-d', extractDir, archive], { stdio: 'inherit' });
      header = findOne(extractDir, (file) =>
        file.replace(/\\/g, '/').endsWith('/include/openssl/opensslv.h'),
      );
    }

    if (!header) throw new Error('cannot find include/openssl/opensslv.h in OpenSSL package');
    sourceRoot = path.resolve(path.dirname(header), '..', '..');
    log(`installing OpenSSL from ${sourceRoot}`);
  }

  // Copy the OpenSSL headers only (never unrelated include/ directories).
  copyDir(path.join(sourceRoot, 'include', 'openssl'), path.join(p4sslDir, 'include', 'openssl'));

  // Normalise the library layout: lib/libssl.lib + lib/libcrypto.lib.
  const sslLib = findOne(path.join(sourceRoot, 'lib'), (file) => /(^|[\\/])libssl\.lib$/i.test(file));
  const cryptoLib = findOne(path.join(sourceRoot, 'lib'), (file) => /(^|[\\/])libcrypto\.lib$/i.test(file));
  if (!sslLib || !cryptoLib) {
    throw new Error(`cannot find libssl.lib/libcrypto.lib under ${path.join(sourceRoot, 'lib')}`);
  }
  copyFile(sslLib, path.join(p4sslDir, 'lib', 'libssl.lib'));
  copyFile(cryptoLib, path.join(p4sslDir, 'lib', 'libcrypto.lib'));

  // Copy the matching runtime DLLs when present.
  for (const name of ['libssl-3-x64.dll', 'libcrypto-3-x64.dll', 'libssl-3.dll', 'libcrypto-3.dll']) {
    const dll = findOne(path.join(sourceRoot, 'bin'), (file) => path.basename(file).toLowerCase() === name);
    if (dll) copyFile(dll, path.join(p4sslDir, 'bin', name));
  }
}

async function main() {
  ensureDir(downloads);
  const opensslFrom = arg('--openssl-from');

  if (process.platform === 'win32') {
    const p4apiArchive = path.join(downloads, 'p4api_vs2022_static_openssl3.zip');
    await download(P4API_WIN_URL, p4apiArchive);
    installP4ApiWindows();

    if (!opensslFrom && !isFile(path.join(p4sslDir, 'include', 'openssl', 'opensslv.h'))) {
      const sslArchive = path.join(downloads, 'Win64OpenSSL.exe');
      await download(P4SSL_WIN_URL, sslArchive);
    }
    await installOpenSsl(opensslFrom);
  } else if (process.platform === 'linux') {
    const archive = path.join(downloads, 'p4api-glibc2.12-openssl3.tgz');
    await download(P4API_LINUX_URL, archive);
    installP4ApiUnix(P4API_LINUX_URL, 'p4api-glibc2.12-openssl3.tgz');
    if (process.env.P4SSL_ROOT) log(`using system OpenSSL at ${p4sslDir}`);
    else log('Linux: install OpenSSL 3 development files (libssl-dev) and set P4SSL_ROOT if needed');
  } else if (process.platform === 'darwin') {
    const archive = path.join(downloads, 'p4api-openssl3.tgz');
    await download(P4API_MAC_URL, archive);
    installP4ApiUnix(P4API_MAC_URL, 'p4api-openssl3.tgz');
    log('macOS: install OpenSSL 3 (brew install openssl@3) and set P4SSL_ROOT if needed');
  } else {
    throw new Error(`unsupported platform: ${process.platform}`);
  }

  log(`P4API: ${p4apiDir}`);
  log(`OpenSSL: ${p4sslDir}`);
  log('done');
}

main().catch((error) => {
  console.error(`[setup-sdk] ${error.stack || error.message}`);
  process.exit(1);
});
