// Where the app is served from. Relative ('./') so the same build works at a site root and under a
// project path such as mediahub-org.github.io/visual-atlas/. Optional chaining keeps this importable
// from `node --test`, where Vite's import.meta.env does not exist.
const env = (import.meta as { env?: { BASE_URL?: string; DEV?: boolean } }).env;

/** Prefix for files the page loads at run time (data, covers, images). */
export const BASE = env?.BASE_URL ?? './';

/** True under `npm run dev`: the local poster and cover endpoints only exist there. */
export const DEV = env?.DEV === true;
