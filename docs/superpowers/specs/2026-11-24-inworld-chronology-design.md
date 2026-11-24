# In-world chronology (pilot: Star Wars) — design

Date: 2026-11-24. Status: waiting for the owner's approval; nothing is built yet.

## Why

The app's original idea is to read a universe in the order *inside its own
story* and in *its own calendar* (Star Wars: years before/after the Battle of
Yavin), not only in release order. Today the app has two things: a release
timeline (by real-world year) and the seed's "in-universe order" (an editorial
list, no dates, all `unknown`/`needs_review`). There are no in-world dates anywhere:
`narrative_periods` is empty and the schema only knows real-world calendars.

## Goals

- For the pilot franchise (Star Wars, the seed's only continuity "Main continuity"
  = canon), every work that Wookieepedia dates gets an **in-world period** in the
  BBY/ABY calendar, with its source.
- A view that draws the franchise on that calendar (an axis in BBY/ABY, ranges as
  bars, works without a date kept in list order), and a work's detail panel that
  shows its in-world date.
- The dates **check** the editorial order: where the seed's order contradicts the
  dates, the view says so instead of silently picking one.
- The method is a template: a second franchise means a calendar definition, a
  page map and a data file, not new code.

## Non-goals

- Wookieepedia's **Legends** timeline (`legends_timeline`); Legends is a different
  continuity and the seed does not have it.
- Other franchises, other calendars (stardates, Middle-earth eras): after the pilot.
- Dates inside a work (flashbacks, per-episode dates), and dates finer than a year.
- Presenting any date as verified. Wookieepedia is a fan wiki: its canon dates are
  *its* claim, shown as a claim.
- Inventing a date or an order where the source gives none.

## What Wookieepedia gives (checked 2026-11-24 against all 18 Star Wars works)

Every one of the 18 works has a page, with the date in the infobox as
`canon_timeline` (films before Solo) or `timeline` (the rest), in wikitext:

| Form | Example | Works |
|---|---|---|
| single year | `[[32 BBY]]` | Phantom Menace, Clone Wars film, Empire… |
| range | `[[1 BBY]]&ndash;[[0 ABY]]`, `[[22 BBY]]&ndash;[[19 BBY]]` | A New Hope, Clone Wars series, Andor |
| several entries with labels | `*[[10 BBY]] {{C|Main story}}` `*[[13 BBY]] {{C|Prologue}}` | Solo, Rogue One, Rebels |
| qualifiers | `c. [[14 ABY]]`, `During or after [[9 ABY]]`, `…days before…` | Mandalorian & Grogu, Ahsoka, Rogue One |

Wookieepedia's year 0 is the year of the Battle of Yavin ("0 ABY"); 1 BBY is the
year before. Linear value: BBY → −N, ABY → +N. The dates agree with the seed's
editorial order of the 13 films in the seed's Star Wars sequence (checked by hand);
the five series are not in that sequence at all, so the axis is the first place
they get an in-world position. Ties (The Last Jedi and The Force Awakens are both
34 ABY) are real and must be shown as ties.

Wookieepedia text is **CC BY-SA 3.0** (Fandom). Each stored date carries the page
title and URL, the revision id, the retrieval date, the licence and the raw
infobox string, and the UI shows the attribution next to the date and in the footer.

## Approaches considered

1. **Script with an explicit page map (chosen).** A script fetches each mapped
   page through the public MediaWiki API (one request per page, generic
   `User-Agent`), parses the timeline field and writes a reviewable data file.
   The map `work id → Wookieepedia page` is a checked-in table, because a title
   search is ambiguous (searching "A New Hope" returns novelisations first). Every
   value stays traceable to a revision and is re-runnable.
2. **Owner types the dates.** Safest, but slow and the provenance is "memory";
   it does not scale to the next franchise.
3. **Scrape without a map / search by title.** Fast and wrong: it would attach a
   novelisation's date to a film. Rejected.

## Design

### Data

- New table `fictional_calendars`: `id` (`star-wars-yavin`), `name`, `franchise_id`,
  `anchor_event` ("Battle of Yavin"), `unit` (`year`), `era_before` (`BBY`),
  `era_after` (`ABY`), `zero_year_exists` (true). It is data, not a CHECK list,
  so a new universe is a row.
