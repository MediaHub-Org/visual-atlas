# Text media (comics & manga) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, equal catalogue of text media (comics and manga) with its own franchises, linked to video adaptations, behind a global Video | Text switch.

**Architecture:** Three new text formats on `works` (the medium is derived from the format); an `adaptations` table; a separate committed seed file `public/data/media_text_seed.json` (same row shapes as the video seed) read by the DB import and the app. Enrichment (covers, years, creators) comes from AniList and Comic Vine into a local gitignored cache. All medium logic is pure TypeScript in `src/medium.ts`, tested with `node --test`.

**Tech Stack:** Node 24 (`node:test`, native `.ts`), PGlite, React 18 + Vite 7 + TypeScript, AniList GraphQL, Comic Vine REST.

**Spec:** `docs/superpowers/specs/2026-11-24-text-media-design.md` (approved 2026-11-24; approach A; pilot list approved, standalone titles proposed by me and accepted with "Aprobado").

## Global Constraints

- Medium is derived from `format`: `film`/`series`/`season`/`episode` = video; `comic_series`/`manga_series`/`graphic_novel` = text. No second column.
- Text works never have a parent work and never carry `is_anime`, `is_animation` or `episode_count`.
- Adaptation `certainty` in (`unknown`, `estimated`, `confirmed`); imports never write `confirmed`; hand-written seed links are `unknown`; a source-reported link may be `estimated` and names its source. All rows `needs_review`.
- Never invent chronology, reading order, ownership, image rights or precision (AGENTS.md). Pilot is title/run level only; no volumes, issues, arcs, reading order.
- No synopsis copied from any external source into a committed file. Titles, years and ids are facts.
- External data lives only in gitignored local caches: `public/data/text_metadata.json` (150-day `expires`, same helper `scripts/tmdb-cache.mjs`), covers under `public/posters/` (already gitignored and stripped from `dist/`). Neither is committed.
- Never use the names "AniList" or "AniChart" as app branding; credit sources in the footer with a link back (Comic Vine requires it).
- Comic Vine key from `COMICVINE_API_KEY` (env/.env), never committed; without it the western titles simply have no cached metadata. AniList needs no key. Request pacing: 700 ms between AniList calls, 1100 ms between Comic Vine calls; generic `User-Agent: visual-atlas-pilot/0.1 (local research tool)`. Read each source's full terms before the first fetch (the builder confirms this in the ledger).
- Switch value in the URL: `media=text` (default video, not written). Spanish and English strings for everything new.
- Repo rules: update `docs/agent/HANDOFF.md`; commit on `master`; end commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A text work must be rejected if given a parent, `is_anime`, `is_animation` or `episode_count` — Task 1.
- An adaptation of a work onto itself, a duplicate (source, adapted, kind), and `confirmed` certainty from the import must all be refused — Tasks 1 and 2.
- Video-mode counts, filters and views must be byte-for-byte unchanged when text data is present, and the app must load when `media_text_seed.json` is absent or malformed — Tasks 3 and 4.
- A franchise with only text works must not show in video mode (and the reverse) — Task 3.
- An adaptation link whose other end is not loaded must not render a dead link — Task 5.
- A cached metadata entry past its `expires` must be ignored — Task 6.

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/005_text_media.sql` (new) | Text formats, hierarchy/video-only guards, `adaptations` |
| `db/schema.sql` (modify) | Same changes folded into the base schema |
| `db/import.mjs` (modify) | Pass 5: text seed works, memberships, adaptations |
| `public/data/media_text_seed.json` (new, committed) | Pilot catalogue |
| `src/medium.ts` (new) | Pure: medium of a format, catalogue filter, adaptation lookup, URL param |
| `src/data.ts` (modify) | Load text seed, `Work.medium`, `Dataset.adaptations`, per-medium stats |
| `src/App.tsx`, `src/components/Sidebar.tsx`, `WorkCard.tsx`, `DetailPanel.tsx`, `i18n.ts`, `style.css` (modify) | Switch, filters, cards, Adaptations section |
| `scripts/text-sources.mjs` (new) | Pure: AniList/Comic Vine response parsing |
| `scripts/fetch-text-metadata.mjs` (new) | Fetch + cache + proposals file |
| `tests/medium.test.mjs`, `tests/text-sources.test.mjs`, `tests/text-seed.test.mjs` (new); `db/test/import.test.mjs`, `db/test/schema.test.mjs` (modify) | Suites |

---

### Task 1: Schema — text formats and adaptations

**Files:**
- Create: `db/migrations/005_text_media.sql`
- Modify: `db/schema.sql`, `db/test/schema.test.mjs`

**Interfaces:**
- Produces: `works.format` accepts `comic_series`, `manga_series`, `graphic_novel`; table `adaptations(id, seed_key text unique-when-not-null, source_work_id → works, adapted_work_id → works, kind, certainty, source_id → sources, review_status, reviewed_at, reviewed_by, notes)`.

- [ ] **Step 1: Write failing tests in `db/test/schema.test.mjs`** (follow the file's existing helpers): `accepts a manga_series with no parent`; `rejects a text work with a parent_work_id` (check_violation); `rejects is_anime, is_animation or episode_count on a text work`; `rejects an adaptation of a work onto itself`; `rejects a duplicate (source, adapted, kind)`; `rejects kind outside the list` (`anime, film, live_action, series, comic, novelisation, other`); `rejects certainty 'disputed'` (only unknown/estimated/confirmed); `rejects reviewed without reviewed_at`; `a text work and a video work can be linked both ways`.
- [ ] **Step 2: Run** `node --test db/test/schema.test.mjs` — Expected: the new tests FAIL (format check / table missing).
- [ ] **Step 3: Write `005_text_media.sql`** — widen the `works.format` CHECK; extend `enforce_work_hierarchy()` so text formats are treated like `film`/`series` (no parent); add a CHECK that `is_anime`, `is_animation` are false and `episode_count` is null for text formats; create `adaptations` with the constraints above (`CHECK (source_work_id <> adapted_work_id)`, `UNIQUE (source_work_id, adapted_work_id, kind)`, review CHECK as in `sequences`). Fold the same into `db/schema.sql`.
- [ ] **Step 4: Run** `node --test db/test/schema.test.mjs` then `npm test` — Expected: PASS, db suite green.
- [ ] **Step 5: Commit** `feat(db): text media formats and adaptations table`.

### Task 2: Import — text seed pass

**Files:**
- Modify: `db/import.mjs`, `db/IMPORT.md`, `db/test/import.test.mjs`
- Create: `public/data/media_text_seed.json` (structure only, empty arrays: `schema_version`, `works`, `franchises`, `memberships`, `continuities`, `adaptations`)

**Interfaces:**
- Consumes: Task 1 schema; `importSeed(db, seed, {dryRun, chronology})` from the existing import.
- Produces: `importSeed(db, seed, {dryRun, chronology, text})` where `text` is the parsed text seed or `undefined`. Row shapes: works `{id, format, title, original_title, release_year, release_precision, review_status, source_ids}`; `franchises` and `memberships` as in the video seed (a text work may join an existing franchise id); `adaptations: [{id, source_work_id, adapted_work_id, kind, certainty, notes}]` where either id may be a video-seed work id. The CLI loads `public/data/media_text_seed.json` when present.

- [ ] **Step 1: Write failing tests**: `imports a text work and joins it to an existing franchise`; `imports an adaptation between a text work and a video work as needs_review and certainty unknown`; `refuses certainty confirmed from the import` (the import throws or downgrades — choose the throw, ledger the ruling); `refuses an adaptation whose endpoint is not in either seed`; `re-import is idempotent and leaves a reviewed adaptation untouched`; `without a text seed the import is unchanged` (row counts equal the baseline).
- [ ] **Step 2: Run** `node --test db/test/import.test.mjs` — Expected: new tests FAIL.
- [ ] **Step 3: Implement pass 5 in `importSeed`** following passes 3–4 (upsert by `seed_key`, review status frozen once `reviewed`); document the pass and the text seed file in `db/IMPORT.md`.
- [ ] **Step 4: Run** `npm test` — Expected: all green.
- [ ] **Step 5: Commit** `feat(db): import text works and adaptations`.

### Task 3: Pure medium module

**Files:**
- Create: `src/medium.ts`, `tests/medium.test.mjs`

**Interfaces:**
- Produces (no imports):
  - `type Medium = 'video' | 'text'`
  - `mediumOfFormat(format: string): Medium` — text for `comic_series`/`manga_series`/`graphic_novel`, else video
  - `parseMedium(raw: string | null): Medium` — `'text'` → text, anything else → video
  - `catalogueFranchises<T extends {id: string}>(franchises: T[], works: {id: string; medium: Medium; memberships: {franchiseId: string}[]}[], medium: Medium): T[]` — franchises with at least one work of that medium
  - `type Adaptation = {id: string; sourceId: string; adaptedId: string; kind: string; certainty: 'unknown' | 'estimated' | 'confirmed'}`
  - `adaptationsFor(workId: string, all: Adaptation[], exists: (id: string) => boolean): {asSource: Adaptation[]; asAdapted: Adaptation[]}` — drops links whose other end does not exist

- [ ] **Step 1: Write tests**: format mapping for all seven formats and an unknown string (video); `parseMedium` for `text`, `video`, `''`, `null`, `TEXT`; `catalogueFranchises` hides a text-only franchise in video and the reverse, and keeps a franchise with both in both; `adaptationsFor` splits source/adapted and drops a link whose other end is missing; empty inputs.
- [ ] **Step 2: Run** `node --test tests/medium.test.mjs` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement `src/medium.ts`.**
- [ ] **Step 4: Run** `node --test tests/medium.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: pure medium helpers`.

### Task 4: App data — load the text seed

**Files:**
- Modify: `src/data.ts`; Test: `tests/text-seed.test.mjs`

**Interfaces:**
- Consumes: `mediumOfFormat`, `Adaptation` from `src/medium.ts`.
- Produces: `Work.medium: Medium`; `Work.format: 'Film' | 'Series' | 'Comic' | 'Manga' | 'Graphic novel'`; `Dataset.adaptations: Adaptation[]`; `Dataset.stats` gains `textWorks: number`; `buildDataset(seed, metadata, credits, chronology, families, textSeed?)`; `loadAtlas` fetches `/data/media_text_seed.json` with `loadLocalJson` and ignores it when malformed.

- [ ] **Step 1: Write failing tests** (`tests/text-seed.test.mjs`, reading the real files with `node:fs` like `families.test.mjs`): every `adaptations` endpoint exists in the video or text seed; every text work has a membership whose franchise exists in the video or text seed; every text work has `review_status: 'needs_review'`; every adaptation has certainty `unknown` or `estimated`; no text work carries a `synopsis`; ids are unique across both seeds.
- [ ] **Step 2: Run** `node --test tests/text-seed.test.mjs` — Expected: FAIL only on content once Task 7 lands; for now they pass on the empty seed — ledger this and re-run after Task 7.
- [ ] **Step 3: Implement** the data changes. Video-mode `stats.films/series` and the video `works` list must be unchanged when the text file is absent.
- [ ] **Step 4: Run** `npx tsc --noEmit` and `npm test` — Expected: clean, green.
- [ ] **Step 5: Commit** `feat: load text media into the dataset`.

### Task 5: UI — the switch, filtering, cards, adaptations

**Files:**
- Modify: `src/App.tsx`, `src/components/Sidebar.tsx`, `WorkCard.tsx`, `DetailPanel.tsx`, `i18n.ts`, `style.css`

**Interfaces:**
- Consumes: `parseMedium`, `catalogueFranchises`, `adaptationsFor` (Task 3); `Dataset.adaptations`, `Work.medium` (Task 4).
- Produces: URL param `media=text`; a `medium` state in `App` that filters `works` before every other filter; `Sidebar` props `medium` and `onMedium(medium)`; DetailPanel prop `adaptations` and `onWork(id)` that also switches the medium to the target work's medium.

- [ ] **Step 1: Sidebar switch** — a segmented "Video | Text" control above "Discover", and the same control in the explore header. `aria-pressed` on both. Switching resets `franchise`, `company`, `tag`, `person`, `format`, `seq`, `at`, `axis` and `selected`, and returns to `cards` when the current view is hidden in the new medium. Text mode hides "In-universe order" and the company tree (sidebar and `+N more`); `ROUTABLE` hierarchy and `sequence` views fall back to `cards` in text mode.
- [ ] **Step 2: Filtering** — in `filtered`, keep only works of the current medium; franchise dropdown and sidebar use `catalogueFranchises`; tag and format filter options only list entries that match the current medium (the Anime/Film/Series format chips become Comic/Manga/Graphic novel in text mode).
- [ ] **Step 3: Cards** — text cards show the cover through the existing poster path (`posterUrl`) with the existing placeholder fallback and the `Comic`/`Manga`/`Graphic novel` label in `poster-top`.
- [ ] **Step 4: DetailPanel Adaptations section** — "Adapted as" (text work) and "Based on" (video work), each a button with title, year, kind and the certainty label (`unknown` shows the editorial badge). Clicking opens that work and sets the medium to the target's. Links with a missing end do not render (via `adaptationsFor`).
- [ ] **Step 5: Verify in the browser** (dev server): video mode identical to before (counts, cards); switching to text shows the pilot works only; a manga card opens its anime and back. Run `npx tsc --noEmit`, `npm test`.
- [ ] **Step 6: Commit** `feat: Video | Text switch and adaptation links`.

### Task 6: Enrichment script and attribution

**Files:**
- Create: `scripts/text-sources.mjs`, `scripts/fetch-text-metadata.mjs`, `tests/text-sources.test.mjs`
- Modify: `.gitignore` (`public/data/text_metadata.json`, `public/data/text_adaptation_proposals.json`), `src/data.ts` (read the cache), `src/App.tsx` (footer), `src/i18n.ts`, `vite.config.ts` (strip both files from `dist/` as `tmdb_*` are)

**Interfaces:**
- Produces (pure, in `text-sources.mjs`): `parseAniListMedia(json): {id, title, year, status, creators: {name, role}[], coverUrl, relations: {id, title, type, format}[]} | null`; `parseComicVineVolume(json): {id, title, year, publisher, creators: {name, role}[], coverUrl} | null`; both return `null` on malformed input and never throw. The cache entry is `{source: 'anilist'|'comicvine', sourceId, year, creators, coverUrl, expires}` keyed by work id; `tmdbExpiry()` supplies `expires`.

- [ ] **Step 1: Write failing tests with synthetic fixtures** (no network): both parsers on a complete fixture and on malformed/empty input; `an entry past expires is ignored by the app loader` (export the loader's freshness check and test it); `adaptation relations become proposals, never seed rows` (the script's builder returns `{proposals}` shaped `{sourceWorkId, adaptedTitle, kind, source}` and nothing that matches the seed adaptation shape).
- [ ] **Step 2: Run** `node --test tests/text-sources.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** the parsers and the script (`--dry-run`, `--limit`, `--only <workId>`; AniList for `manga_series`, Comic Vine for the other text formats when `COMICVINE_API_KEY` is set, otherwise skip with one line; covers downloaded to `public/posters/<workId>.jpg` with the sidecar used by `fetch-posters.mjs`; matching is by the stored external id when the seed has one, else by exact normalised title + year via `scripts/match.mjs`, never by guesswork). Wire the cache into `data.ts` for year and creators only where the seed has none, marked as imported like TMDB years.
- [ ] **Step 4: Footer attribution** — one line per source in use: "Manga data: AniList" / "Comics data: Comic Vine", each linking to the source, in the same footer block as the TMDB and Wookieepedia credits; shown in text mode only when the cache has entries from that source.
- [ ] **Step 5: Run** `npx tsc --noEmit`, `npm test`, `npm run build` and confirm `dist/` has neither cache file nor covers. Expected: green, clean.
- [ ] **Step 6: Commit** `feat: local text-media enrichment from AniList and Comic Vine`.

