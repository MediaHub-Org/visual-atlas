# Journal — Visual Atlas

Newest first. The live state is in [`HANDOFF.md`](HANDOFF.md).

## 2026-11-18

- Proposed PostgreSQL schema hardened: work hierarchy and parent formats,
  episode counts only on containers, real calendar dates including leap days,
  franchise-consistent continuity membership, chronology confined to one
  continuity with no `before` cycles, one primary narrative period per work,
  character names only on cast credits, unique provider identifiers, object-only
  saved views, and lookup indexes on the foreign keys.
- Probe first showed 11 invariants that the original schema accepted silently
  (episode under a film, 31 February, reverse chronology, cross-franchise
  membership, two primary periods, location cycle, among others).
- Database-level tests added in `db/test/schema.test.mjs`, run with
  `npm run test:db` against PostgreSQL 18 in WebAssembly (`@electric-sql/pglite`).
  30 tests, 30 pass, 0 fail. No server installed and no database created.
- `claims_without_source` view added so unsourced claims are visible; source
  independence and certainty remain editorial review, not constraints.
- Committed the previous session's pending work (escape key, schema proposal,
  moved-repository notes) after verifying the build; git identity set locally
  for this repository.
