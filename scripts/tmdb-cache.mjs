// TMDB allows caching its content for at most six months; 150 days stays safely
// inside that. Used by the poster adapter (vite.config.ts) and fetch-metadata.mjs.
export const TMDB_CACHE_DAYS = 150;

/** ISO date `TMDB_CACHE_DAYS` after `from`. */
export function tmdbExpiry(from = new Date()) {
  return new Date(from.getTime() + TMDB_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
