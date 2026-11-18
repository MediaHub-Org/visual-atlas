# Handoff

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
