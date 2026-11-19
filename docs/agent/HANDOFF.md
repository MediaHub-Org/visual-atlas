# Handoff

2026-11-19 — **Company hierarchy, vertical timeline and settings added; nothing verified.**

The frontend was restructured into `src/App.tsx` plus components. The seed now
loads at runtime from `public/data/media_atlas_seed.json` (bundle fell from
~1.24 MB to ~186 kB). New: parent-company accordions in the sidebar and the
hierarchy view (corporate claims vs. direct studio associations), a vertical
release timeline with equal/proportional/log spacing that uses the row width,
and a settings drawer for language (en/es), theme (dark/light/system), base
calendar and default timeline spacing, persisted in `localStorage`.

The base calendar is presentation only. The converter refuses year-only data,
rejects impossible dates and offers Gregorian, Hebrew and three named Islamic
variants via `Intl`. No year-only release is converted.

Posters: a TMDB key is now configured (ignored `.env`) and the backfill ran on
2026-11-19: **805 posters cached (~77 MB), 103 skipped** (96 unmatched, 8
ambiguous, 1 rejected). The matcher needs an exact normalised title or the seed
title contained in TMDB's with the exact year, a unique result, and refuses
event titles; `A New Hope` (TMDB: *Star Wars*), `The Fantastic Four` (TMDB uses
the digit 4), *Rocky*, *Mad Men*, *Lost* and *Chernobyl* remain manual. One
premiere match was downloaded before the rule existed and was deleted. The
in-app saver was exercised only for search, not for a confirmed save.
Free-text "Skydance → Paramount → Warner Bros." parent claims look wrong to a
human reader but are what the seed says; they are displayed as unverified claims
and should be reviewed before publication.

The sidebar now lists editorial collections (tags) besides companies, the tag
filter is in the URL and detail panel, and settings show how many posters are
stored locally and whether a key is configured. The status endpoint caches its
scan for 15 s so 800 sidecars are not re-read on every load.

Database: `franchise_companies`, `posters`, `viewer_preferences` and a
company-cycle trigger were added; `npm run test:db` passes 38/38. Still absent:
users/roles/RLS, migrations, the import pipeline, and any reconciliation of
`episode_count`.

2026-11-18 — **Proposed schema hardened and tested; still not applied anywhere.**

`db/schema.sql` gained the invariants that were missing: work hierarchy
(film/series root, season under series, episode under season or series), episode
counts only on containers, real calendar dates (31 February and 29 February
outside a leap year refused), franchise-consistent continuity membership,
chronology entries and relations kept inside one continuity with no `before`
cycles, single primary narrative period per work, character names only on cast
credits, unique provider identifiers, object-only saved views, and lookup
indexes on the foreign keys.

Those rules are exercised by `db/test/schema.test.mjs` (30 tests) against
PostgreSQL 18 compiled to WebAssembly (`@electric-sql/pglite`), not against a
parser. Run `npm run test:db`. Result on 2026-11-18: 30 pass, 0 fail. Each test
loads the schema into a fresh database. Impossible dates surface as SQLSTATE
22008 rather than 23514; still refused.

Deliberately still missing: users, roles and row-level security; a migration
tool; an import pipeline; any rule for `company_relationships`, whose free-text
`relationship` defeats a generic cycle check; and reconciliation between
`episode_count` and the episodes actually recorded. Editorial judgement (source
independence, certainty, meaningful positions) stays a review task; the
`claims_without_source` view only makes unsourced claims visible.

The frontend still reads `src/data.ts`, not this schema, and the demonstration
data remains unverified: do not publish it as a factual catalogue.

Build passed with `npm run build`; `npm audit --omit=dev` reported no
production vulnerabilities. The full install reported two development
dependency vulnerabilities; investigate upgrades before exposing dev tools.
`@electric-sql/pglite` is a development dependency only and is not part of the
built bundle.

Next: verify representative records with sources and licensing, then add the
import pipeline and migrations that would fill this model, and finally the
authenticated editorial workflows. Expand views and test usability.

The repository lives at `D:\Workspaces\David7ce-user\David7ce-code\web-app\visual-atlas`.
The schema has never been applied to a database; `db/README.md` records what is
enforced, what is policy, and what is still missing.

Imported `Downloads/media_atlas_seed.json` as a read-only provisional seed:
909 works, 73 franchise records, narrative proposals and many-to-many
memberships. No company associations are presented as ownership facts.
Missing dates stay unknown. The raw source is retained for review; it is not
publication-ready. Build passes, with a large bundle warning. Chronology,
records and inclusion rules still need independent verification.

Added company-association/franchise hierarchy, proportional release-year view,
and a standalone Gregorian-date converter (Gregorian, Hebrew and explicitly
selected Islamic variants using browser Intl). Company associations are not
production credits; no exact or fictional dates are inferred. Build passes and
the timeline was checked in a browser. Poster API/provider, licensing, protected
server-side credentials and curated identity matching are still pending.

Local-only TMDB poster adapter added to Vite: key comes from ignored `.env`,
user searches and confirms each match; image and provenance sidecar cached in
ignored `public/posters/` for 150 days, with cleanup on status checks. Independent
JPEGs can also be placed there by work ID. Never expose this dev adapter publicly.
No real TMDB key was supplied, so live search/download remain untested. The
status endpoint and production build were checked; no key or posters configured.
