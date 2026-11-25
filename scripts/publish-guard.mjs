// What may and may not go into the public site. Pure, so `node --test` can run it
// (tests/publish-guard.test.mjs) and scripts/publish-site.mjs can enforce it.
//
// TMDB, AniList, Comic Vine and Wikipedia terms forbid redistributing their data and images:
// the posters, covers and local caches stay on the owner's computer, never in the published site.

const FORBIDDEN = [
  /(^|\/)posters\//,                                          // posters, covers, manifest and sidecars
  /\.(jpg|png|webp)\.json$/,                                   // a cover's provenance sidecar
  /(^|\/)tmdb_(metadata|credits)\.json$/,                      // imported TMDB years and credits
  /(^|\/)text_metadata\.json$/,                                // AniList / Comic Vine cache
  /(^|\/)text_adaptation_proposals\.json$/,                    // AniList adaptation proposals
  /(^|\/)\.env(\..*)?$/,                                       // secrets
  /(^|\/)node_modules\//,
  /(^|\/)db\/\.data\//,                                        // the local development database
];

/** Files (paths relative to the site root, with `/`) that must never be published. */
export function forbiddenFiles(paths) {
  return paths.filter((path) => FORBIDDEN.some((pattern) => pattern.test(path)));
}

const REQUIRED = ['index.html', '.nojekyll', 'data/media_atlas_seed.json', 'data/media_text_seed.json', 'data/universe_families.json'];

/** What a publishable site must have and does not. */
export function missingFiles(paths) {
  const have = new Set(paths);
  return REQUIRED.filter((path) => !have.has(path));
}
