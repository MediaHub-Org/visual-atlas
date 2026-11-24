# Text media (comics & manga) — design

Status: **approved by the owner 2026-11-24** (approach A, pilot, five standalone titles). Plan: `docs/superpowers/plans/2026-11-24-text-media.md`.
Date: 2026-11-24. Owner decisions so far are marked *(owner)*; everything else is my call and says so.

## Intent

The atlas today is a catalogue of video works (films, series). The owner wants a
second, equal catalogue of **text media**: comics and manga, reachable from a global
switch visible in the sidebar/home, "following the same philosophy" *(owner)*:
franchises, release order, credits, covers, editorial honesty about what is unverified.

Text media is **its own catalogue with its own franchises**, and **linked to the
video adaptations** when they exist *(owner)*. A manga with no adaptation is a first-class
entry; a franchise like Dragon Ball shows its manga and its anime/films connected.

## Goals

- A **Video | Text** switch (sidebar, also on the home/explore header) that changes which
  catalogue every view shows. The choice is kept in the URL (`media=text`) and survives reload.
- Text works in the same data model: franchise membership, release year, creators
  (writer/artist), cover, editorial tags, review status.
- **Adaptation links** between a text work and a video work, both directions, shown on
  both cards and navigable (clicking switches the catalogue).
- A **pilot catalogue** (below), curated by us, marked `needs_review`.
- Enrichment from external sources into a **local, gitignored cache**, under the same rules
  as TMDB (150-day expiry, stripped from `dist/`).

## Non-goals (pilot)

- Volumes, issues, chapters, arcs, reading orders and crossover order. The pilot is at
  **title / run level** only. (They need their own design; reading order must never be invented.)
- Publisher hierarchy and regional editions (Spanish editions, collected volumes).
- In-world chronology for text works (the "In-universe order" tab is hidden in text mode).
- Bulk importing any source's catalogue. Anything in the repo is curated by hand.
- Prose/synopsis copied from an external source into committed files.

## Anti-goals (would be a failure even if it works)

- A link or fact presented as verified when only a title match or a proposal backs it.
- Committed files that embed another service's data beyond ids and plain facts
  (titles, years) — that would breach "no data hoarding" (AniList) / "don't reproduce on
  another medium" (Comic Vine).
- Using "AniList" or "AniChart" as the app's name or branding (forbidden by their terms).
- Text mode as a bolt-on that breaks the video catalogue or its counts.

## Constraints

- Sources (my reading of their public pages; the builder must read the full terms before
  the first fetch): AniList — free for non-commercial use, avoid bulk storage, name not
  to be used as branding; Comic Vine — non-commercial, link back, about 200 requests per
  resource per hour, API key required. Visual Atlas is browsing-public and non-commercial
  today; if that changes, both sources must be re-checked.
- Existing rules hold: `needs_review` frozen on re-import; `seed_key` upserts; certainty
  `confirmed` is never set by an import; AGENTS.md "never invent chronology/ownership/
  image rights/precision".
- Covers are third-party images: local cache only, never committed, never in `dist/`,
  same as TMDB posters.
- Stack stays React 18 + Vite + TypeScript, PGlite schema + migrations, `node:test`.

## Approaches considered

| | What | Trade-off |
|---|---|---|
| **A (chosen)** *(owner)* | Hand-curated seed of text works and links; metadata/covers/creators cached locally from AniList (manga) and Comic Vine (western comics) | Respects licences, catalogue stays reviewed; grows in batches |
| B | Import whole catalogues from the APIs | Fast and huge, but breaches storage/reproduction terms and floods the atlas with unreviewed data |
| C | Only a "source material" link on video cards | Cheapest; is not the separate catalogue the owner asked for |

## Design

### Data model (my call, builder fills the details)

- **Formats.** Extend `works.format` with `comic_series`, `manga_series`, `graphic_novel`.
  The *medium* (video/text) is **derived from the format**, not a second column, so the two
  cannot disagree. Text works never have a parent work; the hierarchy trigger rejects it.
  `is_anime`/`is_animation`/`episode_count` stay video-only (CHECK).
- **Franchises are shared.** A text work joins a franchise through `memberships` like any
  work. Dragon Ball's manga sits in the `dragon-ball` franchise next to its anime; a manga
  with no adaptation gets its own franchise. Text mode lists franchises that contain at
  least one text work; video mode, at least one video work. Counts stay per medium.
