# Import plan

**Status: proposal, 2026-11-22. Not implemented.** Three decisions are needed
from the owner first, because the seed cannot be copied into the schema without
either promoting unverified rows or adding review state, and that is an editorial
rule, not a technical detail.

## Why it is not a straight copy

1. **Identity.** Seed ids are strings (`film--the-phantom-menace--1999`,
   `star-wars--main-continuity`); the schema uses `bigint` identities. Re-running
   an import with nothing but titles to match on would duplicate rows, and matching
   by title is exactly what the seed's own `import_contract` forbids ("resolve
   external IDs and merge duplicates explicitly").
2. **Review state.** Every seeded claim carries `review_status: needs_review`.
   The schema has no place for that. Inserting into `works`,
   `franchise_memberships` or `work_companies` without it would present unverified
   conversation output as settled fact, which this repository forbids.
3. **Claims are not relationships.** The seed has
   `company_relationship_claims` ("Disney → parent → Marvel Studios, claimed") and
   the schema has `company_relationships` ("parent_company", enforced). The same
   split exists for franchise/company associations. A claim must not be promoted
   by being imported.

## Proposal

### 1. Migration: review state and a stable key

`db/migrations/001_review_and_seed_key.sql`

- `seed_key text UNIQUE` on `sources`, `companies`, `franchises`, `works`, `tags`.
  It is the string id from the export, kept forever; renames do not recompute it.
- `review_status text NOT NULL DEFAULT 'needs_review'` with a check for
  `('needs_review', 'reviewed', 'rejected')` on those five tables and on the join
  tables that carry a claim (`franchise_memberships`, `continuity_memberships`,
  `franchise_companies`, `work_companies`).
- `reviewed_at date`, `reviewed_by text` for the audit trail; the schema already
  separates sources from claims, so these stay optional.

### 2. Migration runner

`db/migrate.mjs`

- Applies `schema.sql`, then every `db/migrations/*.sql` in name order, each in its
  own transaction.
- Records applied files in `schema_migrations (name, applied_at, checksum)` and
  refuses to run when a recorded checksum changed. Small on purpose: no down
  migrations, no ORM, PGlite in tests and a real PostgreSQL when one exists.

### 3. Importer

`db/import.mjs`

- Reads `public/data/media_atlas_seed.json`, walks `import_contract.upsert_order`,
  resolves seed ids to bigints through `seed_key`, and upserts
  (`ON CONFLICT (seed_key) DO UPDATE`) inside one transaction.
- Never writes over curated columns: `works.title` corrections and imported years
  are editorial state, so a second import only fills fields that are still null.
- `--dry-run` prints per-table insert/update/skip counts and writes nothing.
- Refuses to import an array it has no mapping for, instead of skipping it
  quietly: a new seed section must be an explicit decision.

### 4. Tests

`db/test/import.test.mjs`, against PGlite like the schema tests:

- import twice → identical row counts (idempotent);
- every imported row is `needs_review`;
- every foreign key resolves, and an unknown id fails the whole import (rollback);
- an edited curated field survives a second import;
- a claim does not appear in the enforced table (`company_relationships`,
  `franchise_companies`) until someone reviews it.

## Deliberately out of this step

- **`sequences` / `sequence_items` → `chronology_entries` / relations.** Narrative
  order is a proposal in the seed, not a date. Mapping it needs the owner's rule
  for `placement` (`confirmed`/`estimated`/`disputed`/`unknown`) and `certainty`.
- **Posters.** `posters` already records provenance and expiry; importing the 871
  cached files is a separate step under TMDB's terms.
- **Users, roles, RLS.** Still absent on purpose.
- **Publishing.** Importing into a local database promotes nothing; the export
  stays `publication_ready: false`.

## Decisions needed

1. **Review vocabulary**: are `needs_review` / `reviewed` / `rejected` enough, and
   is `reviewed` a human act only (no import may set it)?
2. **Claims**: keep them in separate `*_claims` tables (faithful, more code) or put
   `review_status` on the real tables and filter in every view (cheaper, easier to
   leak)?
3. **First-pass scope**: sources, companies, franchises, works and tags only? That
   is the subset with no claim semantics, and it already exercises the hierarchy
   (works → series → season → episode) and the membership rules.