### Task 7: Pilot catalogue

**Files:**
- Modify: `public/data/media_text_seed.json`; Test: `tests/text-seed.test.mjs` (from Task 4, now exercising real content)

**Interfaces:**
- Consumes: Task 2 row shapes; video seed work ids (`series--dragon-ball`, `series--one-piece-anime`, `series--detective-conan`, `series--doraemon-1979-series`, `series--doraemon-2005-series`, `series--pokemon-original-anime-series`, and the Marvel/DC/TMNT films and series already in the seed).

- [ ] **Step 1: Add the works** (titles and first-publication years from the sources by running the Task 6 script with `--dry-run`, every value cited in the ledger; a value not stated by the source is `null`, never guessed):
  - Manga in existing franchises: Dragon Ball, One Piece, Detective Conan, Doraemon, Pokémon Adventures.
  - Western comics: one Marvel title (Spider-Man), one DC title (Batman), Teenage Mutant Ninja Turtles (Mirage original, 1984).
  - Standalone (new franchises, no adaptation in the atlas): Maus, Vagabond, Saga, Blankets, Love and Rockets.
- [ ] **Step 2: Add `memberships`** (existing franchise ids `dragon-ball`, `one-piece`, `detective-conan`, `doraemon`, `pokemon`, `spider-man`, `batman`, `tmnt`; new franchise ids for the five standalones) and **`adaptations`** from each text work to the matching video works of its franchise, all `certainty: "unknown"` with `notes: "editorial proposal, unverified"`. No adaptation rows for the standalones.
- [ ] **Step 3: Run** `node --test tests/text-seed.test.mjs`, `npm test`, `npm run db:import -- --dry-run` — Expected: green; dry-run reports the new rows and no errors.
- [ ] **Step 4: Browser check** — text mode lists 13 works; Dragon Ball's manga opens its anime and back; the five standalones have an empty Adaptations section that says "No adaptation in the atlas".
- [ ] **Step 5: Commit** `feat: text media pilot catalogue`.

### Task 8: Documentation and handoff

**Files:**
- Modify: `README.md` (section "Text media"), `docs/agent/HANDOFF.md`, `docs/agent/JOURNAL.md`, `AGENTS.md` if it lists data files

- [ ] **Step 1: Document** the switch, the text seed and the adaptation rules, the local enrichment (keys, pacing, cache rules, attribution), the non-goals, and how to add a title.
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: all green.
- [ ] **Step 3: Commit** `docs: text media`.
