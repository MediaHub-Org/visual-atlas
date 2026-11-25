# Frame — Visual Atlas

A first, local-only React/Vite prototype of a visual atlas of film and television.

Run `npm install`, then `npm run dev`. `npm run build` checks types and builds;
`npm test` runs the schema tests. The conversation export in
`public/data/media_atlas_seed.json` is **unverified demonstration data**, not a
publishable catalogue. Posters and imported years come from a local TMDB cache
(see below); without it the cards fall back to generated artwork. This prototype
has no backend, database, admin authentication or editing. See
`docs/agent/HANDOFF.md` for scope and next steps.

## TMDB terms (what this repo does about them)

- **Non-commercial only.** TMDB's API may not be used commercially without a
  written agreement.
- **Attribution.** The TMDB logo and the "not endorsed or certified by TMDB"
  notice are shown in the app header and the detail panel.
- **Cache limit.** TMDB content may be cached for at most six months. Posters and
  imported years expire after 150 days (`scripts/tmdb-cache.mjs`); the app hides
  expired years and drops expired unchanged posters on start, and the scripts
  re-fetch them.
- **No redistribution.** The cache (`public/posters/`,
  `public/data/tmdb_metadata.json`, `public/data/tmdb_credits.json`) is ignored by Git, and `npm run build` strips
  it from `dist/`, so neither the repo nor a build ever contains TMDB data.

`db/schema.sql` contains a proposed data model, not an applied migration. The
frontend does not yet use a database. Its invariants are tested against a real
PostgreSQL engine with `npm run test:db` (no server needed). The development
server is intended for local use only; do not expose it publicly.

## Views, settings and grouping

Five views share one toolbar and URL: cards, list/table, company hierarchy,
narrative sequences and a vertical release timeline. The sidebar offers Format and
**Universes**: a family (Marvel, DC, Disney / Pixar) opens to its franchises, the rest
stand alone, and the two lists narrow each other. **Companies** and editorial
**collections** (tags from the seed) are pills above the results (on narrow screens the
universes get a pill row too); they are collections, not ownership or verified influence
claims. The Watch format filter is Film, Series, Anime and Cartoon (Anime and Cartoon are flags across film and series). The **Density** chip opens a right-hand panel: card size (comfortable or compact)
for Cards, In-universe order and Release timeline, and the spacing of years
(equal, proportional or logarithmic) on the release timeline and the calendar axis; both are saved
preferences. The timeline uses the full width for works released in the same year. Company groups come from the seed's unverified
parent-company claims; they are labelled as claims, never as verified ownership.

Settings (gear icon) store language (English/Spanish), theme (dark/light/system),
base calendar and default timeline spacing in `localStorage`. The base calendar
is a display preference: year-only releases are never converted. The converter
accepts complete Gregorian dates and offers Gregorian, Hebrew and three named
Islamic variants through the browser's `Intl` implementation.

`npm run test:db` (38 tests) exercises the proposed schema; `npm run build`
type-checks and builds. The seed is fetched at runtime from
`public/data/media_atlas_seed.json`, so the JavaScript bundle stays ~186 kB.

## Posters and offline use

The local development server can search TMDB and save a selected poster. Obtain
a TMDB API key for non-commercial use, copy `.env.example` to `.env` in this
directory and enter the key there, privately. Restart `npm run dev`. Never send
the key in chat or put it in frontend code. Open a work, search in its details,
check the title and year and explicitly confirm a poster. No automatic match is
made. The key is used only by the local development server.

Saved posters and their sidecar metadata are in `public/posters/`, excluded from
Git. They can be viewed offline while the local app is running. TMDB posters are
cached for at most 150 days, shorter than its six-month cache limit. Expired
unchanged cache files are removed when the app checks its posters; if the app is
not started, remove expired files yourself. Replaced or manually modified files
are not automatically removed. Review TMDB's current terms and attribution
requirements before distribution; the bundled logo is from its approved logos
page. This development adapter has no administrator authentication and must not
be exposed to a network.

For a first local library, the backfill script matches titles exactly (normalised
title plus release year) and skips anything ambiguous instead of guessing:

```powershell
node --env-file-if-exists=.env scripts/fetch-posters.mjs --dry-run --limit 20
node --env-file-if-exists=.env scripts/fetch-posters.mjs --franchise "Star Wars"
```

Pass arguments to `node` directly: this npm version swallows flags after
`npm run … --`, so the npm alias only works without arguments. The script is
resumable, skips works that already have an image, checkpoints its manifest
every 25 works and writes saved, ambiguous and unmatched results to
`public/posters/manifest.json`. Review the ambiguous list in the app; each work
also has its own manual search box.

The toolbar has a «No poster yet» toggle for reviewing what the automatic matcher
left behind. Runs on 2026-11-19 cached **871 of 909 posters (~82 MB)**; 38 works
remain, almost all *Crayon Shin-chan* and *Doraemon* films whose English titles
differ on TMDB. The matcher accepts an exact title, a contained title with the
exact year, or an exact alternative title; it allows a ±2 year window only for an
exact title (festival vs. wide release), prefers the popular entry when two
catalogue duplicates share title and year, and refuses event/premiere titles.
`scripts/title-rules.mjs` holds the explicit, reviewable overrides for seed
labels such as «Doctor Who: original series» or «Doraemon: 1979 series».

## Text media (comics & manga)

