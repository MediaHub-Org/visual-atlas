# Handoff

Updated 2026-11-24. History is in [`JOURNAL.md`](JOURNAL.md).

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
`public/data/tmdb_metadata.json`. Credits (director, writer/creator, top cast with characters) live in
`public/data/tmdb_credits.json` (`scripts/fetch-credits.mjs`, TMDB id taken from the
poster/metadata caches, never matched by title). All three are ignored by Git, expire after 150 days
(`scripts/tmdb-cache.mjs`), and are stripped from `dist/` by the build. Keep the
app non-commercial. The dev server's poster adapter has no authentication: never
expose it beyond `127.0.0.1`.

## Rules that still apply

- The seed is an **unverified conversation export**, not a licensed dataset.
  Never present it, its company "parent" claims (e.g. Skydance → Paramount →
  Warner Bros.) or its chronology as fact; do not publish it as a catalogue.
- Imported years are marked in the UI and never overwrite curated seed fields.
- `db/schema.sql` is a proposal, never applied; the frontend does not use it.

The detail panel shows the credits with a source line and TMDB link; each name filters
by person (`?person=<tmdb id>`). The poster search is also reachable from a
«Change poster» button on the poster (it used to sit unseen at the bottom of the panel).

The two orders are now named apart: «Release timeline» (by year of release) and
«In-universe order» (the seed's narrative sequences). A work's detail panel lists the
in-universe order(s) it belongs to with position, earlier/later neighbours and
«Open the full order» (`?seq=<sequence id>&at=<work id>`), which opens only that list
with the work highlighted; the other lists start collapsed. There are no in-world
dates yet: `narrative_periods` is empty and `calendar_systems` only has real-world
calendars. See the owner's chronology goal in the next section before adding dates.

**In-world chronology pilot (2026-11-24, Star Wars).** 18 of 18 Star Wars works have
BBY/ABY dates from Wookieepedia canon (`public/data/chronology/star-wars.json`,
committed, CC BY-SA 3.0 with page/revision/licence per entry). Migration
`004_inworld_chronology.sql` (`fictional_calendars`, `narrative_periods` columns) and a
fourth import pass load it: `estimated` (or `unknown` when open-ended), `needs_review`,
reviewed rows frozen. The app shows the date in the detail panel and a **Calendar axis**
mode in the in-universe view (ties grouped, undated listed apart, list-vs-dates conflict
note; the real data shows none). Decisions: the data file is committed, not a cache;
certainty `estimated`. Unverified: every date is Wookieepedia's claim. Next: Legends is
out of scope; a second franchise reuses the same pieces (README, "In-world chronology").

The dashboard tabs are now Cards, In-universe order and Release timeline: the owner
removed List and Hierarchy (2026-11-24). Hierarchy stays reachable only from the
sidebar's «+N more» companies link, so the company tree is not lost.

## Next (beyond the basics)

1. Verify representative seed records against independent, licensed sources.
2. Posters left: 38 works (mostly *Crayon Shin-chan* and *Doraemon* films) need a
   manual match in the detail panel.
3. Sequences are imported (owner's rule, 2026-11-24): `certainty = 'unknown'`,
   `origin = 'editorial_proposal'`, all `needs_review` (migration 003). Still open:
   `chronology_entries` / `chronology_relations` stay empty until a verified order
   exists, The sequence view labels each sequence "Editorial proposal · unverified" (en/es).
4. Then: users/roles/RLS; authenticated editing; `episode_count` reconciliation.

The first import pass is in (`db/migrate.mjs`, `db/import.mjs`, migration
`001_review_and_seed_key.sql`): sources, companies, franchises, works and tags,
upserted by `seed_key`, every row `needs_review`, verbatim payloads in
`imported_metadata`. The second pass (migration `002_relations_and_claims.sql`)
adds continuities, memberships, franchise/company associations, company claims
and work/tag links with the same draft state. `npm test` is 54/54. The third pass (migration `003_sequences.sql`) imports the 235 sequences and 1,425 items as unknown/editorial proposals; run `npm run db:import` to bring the local `db/.data` copy up to date. The local
`db/.data` holds the imported copy (2,413 payloads); it is ignored by Git. Claims
are rows in claim tables, never reviewed facts: the cycle trigger still refuses a
corporate cycle and no ownership is inferred from `catalog_association`.

## In-universe order by world (2026-11-24)
- "In-universe order" shows one block per universe family (Marvel, DC live action: `public/data/universe_families.json`, owner-approved 2026-11-24, Insidious excluded) or per franchise, with one lane per continuity. Continuities are never merged; `same_world` only labels a lane.
- Star Wars is the only block with a calendar: "Calendar axis" switches it to the BBY/ABY axis. Other blocks say they have no in-world dates.
- Code: `src/families.ts` (parse + `buildBlocks`, tested in `tests/families.test.mjs`), `SequenceView` in `src/components/Views.tsx`. Proposal record: `docs/proposals/universe-families.md`.

## Text media, comics & manga (2026-11-24)
- Spec `docs/superpowers/specs/2026-11-24-text-media-design.md`, plan `docs/superpowers/plans/2026-11-24-text-media.md`. Video | Text switch (`media=text`), pilot of 13 titles in `public/data/media_text_seed.json`, `adaptations` table (migration 005), `src/medium.ts` (pure, tested in `tests/medium.test.mjs`), enrichment `scripts/fetch-text-metadata.mjs`.
- Only six manga->anime links exist (Dragon Ball x2, One Piece, Detective Conan, Doraemon x2), all `unknown`. No run-level links for Marvel/DC/TMNT comics or Pokémon Adventures on purpose.
- Western comics and the standalone Maus, Saga, Blankets, Love and Rockets have no year/creators/cover until `COMICVINE_API_KEY` is set and the script is run (Comic Vine terms still to be read in full before the first call).
- Not done: volumes/issues/arcs/reading order, publishers, a text-mode company view.