- **Adaptations.** New table `adaptations(source_work_id, adapted_work_id, kind, certainty,
  source_id, review_status, seed_key)`. `kind` in (`anime`, `film`, `live_action`, `series`,
  `comic`, `novelisation`, `other`); `certainty` uses the existing vocabulary
  (`unknown` / `estimated` / `confirmed`). Rules: the two works differ; the pair + kind is
  unique; imports never write `confirmed`. Seed links start as `unknown` with the editorial
  mark; a relation reported by a source may be `estimated` and must name that source.
  Direction is "source → adapted", but both cards show the link.
- **Seed.** Ruling in the plan: text works live in a separate committed file `public/data/media_text_seed.json` (same row shapes) rather than inside `media_atlas_seed.json`, so the video seed is untouched. It holds text works (`format` comic_series/manga_series/
  graphic_novel, title, original title, first release year with `release_precision`),
  `memberships`, and an `adaptations` array. Titles and years are facts; no copied synopsis.
  `schema_version` bumps; `db/import.mjs` and `db/IMPORT.md` follow.

### Enrichment (local only)

- `scripts/fetch-text-metadata.mjs` (same shape as `fetch-metadata.mjs`/`fetch-credits.mjs`):
  AniList for manga, Comic Vine for western comics (key in an env var, never committed).
  Fetches first-publication year, creators (writer/artist), cover URL; writes
  `public/data/text_metadata.json` (gitignored, 150-day `expires`, stripped from `dist/`).
- Covers go through the existing local poster pipeline pattern.
- Source-reported adaptation links go to a local **proposals file** only; the owner promotes
  one into the seed. They are suggestions, not data.
- The footer shows attribution and a link back for each source in use (Comic Vine requires it).

### UI

- **Switch.** Sidebar segmented control "Video | Text" above "Discover", mirrored in the
  home/explore header. `media=text|video` in the URL (default video); stored in settings.
- **Text mode shows:** Cards and Release timeline (reused, working on text works); franchise
  and tag filters scoped to the medium; the person filter works on writers/artists.
  Hidden in text mode: "In-universe order" and the company tree (no data for them yet).
- **Cards.** Text cards show the cover (or the existing placeholder), title, year, and a
  "Manga"/"Comic" label; the editorial note is unchanged.
- **Detail panel.** An **Adaptations** section: "Adapted as" on a text work, "Based on" on a
  video work, each a link that switches the catalogue and opens that work, with its
  certainty label. Franchise sibling works are listed across media.
- Spanish and English strings for everything new.

### Pilot catalogue (proposal — owner reviews the list before import)

- **Manga from franchises already in the atlas:** Dragon Ball, One Piece, Detective Conan,
  Doraemon, Pokémon (Pokémon Adventures). Each linked to its video works already in the seed
  (`unknown` unless a source says otherwise).
- **Western comics:** a Marvel title, a DC title and Teenage Mutant Ninja Turtles (Mirage
  original), each linked to the matching video franchise already in the seed.
- **Five titles with no adaptation in the atlas** (proposed by me, accepted by the owner): Maus,
  Vagabond, Saga, Blankets, Love and Rockets. Years come from the sources, not from memory. ("No adaptation in the atlas" does not claim none exists anywhere.)
- The builder proposes exact titles and years from the sources; the owner approves the list
  before it enters the seed.

### Testing

- DB: new formats accepted, a text work rejects a parent, video-only columns reject text
  works, adaptation unique/self-link/certainty rules, import idempotent with frozen reviewed rows.
- UI helpers (pure, no imports): medium-of-format, catalogue filter by medium, adaptation
  lookup both directions, URL param parse. Seed validity test (every adaptation endpoint
  exists; every text work has a franchise).
- Fetch script: parsing tested with synthetic fixtures; no network in tests.
- Browser check of the switch, a manga card, and an adaptation link both ways.

## Left to the builder

Exact migration (`005_text_media.sql`) and trigger changes; whether `kind` is an enum or
check list; cover-cache file layout; Comic Vine/AniList query shapes and rate limiting;
placement of the switch in the sidebar markup; copy of the new strings.

## Open for the owner

1. Approve the approach and pilot scope above.
2. Pick the 2–3 standalone titles (or ask me to propose five to choose from).
3. A Comic Vine API key is needed for the western comics (free signup); AniList needs none.
   Without the key, western covers/creators stay empty and the catalogue still works.
