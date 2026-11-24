// Pure helpers for the two catalogues (video and text media). The medium is derived
// from a work's format, never stored. No imports, so `node --test` can run it
// directly (tests/medium.test.mjs).

export type Medium = 'video' | 'text';
export type Adaptation = {
  id: string;
  sourceId: string;
  adaptedId: string;
  kind: string;
  certainty: 'unknown' | 'estimated' | 'confirmed';
};

const TEXT_FORMATS = new Set(['comic_series', 'manga_series', 'graphic_novel']);

/** Seed/database format -> medium; an unknown format is video, never text. */
export function mediumOfFormat(format: string): Medium {
  return TEXT_FORMATS.has(format) ? 'text' : 'video';
}

/** The `media` URL parameter: only "text" selects the text catalogue. */
export function parseMedium(raw: string | null): Medium {
  return raw === 'text' ? 'text' : 'video';
}

/** Franchises with at least one work of the given medium. */
export function catalogueFranchises<T extends { id: string }>(
  franchises: T[],
  works: { id: string; medium: Medium; memberships: { franchiseId: string }[] }[],
  medium: Medium,
): T[] {
  const present = new Set<string>();
  for (const work of works) {
    if (work.medium !== medium) continue;
    for (const membership of work.memberships) present.add(membership.franchiseId);
  }
  return franchises.filter(franchise => present.has(franchise.id));
}

/** Links of a work by direction; a link whose other end is not loaded is dropped. */
export function adaptationsFor(
  workId: string,
  all: Adaptation[],
  exists: (id: string) => boolean,
): { asSource: Adaptation[]; asAdapted: Adaptation[] } {
  return {
    asSource: all.filter(link => link.sourceId === workId && exists(link.adaptedId)),
    asAdapted: all.filter(link => link.adaptedId === workId && exists(link.sourceId)),
  };
}

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const rowsOf = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);
const CERTAINTIES = ['unknown', 'estimated', 'confirmed'];

/**
 * The video seed plus the text seed's works, franchises, continuities and
 * memberships, and the validated adaptation links. A malformed or absent text seed
 * returns the very same video seed; a bad text row is dropped, never fatal, and a
 * text id that the video seed already uses never replaces the video row.
 */
export function mergeTextSeed<S extends { works: Row[]; franchises: Row[]; continuities: Row[]; memberships: Row[] }>(
  seed: S,
  raw: unknown,
): { seed: S; adaptations: Adaptation[] } {
  if (!isRow(raw)) return { seed, adaptations: [] };
  const workIds = new Set(seed.works.map(row => row.id));
  const franchiseIds = new Set(seed.franchises.map(row => row.id));
  const continuityIds = new Set(seed.continuities.map(row => row.id));

  const works = rowsOf(raw.works).filter(row => {
    if (!isText(row.id) || !isText(row.title) || !isText(row.format) || mediumOfFormat(row.format) !== 'text' || workIds.has(row.id)) return false;
    workIds.add(row.id);
    return true;
  });
  const textWorkIds = new Set(works.map(row => row.id));
  const franchises = rowsOf(raw.franchises).filter(row => {
    if (!isText(row.id) || !isText(row.name) || franchiseIds.has(row.id)) return false;
    franchiseIds.add(row.id);
    return true;
  });
  const continuities = rowsOf(raw.continuities).filter(row => {
    if (!isText(row.id) || !isText(row.name) || continuityIds.has(row.id)) return false;
    continuityIds.add(row.id);
    return true;
  });
  const memberships = rowsOf(raw.memberships).filter(row =>
    isText(row.work_id) && textWorkIds.has(row.work_id) && isText(row.franchise_id) && franchiseIds.has(row.franchise_id));
  const adaptations = rowsOf(raw.adaptations)
    .filter(row => isText(row.id) && isText(row.source_work_id) && isText(row.adapted_work_id) && isText(row.kind)
      && workIds.has(row.source_work_id) && workIds.has(row.adapted_work_id) && row.source_work_id !== row.adapted_work_id
      && CERTAINTIES.includes((row.certainty ?? 'unknown') as string))
    .map(row => ({
      id: row.id as string,
      sourceId: row.source_work_id as string,
      adaptedId: row.adapted_work_id as string,
      kind: row.kind as string,
      certainty: (row.certainty ?? 'unknown') as Adaptation['certainty'],
    }));

  if (works.length + franchises.length + continuities.length + memberships.length === 0) return { seed, adaptations };
  return {
    seed: {
      ...seed,
      works: [...seed.works, ...works],
      franchises: [...seed.franchises, ...franchises],
      continuities: [...seed.continuities, ...continuities],
      memberships: [...seed.memberships, ...memberships],
    },
    adaptations,
  };
}

export type TextMetadata = { source: string; year: number | null; creators: { name: string; role: string }[] };

/**
 * A work's entry in the local text-metadata cache, or null when there is none, it is
 * past its `expires` date (the sources' caching limits), or the cache is malformed.
 */
export function textMetadataFor(cache: unknown, workId: string, now = Date.now()): TextMetadata | null {
  const entries = isRow(cache) && isRow(cache.entries) ? cache.entries : null;
  const entry = entries?.[workId];
  if (!isRow(entry) || typeof entry.expires !== 'string' || !(Date.parse(entry.expires) > now)) return null;
  const year = Number.isInteger(entry.year) && (entry.year as number) > 1800 && (entry.year as number) < 2200 ? (entry.year as number) : null;
  const creators = Array.isArray(entry.creators)
    ? rowsOf(entry.creators).filter(row => isText(row.name)).map(row => ({ name: row.name as string, role: typeof row.role === 'string' ? row.role : '' }))
    : [];
  return { source: typeof entry.source === 'string' ? entry.source : '', year, creators };
}
