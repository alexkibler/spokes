# Paper Peloton — Ideas & Future Work

A running list of things worth building eventually.

---

## Save System

- **Save migration**: When `SCHEMA_VERSION` bumps, transform the old save into the new
  shape rather than discarding it. Implement a migration table keyed by `(fromVersion, toVersion)`
  in `SaveService.ts`. Each migration step is a pure function
  `(old: SerializedRunDataVN) => SerializedRunDataVN1`. Chain steps for multi-version jumps.
  Until this exists, players with stale saves are shown the "SAVE INCOMPATIBLE" notice and
  must start a new run.

---
