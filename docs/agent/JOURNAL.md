# Journal - Visual Atlas

Newest first. The live state is in [`HANDOFF.md`](HANDOFF.md).

## 2026-11-22

- Import plan written, not implemented (`db/IMPORT.md`, linked from
  `db/README.md`). The seed cannot be copied into the schema as it stands: the
  string ids need a stable `seed_key`, and the schema has no review state, so a
  copy would turn `needs_review` claims into facts. The proposal adds a migration
  (`seed_key` + `review_status` + review audit columns), a small migration runner,
  an idempotent importer and four tests (double import, review defaults, rollback,
  curated fields preserved).
- Three decisions are the owner's before code: review vocabulary, claims in their
  own tables vs. review columns on the real ones, and the first-pass scope
  (sources, companies, franchises, works, tags).
- No schema change applied; `npm test` still 38/38.

## 2026-11-19

- Basics closed. TMDB terms (api-terms-of-use) checked and enforced in code:
  imported years now carry `expires` (150 days, shared with posters in
  `scripts/tmdb-cache.mjs`), the app ignores expired years and
  `fetch-metadata.mjs` re-fetches them; `public/data/tmdb_metadata.json` is no
  longer tracked (local cache); the build strips posters and that file from
  `dist/` (89 MB → 1.7 MB). The app no longer fails if the metadata file is
  missing. Vite 5 → 7.3.8 (fixes the esbuild dev-server advisory; `npm audit`
  0). README gained a "TMDB terms" section and lost stale lines; HANDOFF
  condensed to the current state. Build OK, `npm test` 38/38, app checked in a
  browser (871 posters, 92 imported years marked).
- Imported years: `scripts/fetch-metadata.mjs` filled first-air/release years for
  all 92 works the seed left year-less (69 from poster sidecars, the rest from
  search with title rules). The UI marks them with an asterisk and a note. A
  «Daredevil» rule first matched *Super Dave: Daredevil for Hire*; rules now
  require an exact title and a date, and it became *Marvel's Daredevil* (2015).
- Posters: 871 of 909 cached (~82 MB). `scripts/match.mjs` accepts an exact
  title, a contained title with exact year, an exact alternative title, a ±2-year
  window only for exact titles, the most popular of same-title duplicates, and
  refuses event/premiere titles; `scripts/title-rules.mjs` holds explicit
  overrides. Status endpoint caches its scan for 15 s.
- Sidebar collections (tags), tag filter in the URL and detail panel, "No poster
  yet" toggle, poster library status in settings.
- Company hierarchy (claims vs. direct studio associations), vertical timeline
  (equal/proportional/log), settings drawer (language, theme, base calendar,
  spacing). The seed loads at runtime (bundle ~1.24 MB → ~186 kB). Schema gained
  `franchise_companies`, `posters`, `viewer_preferences` and a company-cycle
  trigger: 38/38.

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