A **Watch | Read** switch (sidebar and explore header, `?media=text`) swaps the whole
catalogue (Watch: films, series and anime; Read: comics, manga and graphic novels). Read mode has the same sidebar minus Companies. Text media is its own catalogue with its own franchises and is linked to
video adaptations. The catalogue (96 titles in four batches: long-running
manga and Marvel, DC, independent and European comics that have several sagas) lives in `public/data/media_text_seed.json`, same row shapes as the
video seed, all `needs_review`; titles and years are facts, no synopsis is copied.

- **Adaptations** (`adaptations` table, migration `005_text_media.sql`) link a source work
  to the work adapted from it, either direction. Seed links are certainty `unknown`
  (shown as "Editorial proposal · unverified"); the import refuses `confirmed`.
- **Not in the pilot:** volumes, issues, arcs, reading order, publishers, regional
  editions, in-world chronology. Read's "In-universe order" only groups works by series (Marvel and DC
  as families), with no position; it never invents an order.
- **Local enrichment:** `node --env-file-if-exists=.env scripts/fetch-text-metadata.mjs`
  (`--dry-run`, `--only <id>`, `--limit`) takes year, creators and a cover from AniList
  (manga, no key) and Comic Vine (`COMICVINE_API_KEY` in `.env`, never committed). Cache:
  `public/data/text_metadata.json` and covers in `public/posters/`, local-only, 150-day
  expiry, ignored by Git and stripped from `dist/`. A work is cached only on an exact
  normalised title match. AniList's reported adaptations go to
  `public/data/text_adaptation_proposals.json` for you to review; they never enter the
  seed on their own. AniList forbids hoarding data and branding with its name; the footer
  credits each source in use.
- **Covers:** the script saves JPEG, PNG or WebP covers (`public/posters/<id>.<ext>`); in a comic or manga's card, "Add cover…" lets you pick your own image file (local server only, no expiry). "No poster yet" lists the works still without one.
- **Add a title:** add the work, its franchise membership (an existing franchise id or a
  new franchise) and, if a video work really adapts it, an `unknown` adaptation to
  `media_text_seed.json`; run `npm test` and `npm run db:import -- --dry-run`.

## Universe families and the franchise size rule

`public/data/universe_families.json` holds the families the owner approved: Marvel and DC
(comics included) and **Disney / Pixar**, flagged `theory: true` because the shared world is a
fan theory the studios do not confirm (badge "Fan theory"). A family only groups blocks; it
never merges continuities.

A Watch franchise needs a score of **5** (film 1, series 1, seasons never add, short 0.5), or **4**
when very famous. Breaking Bad, Doctor Who and Game of Thrones are explicit inclusions of 2-3
titles. `tests/franchise-size.test.mjs` enforces the rule and holds the list of famous franchises.
Many works were typed from knowledge and then compared with TMDB
(`TMDB_API_KEY` in `.env`); all stay `needs_review`.

## In-world chronology

The release timeline orders works by real-world year; the **in-universe order** view
orders them inside their story. For a universe with a calendar, a **Calendar axis**
mode places works on that universe's own calendar. The pilot is Star Wars: BBY/ABY
(years before/after the Battle of Yavin), with the dates taken from Wookieepedia's
canon timeline (`canon_timeline`/`timeline`, never Legends) and kept in the committed
file `public/data/chronology/star-wars.json`. Each entry carries the page, its URL,
the revision id, the retrieval date, the licence (**CC BY-SA 3.0**) and the raw
infobox string; the detail panel and the footer credit Wookieepedia. They are that
wiki's claim, not verified facts: in the database they are `estimated` (or `unknown`
when open-ended) and `needs_review`. Where the seed's list order disagrees with the
dates the axis says so; the dates never rewrite the list.

Refresh with `node scripts/fetch-wookieepedia-dates.mjs`. A second franchise needs a
file like `scripts/chronology/star-wars-pages.mjs` (calendar block + reviewed page map),
a fetch run and its name added to `CHRONOLOGY_FILES` in `src/data.ts`. A date the
parser cannot read is stored raw with no value, never guessed.

## Imported credits

`scripts/fetch-credits.mjs` imports directors, writers (a series' creators) and the
eight top-billed cast with their characters into `public/data/tmdb_credits.json`
(same local-only cache and 150-day expiry as the years and posters). It only looks up
works whose TMDB id is already known from a saved poster or an imported year, never
by title, and keeps that id in each entry: the detail panel shows it as «TMDB #id»
with a link, so a wrong poster match is visible instead of spreading to the credits.
Run `node --env-file-if-exists=.env scripts/fetch-credits.mjs` (`--limit N`,
`--force`). Names in the panel filter the collection by person (`?person=<id>`), and
the search box also matches them. Nothing here is verified.

## Imported metadata

`scripts/fetch-metadata.mjs` fills only release years the seed leaves empty and
writes `public/data/tmdb_metadata.json` (a local cache, ignored by Git; each
entry expires after 150 days and is re-fetched on the next run). It never overwrites a curated field; the
UI marks those years with an asterisk and explains the origin in the detail
panel. Run on 2026-11-19: all 92 year-less series got a first-air year — 69 reused
the poster cache and the rest came from search with title overrides. Series
labelled «: anime», «: original series» or «: 1979 series» are resolved through
`scripts/title-rules.mjs`, never by guessing from the label alone.

```powershell
node --env-file-if-exists=.env scripts/fetch-metadata.mjs
```

To use an independently licensed local JPEG instead, place it in
`public/posters/` using the exact work ID as filename, e.g.
`film--the-phantom-menace--1999.jpg`, and reload the page. Work IDs appear in
the `work` URL parameter when the detail panel is open. Do not reuse a TMDB
poster under this mechanism to bypass its cache limit. You are responsible for
the rights and attribution of independently sourced images.
