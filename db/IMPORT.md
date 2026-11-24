# Import plan

**Status: second pass implemented, 2026-11-23.** The owner approved the defaults:
`needs_review` / `reviewed` / `rejected`, review columns (and reviews need a
date), and a first pass over the five entities with no claim semantics. The
second pass adds the relations and claims, still as draft rows. The verbatim
payload of every imported row is kept in `imported_metadata`, so nothing the
curated tables cannot hold is lost.

What runs today:

    npm run db:migrate   # schema.sql + db/migrations/*.sql into db/.data (ignored)
    npm run db:import    # entities, relations and claims; --dry-run writes nothing
    npm test             # 51 tests (schema + migrations + import)

On 2026-11-23 the local database (`db/.data`, ignored) ended with 1 source, 84
companies, 73 franchises, 909 works, 13 tags, 141 continuities, 855 franchise
memberships, 836 continuity memberships, 206 franchise/company associations, 26
company claims, 92 work/tag links and 2,413 verbatim payloads; every row is
`needs_review`.

## Why it is not a straight copy

1. **Identity.** Seed ids are strings (`film--the-phantom-menace--1999`,
   `star-wars--main-continuity`); the schema uses `bigint` identities. Matching by
   title is what the seed's own `import_contract` forbids, so migration
   `001_review_and_seed_key.sql` adds `seed_key text` with a unique index.
2. **Review state.** Every seeded claim carries `review_status: needs_review`. The
   migration adds that column (plus `reviewed_at`/`reviewed_by`) to the five
   entities and to the four claim join tables, and a check refuses `reviewed`
   without a date. The import never writes it.
3. **Claims are not relationships.** `company_relationship_claims` and the other
   claim arrays are still **not imported**. The tests assert that
   `company_relationships`, `franchise_companies` and `work_companies` stay empty.

## What the first pass imports

| Seed array   | Table        | Notes                                                                                                                    |
|--------------|--------------|--------------------------------------------------------------------------------------------------------------------------|
| `sources`    | `sources`    | no access date is invented; the seed's `verification_status` goes to `license_notes`                                     |
| `companies`  | `companies`  | name only                                                                                                                |
| `franchises` | `franchises` | name only; count claims stay in the payload                                                                              |
| `works`      | `works`      | films and series; `episode_count` only on series; an unknown animation classification imports as `false` and stays draft |
| `tags`       | `tags`       | rationale; no source id in the export, so null                                                                           |

Everything else keeps its JSON in `imported_metadata` (`provider = 'seed'`,
`external_id = '<array>:<id>'`). A seed section without a mapping aborts the
import instead of being skipped quietly.

## What the second pass imports

| Seed array                    | Tables written                                                   | Notes                                                                 |
|-------------------------------|------------------------------------------------------------------|-----------------------------------------------------------------------|
| `continuities`                | `continuities`                                                   | upserted by `seed_key`; franchise reference checked                   |
| `memberships`                 | `franchise_memberships`, `continuity_memberships`                | a row with `continuity_id: null` writes only the franchise membership |
| `franchise_company_associations` | `franchise_companies`                                         | always `catalog_association`; `ownership_asserted: false` is kept     |
| `company_relationship_claims` | `company_relationships`                                          | subject = parent, object = child; the cycle trigger still applies     |
| `work_tags`                   | `work_tags`                                                      | write-once links                                                      |

The membership type (`included` / `related_series`) is stored on both membership
tables; without it every row would read as the same claim. Migration
`002_relations_and_claims.sql` gives `continuities` and `company_relationships`
their own `seed_key` and review columns, and `work_tags` its draft state.

Natural keys make the joins idempotent: `(work_id, franchise_id)`,
`(continuity_id, work_id)`, `(franchise_id, company_id, relationship)` and
`(work_id, tag_id)`. A reviewed row is frozen: re-import refreshes only
`needs_review` rows, and a tag link that already exists is never touched.

## Rules the importer follows

- One transaction: a single bad row rolls the whole import back (tested).
- Upsert by `seed_key`; a row still in `needs_review` is refreshed, a `reviewed`
  row is frozen (tested).
- `--dry-run` runs the real statements and rolls back (tested).

## Third pass: sequences (owner's rule, 2026-11-24)

The seed's 235 sequences and 1,425 items are an editorial proposal from the
conversation export. They import into `sequences` / `sequence_items`
(migration `003_sequences.sql`) with `certainty = 'unknown'` and
`origin = 'editorial_proposal'` -- never `estimated` or `confirmed` -- and every
row `needs_review`. The seed's own `certainty` / `position_certainty` values stay
in the verbatim payload. Items must belong to the sequence's continuity
(composite foreign key), and a reviewed item is frozen on re-import. Release
order and narrative order of one continuity are two sequences, which is why they
do not go into `chronology_entries`.

## Still out, on purpose

- **Chronology.** `chronology_entries` and `chronology_relations` stay empty: a
  sequence is an editorial list, not a verified chronology, so no position or
  relation is derived from it.
- **Posters.** `posters` records provenance and expiry; importing the cached files
  is a separate step under TMDB's terms.
- **Users, roles, RLS.** Still absent on purpose.
- **Publishing.** Nothing here is publishable: the export is
  `publication_ready: false` and every imported row is a draft.
