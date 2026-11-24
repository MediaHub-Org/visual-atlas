# Journal - Visual Atlas

Newest first. The live state is in [`HANDOFF.md`](HANDOFF.md).

## 2026-11-24

- **In-world chronology pilot (Star Wars).** Spec and plan under
  `docs/superpowers/`. Strict parser for Wookieepedia's `canon_timeline`/`timeline`
  (`scripts/chronology/wookieepedia.mjs`), reviewed page map, fetcher and the committed
  data file; migration 004 and a fourth import pass; `src/chronology.ts` (pure helpers);
  detail-panel dates with attribution and a Calendar axis in the in-universe view.
- Also today: sequences imported as `unknown` editorial proposals (migration 003) and
  labelled in the UI; TMDB credits (director, writer/creator, cast) with a person filter;
  «Open the full order» from a work's card.

## 2026-11-23

- **Relations and claims import, second pass.** Migration
  `002_relations_and_claims.sql`: `seed_key` and full review state on
  `continuities` and `company_relationships`; `membership_type` on both membership
  joins; draft state on `work_tags`.
- `db/import.mjs` adds continuities, memberships (a row without `continuity_id`
  writes only the franchise membership), franchise/company associations, company
  claims (subject = parent, object = child) and work/tag links. Natural keys make
  the joins idempotent; reviewed rows are frozen; the claim cycle trigger still
  applies.
- Local run: 141 continuities, 855 franchise memberships, 836 continuity
  memberships, 206 franchise/company associations, 26 claims, 92 work/tag links,
  2,413 payloads, all `needs_review`. `npm test` 51/51, `npm run build` green.
- Sequences and chronology stay out: the seed's `editorial_proposal` certainty
  needs the owner's mapping rule; no position or relation is invented.

## 2026-11-22

- **Import first pass implemented**, after the owner approved the plan's defaults.
  Migration `001_review_and_seed_key.sql`: `seed_key` (unique, partial index) and
  `review_status`/`reviewed_at`/`reviewed_by` on sources, companies, franchises,
  works and tags, plus `review_status` on the four claim join tables; `reviewed`
  without a date is refused.
- `db/migrate.mjs`: schema + migrations in name order, one transaction each,
  checksums in `schema_migrations`, a changed file is an error. `db/.data` ignored.
- `db/import.mjs`: five entities in one transaction, upsert by `seed_key`, reviewed
  rows frozen, every row's original JSON kept in `imported_metadata`, `--dry-run`
  rolls back, an unmapped seed section aborts.
- Tests: 9 import tests (migration idempotence, review defaults, curated title
  preserved, rollback on a bad row, claims stay empty, unknown section refused,
  dry run) next to the 38 schema tests. `npm test` 47/47.
- Local run: 1 source, 84 companies, 73 franchises, 909 works, 13 tags, 1,080
  payloads, all `needs_review`.
- Relations and claims stay out: they need their own mapping and review path.
- No remote; nothing published, nothing applied outside `db/.data`.

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

## 2026-11-24 - text media pilot
- Added the Video | Text catalogue switch, text formats and adaptation links (migration 005), a separate text seed with 13 pilot titles, a pure `src/medium.ts`, and a local AniList / Comic Vine enrichment script with attribution and cache rules matching the TMDB ones.
- Browser-verified: manga <-> anime links both ways, standalone titles show "No adaptation in the atlas". Tests: db 82, ui 75.