- `narrative_periods` (exists, empty) gains: `seed_key`, `calendar_id`
  (→ `fictional_calendars`), `start_value`/`end_value` (signed years, null =
  unknown), `qualifier` (`exact` | `circa` | `open_after` | `days_before`),
  `raw_text`, `source_page`, `source_revision`, `retrieved_at`, `licence`, and
  the usual `review_status`. `certainty` follows the existing four values (below).
- A work may have several periods (Rebels: 5–1 BBY plus a 9 ABY epilogue); one is
  `is_primary` (the existing one-primary-per-work rule).

### Certainty (my proposal — see "To decide")

`estimated` for a stated year or range (the wiki's canon claim); `unknown` for an
open-ended date ("During or after 9 ABY": start only, no end); never `confirmed`.
Every row `needs_review`; only a person marks `reviewed`.

### Import

- `scripts/chronology/star-wars-pages.mjs`: the page map (18 entries, proposed
  below), reviewed by the owner.
- `scripts/fetch-wookieepedia-dates.mjs`: fetches, parses and writes
  `public/data/chronology/star-wars.json` (the app's data) with the fields above.
  A string the parser does not recognise is stored as `raw_text` with **no value**
  and reported; it is never guessed.
- `db/import.mjs` gets a fourth pass that loads that file into `narrative_periods`
  by `seed_key`, same draft rules as the other passes.
- Parser tests use the real strings from the table above.

### App

- `Work` gets `inWorld` periods (when the data file has them). The detail panel
  shows "In-world: 32 BBY — Wookieepedia (CC BY-SA 3.0)" with the link, marked as
  imported, like TMDB years.
- The "In-universe order" view, for a franchise with a calendar, gains an **axis
  mode**: a vertical axis in BBY/ABY, ranges drawn as bars, ties grouped, works
  without a date listed under "No in-world date". Spacing options reuse the
  release timeline's (equal / proportional); I would offer only those two.
- **Consistency note:** where the seed's list order disagrees with the dates the
  view marks the pair ("list order ≠ dates"); the dates are not applied silently.
- The seed's editorial list stays as is; the dates do not rewrite it.

### Proposed page map

| Work | Wookieepedia page |
|---|---|
| The Phantom Menace | Star Wars: Episode I The Phantom Menace |
| Attack of the Clones | Star Wars: Episode II Attack of the Clones |
| Clone Wars (film) | Star Wars: The Clone Wars (film) |
| Revenge of the Sith | Star Wars: Episode III Revenge of the Sith |
| Solo | Solo: A Star Wars Story |
| Rogue One | Rogue One: A Star Wars Story |
| A New Hope | Star Wars: Episode IV A New Hope |
| The Empire Strikes Back | Star Wars: Episode V The Empire Strikes Back |
| Return of the Jedi | Star Wars: Episode VI Return of the Jedi |
| The Mandalorian and Grogu | Star Wars: The Mandalorian and Grogu |
| The Force Awakens | Star Wars: Episode VII The Force Awakens |
| The Last Jedi | Star Wars: Episode VIII The Last Jedi |
| The Rise of Skywalker | Star Wars: Episode IX The Rise of Skywalker |
| Clone Wars (series) | Star Wars: The Clone Wars |
| Rebels | Star Wars Rebels |
| The Mandalorian | Star Wars: The Mandalorian |
| Andor | Star Wars: Andor |
| Ahsoka | Star Wars: Ahsoka |

## To decide (the two that change what gets built)

1. **The data file is committed, not a local cache.** Unlike TMDB (whose terms
   forbid redistribution), this data is the owner's curated, reviewed record and
   must persist; CC BY-SA allows keeping it with attribution. Calling it a local
   cache instead would make it vanish on a fresh clone. *Proposed: commit it.*
2. **Certainty `estimated` for a stated canon date** (and `unknown` for open-ended
   ones), rather than `unknown` for everything as with the editorial sequences.
   The difference is that these have a named source and revision. *Proposed.*

## Left to the builder

File layout of the parser, the exact axis rendering, the wording of the
consistency note, and the migration number (`004`).
