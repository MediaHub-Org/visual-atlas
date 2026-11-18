# Handoff

2026-11-18 — Initial local frontend prototype. Data is provisional, sparse,
and not independently verified; do not publish it as a factual catalogue.
The implementation is read-only, with URL-backed browsing and a detail panel.
No administrator authentication, database, imports, calendar conversion,
verified artwork or sourced editorial claims have been implemented.

Build passed with `npm run build`; `npm audit --omit=dev` reported no
production vulnerabilities. The full install reported two development
dependency vulnerabilities; investigate upgrades before exposing dev tools.

Next: verify representative records with sources and licensing, design the
many-to-many PostgreSQL schema (including dated rights and provenance), then
implement authenticated editorial workflows. Expand views and test usability.
