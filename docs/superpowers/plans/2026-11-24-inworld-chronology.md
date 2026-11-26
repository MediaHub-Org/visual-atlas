# In-world chronology (Star Wars pilot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Star Wars works their in-world dates (BBY/ABY) from Wookieepedia, show them in the detail panel and on a calendar axis, and flag where the seed's list order disagrees with the dates.

**Architecture:** A map-driven script fetches each work's Wookieepedia page, parses the infobox timeline with a strict parser, and writes a committed, self-describing data file (calendar definition + per-work periods with provenance). The same file feeds a fourth DB import pass (`fictional_calendars`, `narrative_periods`) and the app (`data.ts` → detail panel + an axis mode in the in-universe view). All layout and consistency logic is pure TypeScript in one file, tested with `node --test`.

**Tech Stack:** Node 24 (`node:test`, native `.ts` type stripping), PGlite (PostgreSQL), React 18 + Vite 7 + TypeScript, MediaWiki API (read-only).

**Spec:** `docs/superpowers/specs/2026-11-24-inworld-chronology-design.md` (approved 2026-11-24, with its two proposals: the data file is committed; certainty `estimated` for a stated date, `unknown` for open-ended).

## Global Constraints

- Canon only: read `canon_timeline`, else `timeline`; never `legends_timeline`.
- Never invent a date or order: a string the parser does not recognise is stored as `raw_text` with **no value**, and reported.
- Linear value: `N BBY` → `-N`, `N ABY` → `+N`; "0 ABY" is the Battle of Yavin year; 1 BBY precedes it.
- Certainty: `estimated` for a stated year/range, `unknown` for `open_after`; never `confirmed`; every imported row `needs_review`; the import never writes `review_status`.
- Attribution: every stored date carries page title, URL, revision id, retrieval date, licence (`CC BY-SA 3.0`) and the raw infobox string; the UI shows the attribution beside the date and in the footer.
- Wookieepedia requests: public MediaWiki API only, one request per page, generic `User-Agent: visual-atlas-pilot/0.1 (local research tool)`, 300 ms between requests.
- The seed's editorial list is never rewritten by the dates.
- Repo rules (`AGENTS.md`): editorial data stays provisional until independently sourced; update `docs/agent/HANDOFF.md` before finishing.
- Commit on `master`; end commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A work with no in-world date must still appear (under "No in-world date"), never vanish from the axis view — Task 4, Task 6.
- Two works with the same start (The Last Jedi / The Force Awakens, 34 ABY) must show as a tie, not as an order — Task 4.
- Open-ended dates ("During or after 9 ABY", Ahsoka) must sort by their start and be marked open, with no invented end — Task 1, Task 4.
- Year 0 and the BBY/ABY boundary (1 BBY → 0 ABY) must format and sort correctly — Task 4.
- The app must still load and render when the chronology file is absent or malformed — Task 5.
- A re-import must not overwrite a period a person marked `reviewed` — Task 3.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/chronology/wookieepedia.mjs` (new) | Pure parsing: infobox field extraction and timeline strings → periods |
| `scripts/chronology/star-wars-pages.mjs` (new) | The reviewed map `work id → Wookieepedia page` and the calendar definition |
| `scripts/fetch-wookieepedia-dates.mjs` (new) | Fetches pages, builds and writes the data file |
| `public/data/chronology/star-wars.json` (new, committed) | The data file the DB import and the app read |
| `db/migrations/004_inworld_chronology.sql` (new) | `fictional_calendars` + `narrative_periods` columns |
| `db/import.mjs` (modify) | Fourth pass: load chronology files |
| `src/chronology.ts` (new) | Pure: formatting, axis grouping/layout, order-conflict check |
| `tests/chronology-parser.test.mjs`, `tests/chronology.test.mjs` (new) | `node --test` suites |
| `src/data.ts` (modify) | Load chronology, `Work.inWorld`, `Dataset.calendars` |
| `src/components/AxisView.tsx` (new), `Views.tsx`, `DetailPanel.tsx`, `App.tsx`, `i18n.ts`, `style.css` (modify) | UI |

---

### Task 1: Timeline parser

**Files:**
- Create: `scripts/chronology/wookieepedia.mjs`
- Test: `tests/chronology-parser.test.mjs`
- Modify: `package.json` (`"test"` script runs `db/test/*` and `tests/*`)

**Interfaces:**
- Produces:
  - `extractTimeline(wikitext: string): {field: 'canon_timeline' | 'timeline'; raw: string} | null` — `canon_timeline` wins over `timeline`; `<ref …>…</ref>`/`<ref/>` removed from `raw`; `null` when neither exists.
  - `eraValue(text: string): number | null` — `"32 BBY"` → `-32`, `"0 ABY"` → `0`, `"9 ABY"` → `9`; anything else → `null`.
  - `parseTimeline(raw: string): {periods: Period[]; parsed: boolean}` with `Period = {label: string | null; start: number | null; end: number | null; qualifier: 'exact' | 'circa' | 'open_after' | 'days_before'; primary: boolean}`. Exactly one period has `primary: true` (the one labelled `Main story`, else the first). `parsed: false` and `periods: []` when no era year is found.

- [ ] **Step 1: Write the failing test** `tests/chronology-parser.test.mjs` using the real strings from the spec. Assertions (each a separate `it`):
  - `extractTimeline` on a wikitext containing both fields returns `{field:'canon_timeline', raw:'[[32 BBY]]'}`; on one with only `|timeline=*[[10 BBY]] {{C|Main story}}\n*[[13 BBY]] {{C|Prologue}}` returns that raw; refs inside are stripped; returns `null` when absent.
  - `eraValue('32 BBY') === -32`, `eraValue('0 ABY') === 0`, `eraValue('9 ABY') === 9`, `eraValue('soon') === null`.
  - `parseTimeline('[[32 BBY]]')` → one period `{label:null,start:-32,end:-32,qualifier:'exact',primary:true}`.
  - `parseTimeline('[[1 BBY]]&ndash;[[0 ABY]]')` → `start:-1,end:0`.
  - `parseTimeline('[[22 BBY]]&ndash;[[19 BBY]]')` → `start:-22,end:-19`.
  - Solo: `'*[[10 BBY]] {{C|Main story}}\n*[[13 BBY]] {{C|Prologue}}'` → two periods; labels `Main story`/`Prologue`; primary is the first (`start:-10`).
  - Rebels: `'*[[5 BBY]] - [[1 BBY]]\n*c. [[9 ABY]] {{C|Epilogue}}'` → first `start:-5,end:-1`; second `qualifier:'circa',start:9,end:9,label:'Epilogue'`; primary is the first (no `Main story` label).
  - Rogue One: `"*[[1 BBY]], days before [[Star Wars: Episode IV A New Hope|''A New Hope'']] {{C|Main story}}\n*[[13 BBY]] {{C|Prologue}}"` → primary `start:-1,qualifier:'days_before'`.
  - `'c. [[14 ABY]]'` → `qualifier:'circa'`; `'During or after [[9 ABY]]'` → `qualifier:'open_after', start:9, end:null`.
  - `parseTimeline('sometime later')` and `parseTimeline('')` → `{periods:[], parsed:false}` (no guess).
  - Zero never comes out as `-0`: `parseTimeline('[[0 BBY/Legends|0 BBY]]')` gives `start` such that `Object.is(start, 0)`; piped links resolve to their display text.
- [ ] **Step 2: Run** `node --test tests/chronology-parser.test.mjs` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the three functions in `scripts/chronology/wookieepedia.mjs`. Approach: strip refs; turn `[[a|b]]`→`b` and `[[a]]`→`a`; take `{{C|x}}`→label `x`; split entries on lines starting with `*` (a raw with no `*` is one entry); within an entry find era tokens with `/(\d+)\s*(BBY|ABY)/g`; two tokens → range; `c.` prefix → `circa`; `/during or after/i` → `open_after` with `end:null`; `/days before/i` → `days_before`; normalise `-0` to `0`.
- [ ] **Step 4: Run** the same command — Expected: all PASS.
- [ ] **Step 5:** change `package.json` `"test"` to `npm run test:db && node --test tests/`, then run `npm test` — Expected: db suites + new suite pass.
- [ ] **Step 6: Commit** `feat: parse Wookieepedia timeline fields strictly`.

---

### Task 2: Page map, fetcher and the data file

**Files:**
- Create: `scripts/chronology/star-wars-pages.mjs`, `scripts/fetch-wookieepedia-dates.mjs`, `public/data/chronology/star-wars.json`
- Test: `tests/chronology-fetch.test.mjs`

**Interfaces:**
- Consumes: `extractTimeline`, `parseTimeline` (Task 1).
- Produces:
  - `star-wars-pages.mjs` exports `calendar` = `{id:'star-wars-yavin', name:'Galactic Standard Calendar (Battle of Yavin)', franchise:'star-wars', anchor_event:'Battle of Yavin', unit:'year', era_before:'BBY', era_after:'ABY', zero_year_exists:true}` and `pages: Record<workId, string>` with the 18 entries of the spec's page map (seed work ids from the seed: e.g. `film--a-new-hope--1977` → `Star Wars: Episode IV A New Hope`).
  - `fetch-wookieepedia-dates.mjs` exports `buildEntry(workId: string, pageTitle: string, apiPage: {title: string; revisions?: {revid?: number; slots: {main: {'*': string}}}[]; pageid?: number}, revid: number | null, now: Date): Entry | {error: string}` where `Entry = {page, url, revision, retrievedAt, field, raw, parsed, periods}`; `url` is `https://starwars.fandom.com/wiki/<title with spaces→_ , URL-encoded>`.
  - Data file shape: `{source:{name:'Wookieepedia',licence:'CC BY-SA 3.0',licence_url:'https://creativecommons.org/licenses/by-sa/3.0/',note:'…'}, calendar, generatedAt, entries:{[workId]: Entry}}`.

- [ ] **Step 1: Write the failing test** `tests/chronology-fetch.test.mjs`: `buildEntry` with a fake API page whose wikitext has `|canon_timeline=[[32 BBY]]` returns `periods[0].start === -32`, `parsed:true`, `revision` = given revid, `url === 'https://starwars.fandom.com/wiki/Star_Wars:_Episode_I_The_Phantom_Menace'`; a page with no timeline field returns `{error: …}` (never an entry with invented periods); a page whose field is unparseable returns an entry with `parsed:false, periods:[]` and the `raw` kept. Also assert every key of `pages` exists in `public/data/media_atlas_seed.json` works (guards typos in the map).
- [ ] **Step 2: Run** `node --test tests/chronology-fetch.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** both files. The script's main part (guarded by `import.meta.url === pathToFileURL(process.argv[1]).href`, like `db/import.mjs`): for each map entry call `https://starwars.fandom.com/api.php?action=query&prop=revisions&rvprop=ids|content&rvslots=main&redirects=1&format=json&titles=<page>` with the `User-Agent` from Global Constraints, 300 ms apart; keep existing entries on a failed fetch; write the file; print `Filled N · unparsed M · failed K`.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Run the script for real:** `node scripts/fetch-wookieepedia-dates.mjs` — Expected: `Filled 18 · unparsed 0 · failed 0`. Open the file and confirm by eye: Phantom Menace `-32`, A New Hope `-1..0`, Solo primary `-10`, Rogue One primary `-1` `days_before`, Ahsoka `open_after` start `9`, Mandalorian & Grogu `circa` `14`. If a count differs, fix the map/parser — do not hand-edit the data file.
- [ ] **Step 6: Commit** `feat: import Star Wars in-world dates from Wookieepedia` (the data file is committed, per the spec).

---

### Task 3: Database migration and import pass

**Files:**
- Create: `db/migrations/004_inworld_chronology.sql`
- Modify: `db/import.mjs`, `db/test/import.test.mjs`, `db/IMPORT.md`

**Interfaces:**
- Consumes: the data file shape (Task 2).
- Produces: `importSeed(db, seed, {dryRun?: boolean; chronology?: ChronologyFile[]})` — `chronology` defaults to `[]`; the CLI entry loads every `public/data/chronology/*.json`. Counts gain `fictional_calendars` and `narrative_periods` (`{inserted, updated}`).

- [ ] **Step 1: Write the failing tests** in `db/test/import.test.mjs`, using the real `public/data/chronology/star-wars.json`:
  - migrations list includes `004_inworld_chronology.sql`;
  - after `importSeed(db, seed, {chronology:[file]})`: one `fictional_calendars` row `star-wars-yavin` with `era_before='BBY'`; `narrative_periods` count equals the sum of `periods.length` over entries with `parsed`; every row `review_status='needs_review'`; rows from `open_after` entries have `certainty='unknown'`, all others `'estimated'`; no row `confirmed`;
  - each work has at most one `is_primary` period (the primary one), and Ahsoka's has `end_value IS NULL`;
  - a period marked `reviewed` (update `review_status='reviewed', reviewed_at=current_date, start_value=999`) keeps `start_value=999` after a second import;
  - an entry with `parsed:false` creates no row; an entry for a work id not in the seed throws `/is not in the imported seed/`;
  - a row with `start_value > end_value` is refused (`23514`).
- [ ] **Step 2: Run** `npm run test:db` — Expected: FAIL (migration/columns missing).
- [ ] **Step 3: Write** `004_inworld_chronology.sql`: table `fictional_calendars(id text PK, name, franchise_id bigint REFERENCES franchises(id), anchor_event, unit CHECK (unit IN ('year')), era_before, era_after, zero_year_exists boolean DEFAULT true, seed_key not needed)` and `ALTER TABLE narrative_periods ADD` `seed_key text`, `calendar_id text REFERENCES fictional_calendars(id)`, `start_value integer`, `end_value integer`, `qualifier text CHECK (qualifier IN ('exact','circa','open_after','days_before'))`, `raw_text text`, `source_page text`, `source_revision bigint`, `retrieved_at timestamptz`, `licence text`, the three review columns plus `narrative_periods_review_needs_date` and `CHECK (start_value IS NULL OR end_value IS NULL OR start_value <= end_value)`, and a unique index on `seed_key WHERE seed_key IS NOT NULL` (same style as migrations 001–003).
- [ ] **Step 4: Implement the pass** at the end of `run` in `db/import.mjs`: upsert the calendar by `id` (franchise via `ids.franchises`), then each parsed entry's periods with `seed_key = "<workId>#<index>"`, `label = period.label ?? 'Story'`, `calendar = calendar_id`, `certainty` per Global Constraints, `is_primary = period.primary`, via `upsertSql('narrative_periods', [...])` so reviewed rows freeze; keep a verbatim payload with `keepPayload(query, 'chronology', …)`; update `RELATION_TABLES`/counts and `checkSections` untouched (the file is not a seed section). Update the CLI to read the files.
- [ ] **Step 5: Run** `npm run test:db` — Expected: all pass (previous 54 + new).
- [ ] **Step 6:** add a "Fourth pass" paragraph to `db/IMPORT.md` (source, certainty rule, freeze rule). **Commit** `feat: import in-world periods and fictional calendars`.

---

### Task 4: Pure chronology logic

**Files:**
- Create: `src/chronology.ts` (no imports — it must run under `node --test` with native type stripping)
- Test: `tests/chronology.test.mjs` (imports `../src/chronology.ts`)

**Interfaces:**
- Produces (all exported from `src/chronology.ts`):
  - `type Qualifier = 'exact'|'circa'|'open_after'|'days_before'`; `type Period = {label: string|null; start: number|null; end: number|null; qualifier: Qualifier; primary: boolean}`; `type Calendar = {id: string; name: string; eraBefore: string; eraAfter: string; anchorEvent: string}`.
  - `formatYear(value: number, cal: Calendar): string` — `-32`→`"32 BBY"`, `0`→`"0 ABY"`, `-1`→`"1 BBY"`, `9`→`"9 ABY"`.
  - `formatSpan(period: Period, cal: Calendar): string` — `"22 BBY–19 BBY"`, `"32 BBY"` when start=end, `"9 ABY"` for `open_after` (the UI adds the "or later" wording).
  - `primaryOf(periods: Period[]): Period | undefined`.
  - `axisGroups<T extends {id: string; periods: Period[]}>(works: T[]): {groups: {start: number; ids: string[]}[]; undated: string[]}` — groups by the primary period's `start`, ascending, ties share a group in input order; works with no primary start are in `undated`.
  - `gapFor(delta: number, scale: 'equal'|'proportional'): number` — pixels; `equal` → 30; `proportional` → `min(340, max(24, delta*16))`.
  - `orderConflicts(listOrder: string[], startById: Map<string, number>): {earlier: string; later: string}[]` — walks `listOrder` skipping ids without a start; reports each pair of *consecutive dated* ids whose starts decrease; equal starts are not a conflict.

- [ ] **Step 1: Write the failing tests** (assertions as in the signatures above, plus): `formatYear(0)==='0 ABY'`; `formatYear(-1)==='1 BBY'`; `axisGroups` puts The Last Jedi and The Force Awakens (both `start:34`) in one group `ids:[…]` and a work with `periods:[]` in `undated`; an `open_after` period with `start:9,end:null` groups at 9; `orderConflicts(['a','b','c'], new Map([['a',5],['b',3],['c',4]]))` → `[{earlier:'a',later:'b'}]`; `orderConflicts(['a','x','b'], new Map([['a',1],['b',2]]))` → `[]` (undated skipped); equal starts → `[]`.
- [ ] **Step 2: Run** `node --test tests/chronology.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** in `src/chronology.ts`.
- [ ] **Step 4: Run** the test plus `npx tsc --noEmit` — Expected: PASS and no type errors.
- [ ] **Step 5: Commit** `feat: pure chronology helpers (format, axis groups, order conflicts)`.

---

### Task 5: Load the data into the app and show it in the detail panel

**Files:**
- Modify: `src/data.ts`, `src/components/DetailPanel.tsx`, `src/App.tsx`, `src/i18n.ts`, `src/style.css`

**Interfaces:**
- Consumes: `Period`, `Calendar`, `formatSpan` (Task 4); the data file (Task 2).
- Produces: `Work.inWorld?: {calendarId: string; page: string; url: string; revision: number; periods: Period[]}`; `Dataset.calendars: Map<string, Calendar & {franchise: string}>` (`franchise` = franchise **name**); `buildDataset(seed, metadata?, credits?, chronology?: ChronologyFile[])`.

- [ ] **Step 1: Implement** loading in `data.ts` with the existing `loadLocalJson` (it already tolerates a missing/HTML response): fetch `/data/chronology/star-wars.json` (constant `CHRONOLOGY_FILES = ['star-wars']`); validate defensively (array of periods, finite numbers) and drop an entry that fails; set `Work.inWorld` only for `parsed` entries; fill `calendars`. Add `calendars: new Map()` to the empty dataset literal in `App.tsx`.
- [ ] **Step 2: Detail panel:** under the memberships, when `work.inWorld` exists show a row: label "In-world", each period as `formatSpan` + its label and qualifier wording (`circa` → "c.", `open_after` → "or later", `days_before` → "days before"), the line "Dates from Wookieepedia, CC BY-SA 3.0" linking to `inWorld.url`, marked imported/unverified like the TMDB years. i18n keys en/es: `inworld.title`, `inworld.circa`, `inworld.openAfter`, `inworld.daysBefore`, `inworld.source`.
- [ ] **Step 3: Footer attribution:** one line in the footer naming Wookieepedia and CC BY-SA 3.0 with links (only when a calendar was loaded).
- [ ] **Step 4: Verify:** `npx tsc --noEmit` passes; `npm run dev`, open `/?work=film--a-new-hope--1977` — Expected: the panel shows "1 BBY–0 ABY", the attribution and a working link; open `/?work=film--rogue-one-a-star-wars-story--2016` — Expected: "1 BBY · days before" first, "13 BBY · Prologue" second.
- [ ] **Step 5: Verify it degrades:** temporarily rename `public/data/chronology/star-wars.json`, reload — Expected: the app loads, no "In-world" row, no footer line, no console error; restore the file.
- [ ] **Step 6: Commit** `feat: show Wookieepedia in-world dates in the detail panel`.

---

### Task 6: The axis view

**Files:**
- Create: `src/components/AxisView.tsx`
- Modify: `src/components/Views.tsx` (`SequenceView`), `src/App.tsx`, `src/i18n.ts`, `src/style.css`

**Interfaces:**
- Consumes: `axisGroups`, `gapFor`, `orderConflicts`, `formatYear`, `formatSpan` (Task 4); `Work.inWorld`, `Dataset.calendars` (Task 5).
- Produces: `AxisView({dataset, works, calendarId, scale, onScale, t, onSelect}: {dataset: Dataset; works: Work[]; calendarId: string; scale: 'equal'|'proportional'; onScale: (s: 'equal'|'proportional') => void; t: TFn; onSelect: (id: string) => void})`; `SequenceView` gains a `List | Axis` segmented control, shown only when `dataset.calendars.size > 0`, URL param `axis=1`.

- [ ] **Step 1: Implement `AxisView`:** works of the calendar's franchise that are in `works` (the filtered list); `axisGroups` over `{id, periods: work.inWorld?.periods ?? []}`; render a vertical axis like `TimelineView` (rows with the year label via `formatYear`, spacing via `gapFor`), ranges as a bar whose height follows the primary period's span (min height for a single year), `open_after` marked with an open end, a tied group listing all its works side by side, and a section "No in-world date" for `undated` (never dropped). Spacing control: only Equal and Proportional (map a stored `log` setting to `proportional`).
- [ ] **Step 2: Consistency note:** for each sequence of that franchise (`dataset.sequences`) build `startById` from the primary starts and call `orderConflicts(sequence.items.map(i => i.workId), startById)`; list each conflict as "«X» is listed before «Y» but dated later" with both works clickable; when there are none show nothing (do not claim agreement). Wording keys en/es: `axis.conflict`, `axis.undated`, `axis.open`, `axis.tie`, `view.axis`, `view.list`.
- [ ] **Step 3: Wire** the toggle into `SequenceView` and the `axis` URL param in `App.tsx` (read in `readUrl`, write in the URL effect, handle `popstate`).
- [ ] **Step 4: Verify** with `npm run dev` at `/?view=sequence&axis=1` — Expected: Star Wars axis from 32 BBY to 35 ABY; *The Last Jedi* and *The Force Awakens* in one tie group at 34 ABY; the five series positioned (Rebels shows 5–1 BBY, Ahsoka opens at 9 ABY); Star Wars' "No in-world date" section absent only because all 18 are dated; a franchise with no calendar (e.g. Alien) is not in the axis view. Then add a franchise filter `?franchise=Alien&view=sequence&axis=1` — Expected: no axis section, no error.
- [ ] **Step 5: Conflict note:** the logic is unit-tested in Task 4; here confirm only that the real Star Wars data shows **no** conflict note (the dates agree with the seed's list for the 13 listed films).
- [ ] **Step 6:** `npx tsc --noEmit` and `npm run build` pass; `npm test` passes. **Commit** `feat: in-world calendar axis with order-consistency note`.

---

### Task 7: Docs, handoff, final check

**Files:**
- Modify: `docs/agent/HANDOFF.md`, `README.md`, `docs/agent/JOURNAL.md`, `../../AgenticHub/workspace-panel/working/ROADMAP.md` (path from the repo root: `D:\Workspaces\AgenticHub\workspace-panel\working\ROADMAP.md`)

- [ ] **Step 1:** README: add "In-world chronology" (what the data is, source and licence, how to refresh with `node scripts/fetch-wookieepedia-dates.mjs`, how to add a franchise: a calendar block + page map + run). HANDOFF: state, the two decisions taken, what is unverified (Wookieepedia's canon dates are its claim), and next steps (Legends, second franchise, reviewing periods). JOURNAL: dated entry. ROADMAP: Visual Atlas line updated.
- [ ] **Step 2: Final verification:** `npm test` (all suites), `npm run build`, and in the browser the three checks from Tasks 5–6. Report the actual counts.
- [ ] **Step 3: Commit** `docs: record the in-world chronology pilot`.
