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
// A seed link is never 'confirmed': only a reviewer in the database sets that (the import refuses it too).
const CERTAINTIES = ['unknown', 'estimated'];
const KINDS = ['anime', 'film', 'live_action', 'series', 'comic', 'novelisation', 'other'];

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
  const seenLinks = new Set<string>();
  const adaptations = rowsOf(raw.adaptations)
    .filter(row => {
      if (!isText(row.id) || !isText(row.source_work_id) || !isText(row.adapted_work_id) || !isText(row.kind)) return false;
      if (!KINDS.includes(row.kind) || !workIds.has(row.source_work_id) || !workIds.has(row.adapted_work_id) || row.source_work_id === row.adapted_work_id) return false;
      if (!CERTAINTIES.includes((row.certainty ?? 'unknown') as string)) return false;
      // One link per id and per (source, adapted, kind), as the database enforces.
      const keys = [`id:${row.id}`, `pair:${row.source_work_id}|${row.adapted_work_id}|${row.kind}`];
      if (keys.some(key => seenLinks.has(key))) return false;
      keys.forEach(key => seenLinks.add(key));
      return true;
    })
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

/** A franchise's works of one medium, each once (membership rows can repeat a pair). */
export function franchiseWorkIds(
  franchiseId: string,
  memberships: { work_id: string; franchise_id: string }[],
  mediumByWork: Map<string, Medium>,
  medium: Medium,
): string[] {
  const ids = new Set<string>();
  for (const row of memberships) {
    if (row.franchise_id === franchiseId && mediumByWork.get(row.work_id) === medium) ids.add(row.work_id);
  }
  return [...ids];
}

/** Views a URL may open in each catalogue (text media has no in-world order or company tree yet). */
const VIEWS_BY_MEDIUM: Record<Medium, string[]> = {
  video: ['cards', 'sequence', 'timeline', 'hierarchy'],
  text: ['cards', 'sequence', 'timeline'],
};
/** Format filter values of each catalogue. */
export const FORMATS_BY_MEDIUM: Record<Medium, string[]> = {
  video: ['Film', 'Series', 'Anime', 'Cartoon'],
  text: ['Manga', 'Comic', 'Graphic novel'],
};

/** A view the medium does not offer (or an unknown one) becomes 'cards'. */
export function clampView(view: string, medium: Medium): string {
  return VIEWS_BY_MEDIUM[medium].includes(view) ? view : 'cards';
}

/** A format filter the medium does not offer becomes 'All'. */
export function clampFormat(format: string, medium: Medium): string {
  return FORMATS_BY_MEDIUM[medium].includes(format) ? format : 'All';
}

/** Whether a work passes a format filter: 'All' always, 'Anime' and 'Cartoon' are flags across Film and Series, the rest compare the format. */
export function matchesFormat(work: { format: string; anime?: boolean; cartoon?: boolean }, format: string): boolean {
  if (format === 'All') return true;
  if (format === 'Anime') return work.anime === true;
  if (format === 'Cartoon') return work.cartoon === true;
  return work.format === format;
}

/**
 * The sidebar's two lists for either catalogue (Watch or Read), each narrowed by the
 * other's selection: format counts follow the chosen franchise, and the franchise list
 * follows the chosen format. A selected franchise stays listed even with no match, so
 * it can always be cleared.
 */
export function facetLists(
  works: { medium: Medium; format: string; anime?: boolean; cartoon?: boolean; memberships: { franchiseId: string; franchise: string }[] }[],
  medium: Medium,
  format: string,
  franchise: string,
  /** Franchise ids of the chosen universe family (Marvel, DC), or null for none. */
  universeIds: string[] | null = null,
): { formats: { id: string; count: number }[]; franchises: { id: string; name: string; count: number }[] } {
  const inMedium = works.filter(work => work.medium === medium);
  const inUniverse = universeIds ? inMedium.filter(work => work.memberships.some(m => universeIds.includes(m.franchiseId))) : inMedium;
  const inFranchise = inUniverse.filter(work => franchise === 'All' || work.memberships.some(m => m.franchise === franchise));
  const inFormat = inMedium.filter(work => matchesFormat(work, format));
  const formats = FORMATS_BY_MEDIUM[medium]
    .map(id => ({ id, count: inFranchise.filter(work => matchesFormat(work, id)).length }))
    .filter(entry => entry.count > 0);
  const byFranchise = new Map<string, { id: string; name: string; count: number }>();
  for (const work of inFormat) {
    for (const m of work.memberships) {
      const entry = byFranchise.get(m.franchise) ?? { id: m.franchiseId, name: m.franchise, count: 0 };
      entry.count += 1;
      byFranchise.set(m.franchise, entry);
    }
  }
  if (franchise !== 'All' && !byFranchise.has(franchise)) {
    const id = inMedium.flatMap(work => work.memberships).find(m => m.franchise === franchise)?.franchiseId ?? franchise;
    byFranchise.set(franchise, { id, name: franchise, count: 0 });
  }
  return { formats, franchises: [...byFranchise.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

/**
 * Remasters (3D conversions, restorations, special editions) are separate works that re-release
 * another film or series. The user shows or hides them; the list keeps its order, and the same
 * array comes back when nothing is hidden.
 */
export function withoutRemasters<T extends { remasterOf?: string }>(works: T[], show: boolean): T[] {
  if (show) return works;
  const kept = works.filter(work => !work.remasterOf);
  return kept.length === works.length ? works : kept;
}

/**
 * The people of a comic or manga: the curated seed's creators when it has any well-formed
 * ones, otherwise the imported ones (the seed is the reviewed source, the cache is a guess).
 */
export function creatorsOf(seedCreators: unknown, imported: { name: string; role: string }[]): { name: string; role: string }[] {
  if (!Array.isArray(seedCreators)) return imported;
  const own = seedCreators
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && typeof (row as Record<string, unknown>).name === 'string' && ((row as Record<string, unknown>).name as string).length > 0)
    .map(row => ({ name: row.name as string, role: typeof row.role === 'string' ? row.role : '' }));
  return own.length > 0 ? own : imported;
}

/** Where a story is set: on Earth, or in a completely fictional world (works.setting, migration 006). */
export type Setting = 'earth' | 'fictional_world' | 'unknown';
export type SettingFilter = 'All' | Setting;

/** A URL or stored value becomes a known filter, or 'All'. */
export function parseSetting(value: string | null | undefined): SettingFilter {
  return value === 'earth' || value === 'fictional_world' || value === 'unknown' ? value : 'All';
}

/** Whether a work passes the setting filter; a work with no classification is 'unknown'. */
export function matchesSetting(work: { setting?: string }, filter: SettingFilter): boolean {
  if (filter === 'All') return true;
  return (work.setting === 'earth' || work.setting === 'fictional_world' ? work.setting : 'unknown') === filter;
}

/** How many of the works fall under each setting (for the filter's labels). */
export function settingCounts(works: { setting?: string }[]): Record<Setting, number> {
  const counts: Record<Setting, number> = { earth: 0, fictional_world: 0, unknown: 0 };
  for (const work of works) counts[work.setting === 'earth' || work.setting === 'fictional_world' ? work.setting : 'unknown'] += 1;
  return counts;
}
