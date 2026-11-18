# Frame — Visual Atlas

A first, local-only React/Vite prototype of a visual atlas of film and television.

Run `npm install`, then `npm run dev`. `npm run build` checks types and builds.
The small sample in `src/data.ts` is **unverified demonstration data**, not a
publishable catalogue. Artwork is generated locally; no external image licences
are implied. This prototype has no backend, database, admin authentication or
editing. See `docs/agent/HANDOFF.md` for scope and next steps.

`db/schema.sql` contains a proposed data model, not an applied migration. The
frontend does not yet use a database. The development server is intended for
local use only; do not expose it publicly.
