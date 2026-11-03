# Third-party notices

p4js is a Node.js native binding to the Perforce (P4) C++ API. It is not
affiliated with Perforce Software, Inc. "Perforce" and "P4" are trademarks of
Perforce Software, Inc.

## Perforce P4 C++ API

The build downloads the Perforce P4 C++ API SDK at build time from
<https://ftp.perforce.com/perforce/>. The SDK is **not** redistributed in this
repository or in the source tree. Its use is governed by the license shipped
with the SDK (see `third_party/p4api/` after `npm run setup`).

## p4go

Parts of the native layer were adapted from the language-neutral C++ core of
[p4go](https://github.com/perforce/p4go) (commit
`c16689a9e2fe80266244843fbdb73c4caf6a640d`, Perforce 2026.1).

- p4go is distributed under the MIT License (see its `LICENSE.txt`).
- Some p4go source files carry a BSD 3-Clause copyright header; those notices
  are retained in the adapted files under `src/native/`.
- The adapted code is **not** vendored verbatim: files were renamed, classes
  were renamed to the `P4Js*` prefix, cgo-specific glue was removed, callback
  plumbing was given explicit context pointers, asynchronous N-API workers and
  result conversion were added, and spec array handling was fixed to use
  P4API's indexed `StrDict` keys.

## p4python

API semantics (exception levels, spec convenience methods, input handling and
result shapes) were informed by
[p4python](https://github.com/perforce/p4python) (Perforce 2024.2, BSD
3-Clause). No p4python source is copied into this project.

## OpenSSL

The build links OpenSSL 3. On Windows, a prebuilt OpenSSL development package
is downloaded by `npm run setup` (or supplied with `P4SSL_ROOT`); on Linux and
macOS the system OpenSSL 3 is used. OpenSSL is licensed under the Apache
License 2.0 (see <https://www.openssl.org/source/license.html>).
