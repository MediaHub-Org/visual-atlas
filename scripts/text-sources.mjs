// Pure parsing for the text-media sources (AniList for manga, Comic Vine for western
// comics). No network and no file access here, so tests run on synthetic fixtures.
// Every parser returns null / [] on malformed input and never throws: a bad response
// is a skipped work, not a crash.
import { normalise } from './match.mjs';

const isHttps = (value) => typeof value === 'string' && /^https:\/\//.test(value);
const plausibleYear = (value) => {
  const year = typeof value === 'string' && /^\d{4}$/.test(value) ? Number(value) : value;
  return Number.isInteger(year) && year > 1800 && year < 2200 ? year : null;
};
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * AniList `Media` response -> {id, titles, year, status, creators, coverUrl, relations}
 * or null. Titles are every non-empty variant (romaji, english, native), so a match
 * can be checked against all of them.
 */
export function parseAniListMedia(json) {
  const media = isObject(json) && isObject(json.data) ? json.data.Media : null;
  if (!isObject(media) || !Number.isInteger(media.id)) return null;
  const title = isObject(media.title) ? media.title : {};
  const edges = (list) => (isObject(list) && Array.isArray(list.edges) ? list.edges.filter(isObject) : []);
  return {
    id: media.id,
    titles: [title.romaji, title.english, title.native].filter((text) => typeof text === 'string' && text),
    year: plausibleYear(isObject(media.startDate) ? media.startDate.year : null),
    status: typeof media.status === 'string' ? media.status : null,
    creators: edges(media.staff)
      .filter((edge) => isObject(edge.node) && isObject(edge.node.name) && typeof edge.node.name.full === 'string')
      .map((edge) => ({ name: edge.node.name.full, role: typeof edge.role === 'string' ? edge.role : '' })),
    coverUrl: isObject(media.coverImage) && isHttps(media.coverImage.large) ? media.coverImage.large : null,
    relations: edges(media.relations)
      .filter((edge) => isObject(edge.node) && Number.isInteger(edge.node.id))
      .map((edge) => ({
        relationType: String(edge.relationType ?? ''),
        id: edge.node.id,
        type: String(edge.node.type ?? ''),
        format: String(edge.node.format ?? ''),
        title: isObject(edge.node.title) ? (edge.node.title.english || edge.node.title.romaji || '') : '',
      })),
  };
}

/** Comic Vine search response -> [{id, title, year, publisher, coverUrl}]; bad rows are skipped. */
export function parseComicVineSearch(json) {
  if (!isObject(json) || !Array.isArray(json.results)) return [];
  return json.results
    .filter((row) => isObject(row) && Number.isInteger(row.id) && typeof row.name === 'string' && row.name)
    .map((row) => ({
      id: row.id,
      title: row.name,
      year: plausibleYear(row.start_year),
      publisher: isObject(row.publisher) && typeof row.publisher.name === 'string' ? row.publisher.name : null,
      coverUrl: isObject(row.image) && isHttps(row.image.original_url) ? row.image.original_url : null,
    }));
}

/**
 * The one candidate whose normalised title equals `wanted` (the year breaks a tie);
 * null when none or several remain. Nothing is matched by guesswork.
 */
export function chooseTitle(candidates, wanted, year = null) {
  let rows = candidates.filter((row) => normalise(row.title) === normalise(wanted));
  if (rows.length > 1 && year !== null) rows = rows.filter((row) => row.year === year);
  return rows.length === 1 ? rows[0] : null;
}

/**
 * Relations a source reports as adaptations -> proposals for the owner to review.
 * Deliberately not the seed's adaptation shape: a proposal has no id, certainty or
 * endpoint, so it can never be imported by accident.
 */
export function adaptationProposals(workId, media) {
  if (!media) return [];
  return media.relations
    .filter((relation) => relation.relationType === 'ADAPTATION')
    .map((relation) => ({
      sourceWorkId: workId,
      adaptedTitle: relation.title,
      kind: relation.type === 'ANIME' ? (relation.format === 'MOVIE' ? 'film' : 'anime') : 'other',
      source: 'anilist',
      sourceRef: relation.id,
    }));
}
