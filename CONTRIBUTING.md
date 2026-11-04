# Contributing to p4js

Thanks for taking the time to contribute. Bug reports, documentation fixes and
pull requests are welcome.

## Development setup

Requirements:

- Node.js 20 or newer
- Windows: Visual Studio 2022 (MSVC), Python 3 and 7-Zip
- Linux/macOS: a C++17 compiler and OpenSSL 3 development headers
- `p4d` for the integration tests (`P4D_BIN` can point at it)

```bash
npm ci
npm run setup      # download the Perforce C++ API SDK
npm run build      # node-gyp + tsc
npm test           # unit + integration tests (starts an isolated p4d)
```

Useful commands:

```bash
npm run typecheck
npm run test:unit
npm run test:integration
P4D_BIN=C:\path\to\p4d.exe npm test
```

## Pull requests

- Keep changes focused and explain the motivation in the PR description.
- Add or update tests when behavior changes.
- Run `npm run typecheck` and `npm test` before submitting.
- Do not commit `prebuilds/`, `dist/`, `build/`, `third_party/` or
  `test/tmp/`; they are generated or downloaded.
- Do not commit credentials, Perforce tickets, `.npmrc` files or npm tokens.
- Native changes must keep the public API asynchronous: no blocking server
  commands on the main thread.

## Native layer

The native layer lives in `src/native/` and uses Node-API. It is maintained in
this repository; parts were adapted from p4go. See
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for attribution and licensing.

## Release process

Releases are built by GitHub Actions from a `v*` tag:

1. Bump the version and push the commit and tag.
2. CI builds Windows, Linux and macOS prebuilds from that exact tag.
3. The package is staged on npm and a maintainer approves it with 2FA.

Do not publish from a local checkout; local builds normally contain only one
platform's native binary.

## License

By contributing you agree that your contributions are licensed under the MIT
License, the same license as this project.
