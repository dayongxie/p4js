# Upstream notes

p4js does not vendor p4go. The native layer was adapted from the p4go C++ core
at commit `c16689a9e2fe80266244843fbdb73c4caf6a640d` (Perforce 2026.1, MIT
license; some files carry a BSD 3-Clause header, retained in the source).

## Adapted files

| p4js file | p4go origin |
|---|---|
| `src/native/p4_client_api.*` | `p4goclientapi.*` |
| `src/native/p4_client_user.*` | `p4goclientuser.*` |
| `src/native/p4_results.*` | `p4goresult.*` |
| `src/native/p4_spec_mgr.*` | `p4gospecmgr.*` |
| `src/native/p4_spec_data.*` | `p4gospecdata.*` |
| `src/native/p4_merge_data.*` | `p4gomergedata.*` |
| `src/native/p4js_p4.h` | new central include point for P4 headers (several p4 headers have no include guards) |
| `src/native/p4_map.*`, `p4_map_node.*` | new Node-API wrapper over MapApi |
| `src/native/p4_node.*`, `convert.*`, `addon.cc` | new Node-API bridge and result conversion |

## Deliberate differences

1. **No cgo C ABI.** p4go's `p4go.cpp/.h` and `p4gocallback.cpp` are not
   carried over. The bridge calls the adapted C++ classes directly.
2. **No global callback table.** `P4JsProgress`, `P4JsKeepAlive`,
   `P4JsHandler` and related classes take an explicit `void* context` and pass
   it to callbacks instead of using `this`.
3. **Async N-API.** Commands run in `Napi::AsyncWorker`; a process-wide mutex
   serializes P4API calls and a per-instance atomic flag prevents re-entrant
   configuration changes.
4. **Result conversion in the bridge.** The C ABI's `malloc`/`free` result
   accessors are replaced by direct `P4JsResults` traversal and JS object
   construction on the main thread.
5. **Progress TSFN.** Progress events are posted to the main thread and the
   worker waits for the handler, preserving ordering relative to `run()`.
6. **Spec arrays.** p4go's `P4JsSpecData` stored array items under
   `Field[0]`; the `StrDict` convention used by `SpecDataTable` is `Field0`.
   The adapted implementation uses `StrDict::GetVar(tag, index)` /
   `SetVar(tag, index, value)`.
7. **Built-in spec table.** The 2026.1 `speclist` data is retained (it is data,
   not logic) and is updated whenever the vendored p4go commit changes.

## Updating the adaptation

When moving to a newer p4go release:

1. Diff the adapted files against the new p4go versions.
2. Keep the p4js class names and context-pointer changes.
3. Re-check the `speclist` data and the `CreateProgress(int, P4INT64)`
   overload.
4. Run `npm test` on Windows and the Linux CI workflow.
