# Universe families — proposal for owner review

Status: **proposal, not applied.** Nothing in the app reads this file yet. Once you
edit and approve it, it becomes `public/data/universe_families.json` and drives the
"In-universe order" grouping. Source: franchise and continuity ids in
`media_atlas_seed.json` (73 franchises). Shared-universe claims below are my own
editorial reading, **not verified against a source**; you decide each row.

## How to review

For every row change the **Decision** column to `yes`, `no` or `edit`. Only `yes`
rows become a family. Franchises not in any family stay as their own block (the
default, and the safe one).

Rule applied: a family groups franchises that the **owner says share one fictional
world**. It never merges continuities. Inside a family each continuity keeps its own
lane (a Raimi Spider-Man is not placed in the same lane as the MCU).

## A. Likely families (real shared worlds)

| # | Family | Franchises (seed ids) | Lanes (continuities) | Why / doubt | Decision |
|---|--------|-----------------------|----------------------|-------------|----------|
| 1 | Marvel | `marvel`, `x-men`, `spider-man` | marvel: main-universe, alternate-universes · x-men: original-branch, revised-branch, deadpool, uncertain-future-placements · spider-man: mcu-solo-films, raimi-trilogy, amazing-continuity, spider-verse | Doubt: `spider-man/mcu-solo-films` belongs with `marvel/main-universe`; X-Men films are a separate world until Deadpool & Wolverine. Proposed: group the family, keep the lanes apart, and mark the MCU-solo Spider-Man lane as "same world as marvel/main-universe" | |
| 2 | DC (live action) | `dceu`, `batman`, `superman` | dceu · batman: adam-west, burton-and-schumacher, nolan-trilogy, reeves-continuity · superman: classic-films, returns-branch, dceu-solo-film, dcu | Doubt: `superman/dceu-solo-film` is the same world as `dceu`; `superman/dcu` is the new DCU | |
| 3 | Monster / Godzilla | `godzilla` only | showa-main-cycle … minus-continuity (10 lanes) | Not a family, listed to show the biggest single-franchise block. Kong films are not in the seed | n/a |
| 4 | Conjuring Universe | `conjuring`, `insidious`? | conjuring: shared-universe-proposal | Doubt: Insidious is a separate world; I would **not** include it. Conjuring's own lane is already labelled a proposal | |
| 5 | Wizarding World | `wizarding-world` only | main-continuity | Single franchise; no family needed | n/a |
| 6 | Middle-earth | `middle-earth` only | modern-continuity, bakshi-adaptation | Single franchise; no family needed | n/a |

## B. Same title, different worlds (do NOT group)

These share a brand but I would keep them as separate blocks: `star-trek`
(prime vs. kelvin are already lanes inside one franchise), `planet-of-the-apes`,
`transformers`, `tmnt`, `pokemon`, `dragon-ball`, `resident-evil`, `toy-story`,
`muppets`, `halloween`, `exorcist`, `elm-street`, `evil-dead`, `terminator`.
Their continuities already separate them as lanes inside their own block.

## C. Possible cross-franchise links I am unsure about

| Pair | Question for you | Decision |
|------|------------------|----------|
| `alien` + `predator` | Crossover films exist (AVP), but are they one world? Not in the seed as a link | |
| `scream` + `scary-movie` | Parody of Scream, not the same world. Proposed: no | |
| `friday-13` + `elm-street` | Crossover film (Freddy vs. Jason). Proposed: no family | |
| `fast-furious` + `jurassic` … | None. Listed so nothing is assumed | n/a |

## D. What the app would show

Block per family (or per franchise when it is in no family), ordered by name. Inside
a block, one lane per continuity. A block whose franchise has a real calendar
(today only Star Wars) uses the calendar axis; every other block has no in-world
dates, so its lanes show the existing editorial `narrative` sequence and say so
("editorial proposal, no in-world dates"). No date is invented to make a block look
complete.

## E. Decisions I need from you

1. Rows 1, 2 and 4 above: `yes`, `no` or `edit`.
2. Is "family" a grouping of franchises, or do you want a deeper rule (e.g. the
   family also pulls the MCU-solo Spider-Man lane into the Marvel main lane)?
   Default if you do not say: group only, lanes stay separate.
3. Anything in section B you would rather group.
