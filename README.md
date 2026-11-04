# p4js

[![CI](https://github.com/dayongxie/p4js/actions/workflows/ci.yml/badge.svg)](https://github.com/dayongxie/p4js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dayongxie/p4js.svg)](https://www.npmjs.com/package/@dayongxie/p4js)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/@dayongxie/p4js.svg)](https://www.npmjs.com/package/@dayongxie/p4js)

`p4js` 是 Perforce C++ API 的 Node.js 原生绑定（Node-API）。它提供与
`p4python` / `p4go` 同级的客户端能力：持久连接、`run()`、spec
fetch/save/parse/format、登录、提交、进度回调和取消。公共命令 API 全部返回
Promise，不提供 `runSync()` 之类的阻塞命令接口。

原生层在 `src/native/` 中自行维护，参考并移植了 p4go 的 C++ 核心逻辑（MIT /
BSD-3，见 `THIRD-PARTY-NOTICES.md`），但**不是**未修改的 vendor 目录：类名、文件
结构、回调上下文、异步模型和结果转换都按 p4js 的需要重写。

## 功能

- `connect()` / `disconnect()` / `run()` / `fetch()` / `save()` / `delete()`
- `fetchClient` / `saveClient` / `iterateChanges` 等 10 类 spec 便捷方法
- `parseSpec()` / `formatSpec()`（本地、离线，支持数组字段）
- `runSubmit` / `runShelve` / `deleteShelve` / `runLogin` / `runPassword` / `runTickets`
- `setProgress()` 进度回调、`cancel()` 取消
- `P4Map`（映射、翻译、反转、join）
- 异常等级（0/1/2）、`P4Error`、`errors` / `warnings` / `messages` / `trackOutput`

## 环境要求

- 只安装 npm 预编译包：Node.js >= 20，不需要编译器、P4API 或 OpenSSL
- 从源码构建：Windows 需要 Visual Studio 2022（MSVC）+ Python 3 + 7-Zip；
  Linux/macOS 需要 C++17 编译器 + OpenSSL 3 开发文件
- 测试：本地 `p4d`（`P4D_BIN` 可覆盖）

## 安装

普通使用直接从 npm 安装，包内已经包含 CI 构建好的四个平台预编译模块：

```bash
npm install @dayongxie/p4js
```

支持 `win32-x64`、`linux-x64`、`darwin-x64`、`darwin-arm64`。Windows 预编译包含
OpenSSL 3.5.9 的 `libssl-3-x64.dll` / `libcrypto-3-x64.dll`；macOS 预编译静态链接
OpenSSL，不依赖 Homebrew 路径。安装后无需 Visual Studio、P4API 或 OpenSSL。

**Git 仓库本身不保存预编译二进制**（`prebuilds/` 已加入 `.gitignore`）。这些文件由
`.github/workflows/prebuild.yml` 在 CI 中从 tag commit 构建，再汇总到 npm 包；
这样仓库保持 source-only，npm 包仍然开箱即用。Git 历史也已用
`git filter-repo` 清理，所有提交中都不再包含 `prebuilds/`，普通 clone 不会拉取二进制。

## 从源码构建

从 Git clone 的源码不包含预编译模块，需要自行构建：

```bash
npm ci
npm run setup     # 下载 P4API SDK（Windows 同时下载 OpenSSL 开发包）
npm run build     # node-gyp + tsc，产物在 dist/
npm run prebuild  # 可选：生成当前平台的 prebuilds/<platform>-<arch>/
```

`npm run prebuild` 会写入 `prebuilds/<platform>-<arch>/manifest.json`（平台、
架构、N-API 版本、P4API/OpenSSL 版本、git commit）。预编译模块使用 N-API 8，
因此同一平台的 Node.js >= 20 可共用，无需按 Node ABI 重新编译。

Windows 上如果已有 OpenSSL 3 开发目录，可以跳过下载：

```powershell
node scripts/setup-sdk.mjs --openssl-from "C:\Program Files\PostgreSQL\17"
# 或设置 P4SSL_ROOT 后直接 npm run setup
```

`npm run setup` 会下载 P4API 2026.1（`p4api_vs2022_static_openssl3.zip`）和
OpenSSL 3.5.x 到 `third_party/`，该目录已被 `.gitignore` 排除。Windows 上如果
7-Zip 无法直接解包 OpenSSL 安装器，脚本会自动下载并使用 `innoextract`；也可以
用 `--openssl-from` 指向本机已有的 OpenSSL 3 开发目录。

### macOS（Intel / Apple Silicon）

npm 包内已包含 `darwin-x64` 和 `darwin-arm64` 两个预编译模块，普通
`npm install` 后可直接使用。它们由 CI 在 `macos-15-intel`（x64）和
`macos-14`（arm64）上构建，静态链接 OpenSSL，`MACOSX_DEPLOYMENT_TARGET` 为 12.0。

需要从源码重新构建时：

```bash
brew install openssl@3
npm install
npm run setup     # 按 process.arch 下载 x86_64/arm64 的 P4API，并复制 Homebrew OpenSSL
npm run build
npm run prebuild
```

`setup-sdk.mjs` 在 macOS 上会优先使用 `brew --prefix openssl@3`，也支持
`P4SSL_ROOT` 指向其他 OpenSSL 3 安装目录。

## 快速开始

```js
import { P4, P4Error } from '@dayongxie/p4js';

const p4 = new P4({
  port: process.env.P4PORT,
  user: process.env.P4USER,
  client: process.env.P4CLIENT,
  charset: 'utf8',
});

await p4.connect();
try {
  const info = await p4.run('info');
  console.log(info[0].serverAddress);

  const client = await p4.fetchClient();
  client.Description = 'updated by p4js';
  await p4.saveClient(client);

  const changes = await p4.run('changes', '-m', '5');
  console.log(changes);
} finally {
  await p4.disconnect();
}
```

提交一个已打开的文件：

```js
await p4.run('edit', 'C:\\workspace\\file.txt');
const change = await p4.fetchChange();      // 包含 Change: new 与 Files
change.Description = 'p4js: update file';
await p4.runSubmit(change);
```

进度与取消：

```js
p4.setProgress({
  init: (type) => console.log('progress', type),
  setDescription: (text, units) => console.log(text, units),
  setTotal: (total) => console.log('total', total),
  update: (position) => console.log('at', position),
  done: (fail) => console.log('done', fail),
});

const running = p4.run('sync', '-f', '//depot/...');
setTimeout(() => p4.cancel(), 50);
try { await running; } catch (error) {
  if (error instanceof P4Error && error.cancelled) console.log('cancelled');
}
```

## API 摘要

- **属性（同步）**：`port`、`user`、`client`、`password`、`charset`、`cwd`、
  `host`、`ticketFile`、`trustFile`、`ignoreFile`、`language`、`apiLevel`、
  `streams`、`tagged`、`track`、`graph`、`debug`、`prog`、`version`、
  `maxResults`、`maxScanRows`、`maxLockTime`、`envinroFile`、
  `exceptionLevel`；只读 `connected`、`configFile`。
- **异步命令**：`connect`、`disconnect`、`run`、`fetch`、`save`、`delete`、
  `iterate`、`runSubmit`、`runShelve`、`deleteShelve`、`runLogin`、
  `runPassword`、`runTickets`、`getServerLevel`、`getServerUnicode`、
  `getServerCaseInsensitive`，以及 `fetchClient` / `saveClient` 等 spec 方法。
- **本地同步**：`parseSpec`、`formatSpec`、`isIgnored`、`env`、`setEnv`、
  `protocol`、`setProtocol`、`setProgress`、`cancel`、`P4Map`。

### 输入

`p4.input` 支持字符串、字符串数组或 spec 对象。对象需要能确定 spec 类型：

```js
p4.input = { Change: 'new', Description: '...' };
p4.inputSpec = 'change';   // 可选；runSubmit 等会自动推导
await p4.run('change', '-i');
```

`runSubmit(changeSpec)` / `runShelve(changeSpec)` 会自动把对象格式化为
change spec 并追加 `-i`。命令行无法推导类型时，请显式设置 `inputSpec` 或改用
`save(type, spec)`。

### 错误

`exceptionLevel` 默认是 `2`（与 p4python 一致）：有 error 或 warning 时抛出
`P4Error`。设为 `0` 时命令正常 resolve，错误保存在 `p4.errors` / `p4.warnings`。
`P4Error` 携带 `errors`、`warnings`、`messages`、`results`、`command`、
`cancelled`。

## 测试

```bash
npm test                 # 构建 + 单元测试 + 集成测试（自动寻找 p4d）
P4D_BIN=C:\path\p4d.exe npm test
npm run test:unit
npm run test:integration
```

集成测试使用 `test/tmp/` 下的隔离 p4d（默认 RSH 模式，取消测试使用 TCP），
不会连接真实服务器。没有 p4d 时相关用例会 skip。

## 限制（v0.1）

- 仅异步命令 API；本地辅助方法保持同步。
- 尚未暴露流式 output handler、交互式 resolve/merge、SSO、FileSysBuffer、
  DVCS `init/clone`、`tempClient`。
- 进度回调在主线程执行；请保持回调快速，且不要在回调里调用 p4js 的原生命令。
- 同一实例的异步操作串行执行；进程内 P4API 调用使用全局互斥锁（v0.1 保守策略）。
- npm 包内含 Windows x64、Linux x64、macOS x64/arm64 预编译二进制；Git 仓库不保存
  二进制，由发布 workflow 从 tag commit 构建后汇总进 npm 包。

## 发布到 npmjs

npm 包名为 **`@dayongxie/p4js`**（`p4js` 这个 unscoped 名称已被其他维护者占用）。
发布使用 npm **Trusted Publishing (OIDC) + Staged Publishing**，不需要 `NPM_TOKEN`。
在 npmjs.com 的包设置中配置：

- Publisher: GitHub
- Repository: `dayongxie/p4js`
- Workflow: `publish.yml`
- Environment: 留空（如果填了，需要 workflow 里使用同名 environment）
- Allowed actions: 只保留默认的 **npm stage publish** 即可，不需要 `npm publish`

推送 `v*` tag 会触发 [.github/workflows/publish.yml](.github/workflows/publish.yml)：

1. 复用 [.github/workflows/prebuild.yml](.github/workflows/prebuild.yml) 的 matrix，
   在 `windows-2022`、`ubuntu-latest`、`macos-15-intel`、`macos-14` 上从同一个 tag
   commit 构建四个平台的 prebuilds，并上传 artifact。
2. `stage` job 下载全部 artifact 到 `prebuilds/`，执行 `tsc` 和
   `scripts/check-publish.mjs`，然后用 Node 24（npm >= 11.5.1）和
   `id-token: write` 获取 OIDC token，执行 `npm stage publish --access public`。

staged 版本不会立即公开，需要维护者审批：

```bash
npm stage list @dayongxie/p4js        # 查看待审批的 stage
npm stage approve <stage-id>          # 本机登录 + 2FA 后批准
```

`npm stage` 需要较新的 npm（建议 `npm install -g npm@latest`；例如 npm 11.12.1
还没有该命令）。Trusted Publishing 本身的最低要求是 npm 11.5.1；也可以直接使用
npmjs.com 网页审批。

也可以直接在 npmjs.com 的包页面 → **Versions / Staged** 中点击 approve。批准后
版本才会正式发布并更新 `latest` / `next` dist-tag。

发版流程：

```bash
npm version patch        # 或 minor / major
git push --follow-tags   # 推送 commit 和 vX.Y.Z tag
```

`check-publish.mjs` 会检查 `dist/`、四个平台的 prebuilds 以及 tag 与
`package.json.version` 是否一致。仓库公开时 workflow 会自动给 staged publish
加上 `--provenance`；私有仓库则跳过。如果 npm 的 trusted publisher 连接不允许
stage publish，需要删除旧连接后重新添加。

本地直接 `npm publish` 通常不可行：`prepublishOnly` 会检查四个平台的 prebuilds，
而本地一般只有当前平台的产物；发布请统一走 tag + CI 流程。Git 历史已经清理，
不再包含任何 `prebuilds/` 二进制。

## 贡献

开发和提交说明见
[CONTRIBUTING.md](https://github.com/dayongxie/p4js/blob/master/CONTRIBUTING.md)。
安全问题请按
[SECURITY.md](https://github.com/dayongxie/p4js/blob/master/SECURITY.md) 私下报告，
不要开公开 issue。

## 许可

MIT。第三方组件与移植来源见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
