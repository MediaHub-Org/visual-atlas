# Frame — Visual Atlas

A first, local-only React/Vite prototype of a visual atlas of film and television.

Run `npm install`, then `npm run dev`. `npm run build` checks types and builds.
The conversation export in `src/media_atlas_seed.json` is **unverified
demonstration data**, not a publishable catalogue. Artwork is generated locally; no external image licences
are implied. This prototype has no backend, database, admin authentication or
editing. See `docs/agent/HANDOFF.md` for scope and next steps.

`db/schema.sql` contains a proposed data model, not an applied migration. The
frontend does not yet use a database. Its invariants are tested against a real
PostgreSQL engine with `npm run test:db` (no server needed). The development
server is intended for local use only; do not expose it publicly.

## Views, settings and grouping

Five views share one toolbar and URL: cards, list/table, company hierarchy,
narrative sequences and a vertical release timeline. Editorial collections
(tags from the seed) appear in the sidebar and as a filter and in the detail
panel; they are collections, not ownership or verified influence claims. The timeline can space
years equally, proportionally or logarithmically and uses the full width for
works released in the same year. Company groups come from the seed's unverified
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
left behind. First full run (2026-11-19): 805 posters cached (~77 MB), 103 works left for
manual review — mostly where TMDB uses a different title («Star Wars» for
*A New Hope*, «The Fantastic 4» for *Four*) or the search returns several exact
matches (*Rocky*, *Mad Men*, *Lost*, *Chernobyl*). One premiere entry was
rejected and deleted; the matcher now refuses event titles.

To use an independently licensed local JPEG instead, place it in
`public/posters/` using the exact work ID as filename, e.g.
`film--the-phantom-menace--1999.jpg`, and reload the page. Work IDs appear in
the `work` URL parameter when the detail panel is open. Do not reuse a TMDB
poster under this mechanism to bypass its cache limit. You are responsible for
the rights and attribution of independently sourced images.
