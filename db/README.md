# Database design

`schema.sql` is a proposed PostgreSQL model, not a running database or a
migration. It separates imported payloads from curated relationships. The UI
still reads a separate local demonstration dataset, not this schema.

## Testing it

    npm run test:db

The tests load `schema.sql` into a real PostgreSQL engine and try the inserts
that must fail, and a few that must pass. No database server is installed:
`@electric-sql/pglite` runs PostgreSQL 18 compiled to WebAssembly in the test
process, so the rules below are checked by the engine and not by a parser. Each
test starts from an empty database, so no test depends on another's state.

Results on 2026-11-19: 38 tests, 38 pass, 0 fail.

## What the schema now enforces

- **Work hierarchy.** A film or a series has no parent; a season belongs to a
  series; an episode belongs to a season or a series. Parent cycles cannot occur
  because the formats only ever point downwards, so no recursive check is
  needed there (locations do need one, see below).
- **Episode counts.** Only a series or a season may carry `episode_count`.
- **Release dates.** A day requires a month, and the date must exist on the
  calendar: 31 February and 29 February outside a leap year are refused. An
  impossible date is refused while evaluating `make_date()`, so the engine
  raises SQLSTATE 22008 (datetime field overflow) rather than 23514. Month and
  day stay optional so no precision is invented.
- **Membership consistency.** A continuity membership requires franchise
  membership for the same work and franchise; two references on one row make
  that a declarative check, not a trigger.
- **Chronology.** An entry is only possible for a work inside that continuity,
  and both ends of a relation must live in the same continuity. `before` edges
  cannot close a cycle.
- **Locations.** A free-form hierarchy, so its cycle check is a recursive
  trigger.
- **Single primary narrative period** per work, by partial unique index.
- **Credits.** Only a cast credit may name a character.
- **Import payloads.** `(provider, external_id)` is unique; payloads are stored
  verbatim and never promoted to curated facts.
- **Saved views** must hold a JSON object.
- **Corporate structure.** `company_relationships` has a fixed vocabulary
  (`parent_company`, `division`, `joint_venture`) and parent claims cannot form a
  cycle, checked by a recursive trigger.
- **Franchise/company claims** live in their own table with a kind and optional
  validity dates; they are not production or distribution credits, which stay in
  `work_companies`.
- **Viewer preferences** accept only the languages, themes, calendars and
  timeline spacings the UI implements, one row per viewer key.
- **Posters** record provenance. A TMDB poster must carry a provider path and an
  expiry after the cache time; a local poster must not expire. One poster per
  work.
- **Lookup indexes** on the foreign keys the views will follow.

## What no constraint can decide

Editorial judgement stays a review task: whether two sources are independent,
whether a chronology is really "confirmed", whether a position is meaningful, or
whether `episode_count` matches the episodes actually recorded. The
`claims_without_source` view surfaces the first of these — every curated claim
that carries no source — without pretending to enforce it.

Still missing on purpose or pending: users, roles and row-level security; a
migration tool; an import pipeline that fills `imported_metadata`; and any
reconciliation between `episode_count` and the episodes actually recorded. The
poster expiry rule records when a provider cache must be discarded but cannot
delete the file. Nothing here has been applied to a deployed database, and no
data in this repository is publishable.
