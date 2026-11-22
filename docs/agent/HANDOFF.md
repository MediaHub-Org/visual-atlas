# Handoff

Updated 2026-11-19. History is in [`JOURNAL.md`](JOURNAL.md).

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
3. Then: import pipeline and migrations into the schema; users/roles/RLS;
   authenticated editing; `episode_count` reconciliation.

The import pipeline cannot start without an editorial decision: the seed is
unverified and the schema has no review state, so a copy would promote claims into
facts. `db/IMPORT.md` (2026-11-22) is the proposal and names the three decisions
(review vocabulary, claims vs. relationships, first-pass scope). No schema change
was applied; `npm test` is still 38/38.
