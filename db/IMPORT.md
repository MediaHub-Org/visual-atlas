# Import plan

**Status: first pass implemented, 2026-11-22.** The owner approved the defaults:
`needs_review` / `reviewed` / `rejected`, review columns (and reviews need a
date), and a first pass over the five entities with no claim semantics. The
verbatim payload of every imported row is kept in `imported_metadata`, so nothing
the curated tables cannot hold is lost.

What runs today:

    npm run db:migrate   # schema.sql + db/migrations/*.sql into db/.data (ignored)
    npm run db:import    # the five entities; --dry-run reports counts and writes nothing
    npm test             # 38 schema tests + 9 import tests

On 2026-11-22 the local database (`db/.data`, ignored) ended with 1 source, 84
companies, 73 franchises, 909 works, 13 tags and 1,080 verbatim payloads, every
row in `needs_review`.

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

## Rules the importer follows

- One transaction: a single bad row rolls the whole import back (tested).
- Upsert by `seed_key`; a row still in `needs_review` is refreshed, a `reviewed`
  row is frozen (tested).
- `--dry-run` runs the real statements and rolls back (tested).

## Still out, on purpose

- **Relations and claims** (`memberships`, `franchise_company_associations`,
  `company_relationship_claims`, `continuities`, `sequences`, `sequence_items`,
  `work_tags`): each needs its own mapping and review path. The review columns are
  already in place for the four claim join tables.
- **Chronology.** Narrative order is a proposal in the seed, not a date; mapping it
  needs the owner's rule for `placement` and `certainty`.
- **Posters.** `posters` records provenance and expiry; importing the cached files
  is a separate step under TMDB's terms.
- **Users, roles, RLS.** Still absent on purpose.
- **Publishing.** Nothing here is publishable: the export is
  `publication_ready: false` and every imported row is a draft.
