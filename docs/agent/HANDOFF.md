# Handoff

Updated 2026-11-23. History is in [`JOURNAL.md`](JOURNAL.md).

## State

The **basic local prototype is done**: React/Vite app over the seed in
`public/data/media_atlas_seed.json` (909 works, 73 franchises), five views
(cards, list, company hierarchy, sequences, vertical timeline), settings
(language, theme, base calendar, timeline spacing), a calendar converter, and
editorial collections. `npm run build` passes (Vite 7, 0 vulnerabilities);
`npm test` runs the proposed PostgreSQL schema against PostgreSQL 18 in
WebAssembly, 38/38. No remote; the working tree is clean.

TMDB cache, local only and within TMDB's terms (README, "TMDB terms"): 871 of
909 posters in `public/posters/` and imported years for the 92 undated series in
`public/data/tmdb_metadata.json`. Both are ignored by Git, expire after 150 days
(`scripts/tmdb-cache.mjs`), and are stripped from `dist/` by the build. Keep the
app non-commercial. The dev server's poster adapter has no authentication: never
expose it beyond `127.0.0.1`.

## Rules that still apply

- The seed is an **unverified conversation export**, not a licensed dataset.
  Never present it, its company "parent" claims (e.g. Skydance → Paramount →
  Warner Bros.) or its chronology as fact; do not publish it as a catalogue.
- Imported years are marked in the UI and never overwrite curated seed fields.
- `db/schema.sql` is a proposal, never applied; the frontend does not use it.

## Next (beyond the basics)

1. Verify representative seed records against independent, licensed sources.
2. Posters left: 38 works (mostly *Crayon Shin-chan* and *Doraemon* films) need a
   manual match in the detail panel.
3. Sequences and chronology: the seed's narrative order is an editorial proposal,
   and `editorial_proposal` is not one of the schema's certainty values. The owner
   must decide how `placement` / `certainty` map before `sequences` and
   `sequence_items` are imported; `chronology_entries` wait on the same rule.
4. Then: users/roles/RLS; authenticated editing; `episode_count` reconciliation.

The first import pass is in (`db/migrate.mjs`, `db/import.mjs`, migration
`001_review_and_seed_key.sql`): sources, companies, franchises, works and tags,
upserted by `seed_key`, every row `needs_review`, verbatim payloads in
`imported_metadata`. The second pass (migration `002_relations_and_claims.sql`)
adds continuities, memberships, franchise/company associations, company claims
and work/tag links with the same draft state. `npm test` is 51/51. The local
`db/.data` holds the imported copy (2,413 payloads); it is ignored by Git. Claims
are rows in claim tables, never reviewed facts: the cycle trigger still refuses a
corporate cycle and no ownership is inferred from `catalog_association`.
