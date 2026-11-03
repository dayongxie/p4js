# Native architecture

The native addon lives in `src/native/` and is built with Node-API
(`node-addon-api`). It is a p4js-owned adaptation of the language-neutral C++
core that p4go uses; see `docs/upstream-notes.md` for provenance.

## Layers

| Layer | Files | Responsibility |
|---|---|---|
| N-API surface | `addon.cc`, `p4_node.*`, `p4_map_node.*` | Object lifecycles, property dispatch, Promise workers, progress callbacks |
| Client wrapper | `p4_client_api.*`, `p4_client_user.*` | `ClientApi` configuration, command execution, `ClientUser` overrides |
| Results | `p4_results.*` | Ordered text/binary/stat/spec/track/message results |
| Specs | `p4_spec_mgr.*`, `p4_spec_data.*` | Built-in and server-provided specdefs, parse/format |
| Conversion | `convert.*` | `StrDict`/`SpecData` ↔ JS objects, message extraction, envelope |
| Map | `p4_map.*`, `p4_map_node.*` | `MapApi` wrapper |

## Threading model

`ClientApi` is blocking, so every server operation runs in a
`Napi::AsyncWorker` on the libuv thread pool and resolves a Promise. A
process-wide mutex serializes `Connect`/`Disconnect`/`Run` calls across
instances for v0.1; this is deliberately conservative because P4API has
process-global state. Each instance also has an atomic `busy` flag: changing
configuration while an operation is in flight throws.

The JS wrapper keeps a per-instance promise queue so calls made from JS are
serialized before they reach the native layer.

## Progress and cancellation

`setProgress(obj)` creates a `P4JsProgress` object and a
`napi_threadsafe_function`. P4API calls the progress callbacks on the worker
thread; each event is posted to the main thread and the worker waits until the
JS handler has run. This guarantees `init → setDescription/setTotal →
update → done` order and ensures progress is delivered before `run()`
resolves.

Progress handlers run on the main thread and must be fast. Do not call p4js
server operations from inside a progress handler; the native layer rejects
re-entrant configuration/command calls. `cancel()` is safe: it flips an atomic
flag consumed by `KeepAlive::IsAlive`, so the current command is aborted at the
next poll.

## Result conversion

- `OutputInfo`/`OutputText` → strings.
- `OutputBinary` → `Buffer`.
- `OutputStat` → `StrDict` copy; keys such as `Field0`, `Field1` or
  `Field[0]` are grouped into arrays.
- Spec results (`specdef` present) are parsed through P4API `Spec` and
  `SpecDataTable` and returned as JS objects with array fields.
- Errors are split by severity: 0/1 become text results, 2 warnings, 3/4
  errors; structured messages are returned separately.

The JS layer turns the envelope into `P4Result[]`, updates the last-command
state (`errors`, `warnings`, `messages`, `trackOutput`) and throws `P4Error`
according to `exceptionLevel`.

## Specs

`P4JsSpecMgr` starts with the built-in specdefs adapted from p4go (Perforce
2026.1) and learns server-provided `specdef` values from spec command output.
`parseSpec()`/`formatSpec()` are local, synchronous operations. Array fields
are written with indexed `StrDict` keys (the same convention as `StrDict`'s
`SetVar(tag, index, value)`), which is what `SpecDataTable::GetLine` expects.

## Lifetime

An `AsyncWorker` holds a persistent reference to the JS `P4` object, so the
instance cannot be collected while a command is pending. The progress TSFN and
progress object are released when `setProgress(null)` is called or the instance
is destroyed. The instance destructor runs only after all workers have
completed.
