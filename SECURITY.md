# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private vulnerability reporting:

<https://github.com/dayongxie/p4js/security/advisories/new>

Include as much of the following as possible:

- p4js version (`npm ls @dayongxie/p4js`)
- operating system and CPU architecture
- Node.js version
- Perforce server version and connection mode (plain TLS / no TLS)
- minimal reproduction steps or a small test case
- relevant logs with credentials, tickets and depot paths removed

We will acknowledge the report, investigate, and coordinate a fix and disclosure
timeline with you.

## Scope

This policy covers the p4js JavaScript API, the native addon, and the build and
release scripts in this repository.

Issues in Perforce software, the P4 C++ API, OpenSSL, or Node.js itself should
be reported to their respective maintainers.

The test suite starts a throw-away local `p4d` instance and uses a fixed
test-only password. It must never be used with production Perforce credentials.
