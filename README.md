# p4js

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

- Node.js >= 20（开发验证使用 Node 24）
- Windows：Visual Studio 2022（MSVC）+ Python 3 + 7-Zip
- Linux/macOS：C++17 编译器 + OpenSSL 3 开发文件
- 测试：本地 `p4d`（`P4D_BIN` 可覆盖）

## 构建

```bash
npm install
npm run setup     # 下载 P4API SDK（Windows 同时下载 OpenSSL 开发包）
npm run build     # node-gyp + tsc，产物在 dist/
```

Windows 上如果已有 OpenSSL 3 开发目录，可以跳过下载：

```powershell
node scripts/setup-sdk.mjs --openssl-from "C:\Program Files\PostgreSQL\17"
# 或设置 P4SSL_ROOT 后直接 npm run setup
```

`npm run setup` 会下载 P4API 2026.1（`p4api_vs2022_static_openssl3.zip`）和
OpenSSL 3.5.x 到 `third_party/`，该目录已被 `.gitignore` 排除。

## 快速开始

```js
import { P4, P4Error } from 'p4js';

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
- 不发布预编译二进制；每个平台需要本地构建。

## 许可

MIT。第三方组件与移植来源见 `THIRD-PARTY-NOTICES.md`。
