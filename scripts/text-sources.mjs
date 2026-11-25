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
/** Staff who made the work (story, art, original creator); translators, assistants and editors are left out. */
const MAKER_ROLE = /\b(story|art|original creator|creator)\b/i;
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
      .filter((edge) => MAKER_ROLE.test(String(edge.role ?? '')))
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
      issues: Number.isInteger(row.count_of_issues) ? row.count_of_issues : null,
      publisher: isObject(row.publisher) && typeof row.publisher.name === 'string' ? row.publisher.name : null,
      coverUrl: isObject(row.image) && isHttps(row.image.original_url) ? row.image.original_url : null,
    }));
}

/**
 * The one candidate whose normalised title equals `wanted` (the year breaks a tie);
 * null when none or several remain. Nothing is matched by guesswork.
 */
export function chooseTitle(candidates, wanted, year = null, originalPublishers = null) {
  let rows = candidates.filter((row) => normalise(row.title) === normalise(wanted));
  if (rows.length > 1 && year !== null) rows = rows.filter((row) => row.year === year);
  if (rows.length > 1 && originalPublishers) {
    // Many volumes share a title (reprints by foreign publishers, later relaunches): keep the
    // original publishers' and take the earliest, unless two of them start in the same year.
    const own = rows.filter((row) => row.year !== null && originalPublishers.includes(row.publisher));
    const first = Math.min(...own.map((row) => row.year));
    rows = own.filter((row) => row.year === first);
    if (rows.length > 1) {
      const most = Math.max(...rows.map((row) => row.issues ?? 0));
      const longest = rows.filter((row) => (row.issues ?? 0) === most);
      if (most > 0) rows = longest;
    }
  }
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

/**
 * The file extension for an image whose declared type and first bytes agree:
 * 'jpg', 'png' or 'webp'; null for anything else (an SVG or an HTML error page
 * served as an image never becomes a cover).
 */
export function imageType(contentType, bytes) {
  const declared = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  const at = (offset, ...values) => values.every((value, index) => bytes[offset + index] === value);
  if (declared === 'image/jpeg' && at(0, 0xff, 0xd8, 0xff)) return 'jpg';
  if (declared === 'image/png' && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (declared === 'image/webp' && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'webp';
  return null;
}
