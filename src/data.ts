import type { Calendar, Period, Qualifier } from './chronology';

export type Person = { id: number; name: string };
export type Credits = {
  tmdbId: number;
  kind: 'movie' | 'tv';
  directors: Person[];
  /** Writers of a film, or the creators of a series (job "Creator"). */
  writers: (Person & { job: string })[];
  cast: (Person & { character: string | null })[];
};

/** In-world dates of a work, imported from Wookieepedia (public/data/chronology). */
export type InWorld = {
  calendarId: string;
  page: string;
  url: string;
  revision: number | null;
  periods: Period[];
};

export type Membership = { franchiseId: string; franchise: string; continuity: string };
export type Work = {
  id: string;
  title: string;
  year: number | null;
  /** True when the year came from imported TMDB metadata, not the curated seed. */
  yearImported?: boolean;
  format: 'Film' | 'Series';
  memberships: Membership[];
  anime: boolean;
  animated: boolean;
  creators: string;
  /** In-world dates; absent when the chronology file has none for this work. */
  inWorld?: InWorld;
  /** Imported from TMDB, absent until `scripts/fetch-credits.mjs` has run or once expired. */
  credits?: Credits;
  description: string;
  color: string;
};
export type Company = {
  id: string;
  name: string;
  parentId: string | null;
  childIds: string[];
  franchiseIds: string[];
  subtreeFranchiseIds: string[];
  depth: number;
};
export type Franchise = { id: string; name: string; companyIds: string[]; workIds: string[] };
export type EditorialTag = { id: string; name: string; rationale: string };

export type Dataset = {
  works: Work[];
  worksById: Map<string, Work>;
  /** Imported people (TMDB id -> name) for the person filter and search. */
  people: Map<number, string>;
  /** In-world calendars by id (`franchise` is the franchise name), and where their dates come from. */
  calendars: Map<string, Calendar & { franchise: string }>;
  chronologySources: { name: string; licence: string; licenceUrl: string }[];
  franchises: Franchise[];
  companies: Map<string, Company>;
  roots: string[];
  sequences: {
    id: string;
    franchise: string;
    continuity: string;
    name: string;
    basis: string;
    items: { workId: string; position: number }[];
  }[];
  tags: EditorialTag[];
  workTags: Map<string, string[]>;
  stats: { films: number; series: number; franchises: number; companies: number };
};

type SeedWork = {
  id: string;
  title: string;
  format: string;
  release_year: number | null;
  synopsis: string | null;
  animation_classification: string | null;
};
type Seed = {
  works: SeedWork[];
  franchises: { id: string; name: string }[];
  continuities: { id: string; name: string }[];
  memberships: { work_id: string; franchise_id: string; continuity_id: string | null }[];
  companies: { id: string; name: string }[];
  company_relationship_claims: { subject_company_id: string; object_company_id: string; relationship_type: string }[];
  franchise_company_associations: { franchise_id: string; company_id: string }[];
  sequences: { id: string; franchise_id: string; continuity_id: string; name: string; sequence_type: string; ordering_basis: string }[];
  sequence_items: { sequence_id: string; work_id: string; position: number }[];
  tags: { id: string; name: string; selection_rationale: string | null }[];
  work_tags: { work_id: string; tag_id: string }[];
};

const COLORS = ['#94674f', '#4b6877', '#a28255', '#707856', '#687481', '#566653', '#706479', '#a36b59'];

type ImportedCreditsEntry = Partial<Credits> & {expires?: string};
type ImportedCredits = {entries?: Record<string, ImportedCreditsEntry>};

type ImportedMetadata = {
  entries?: Record<string, {year?: number; date?: string; title?: string; origin?: string; expires?: string}>;
};

/**
 * The local TMDB years cache, or null. It is optional (ignored by Git, stripped
 * from builds), and a missing file comes back from the dev server as HTML, so
 * anything that is not JSON simply means "no imported years".
 */
async function loadLocalJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

const loadImportedMetadata = () => loadLocalJson<ImportedMetadata>('/data/tmdb_metadata.json');
const loadImportedCredits = () => loadLocalJson<ImportedCredits>('/data/tmdb_credits.json');

/** The shape of public/data/chronology/<franchise>.json (see scripts/fetch-wookieepedia-dates.mjs). */
export type ChronologyFile = {
  source?: { name?: string; licence?: string; licence_url?: string };
  calendar?: { id?: string; name?: string; franchise?: string; anchor_event?: string; era_before?: string; era_after?: string };
  entries?: Record<string, { parsed?: boolean; page?: string; url?: string; revision?: number | null; periods?: unknown }>;
};

const CHRONOLOGY_FILES = ['star-wars'];
const QUALIFIERS: Qualifier[] = ['exact', 'circa', 'open_after', 'days_before'];

async function loadChronology(): Promise<ChronologyFile[]> {
  const files = await Promise.all(CHRONOLOGY_FILES.map(name => loadLocalJson<ChronologyFile>(`/data/chronology/${name}.json`)));
  return files.filter((file): file is ChronologyFile => file !== null && typeof file === 'object');
}

/** A period the file claims, or null when it is malformed (a bad row never reaches the UI). */
function validPeriod(raw: unknown): Period | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const start = number(row.start);
  if (start === null || !QUALIFIERS.includes(row.qualifier as Qualifier)) return null;
  return {
    label: typeof row.label === 'string' ? row.label : null,
    start,
    end: number(row.end),
    qualifier: row.qualifier as Qualifier,
    primary: row.primary === true,
  };
}

export async function loadAtlas(url = '/data/media_atlas_seed.json'): Promise<Dataset> {
  const [seedResponse, metadata, credits, chronology] = await Promise.all([fetch(url), loadImportedMetadata(), loadImportedCredits(), loadChronology()]);
  if (!seedResponse.ok) throw new Error(`Unable to load the atlas dataset (${seedResponse.status}).`);
  return buildDataset(await seedResponse.json() as Seed, metadata, credits, chronology);
}

/** Credits past their cache limit are not shown; fetch-credits.mjs re-fetches them. */
function freshCredits(entry?: ImportedCreditsEntry): Credits | undefined {
  if (!entry?.expires || !(Date.parse(entry.expires) > Date.now())) return undefined;
  if (typeof entry.tmdbId !== 'number' || !Array.isArray(entry.cast)) return undefined;
  return {
    tmdbId: entry.tmdbId,
    kind: entry.kind === 'tv' ? 'tv' : 'movie',
    directors: entry.directors ?? [],
    writers: entry.writers ?? [],
    cast: entry.cast,
  };
}

export function buildDataset(seed: Seed, metadata?: ImportedMetadata | null, credits?: ImportedCredits | null, chronology: ChronologyFile[] = []): Dataset {
  const franchiseNames = new Map(seed.franchises.map(f => [f.id, f.name]));

  const calendars = new Map<string, Calendar & { franchise: string }>();
  const chronologySources: Dataset['chronologySources'] = [];
  const inWorldByWork = new Map<string, InWorld>();
  for (const file of chronology) {
    const calendar = file.calendar;
    if (!calendar?.id || !calendar.era_before || !calendar.era_after) continue;
    calendars.set(calendar.id, {
      id: calendar.id,
      name: calendar.name ?? calendar.id,
      eraBefore: calendar.era_before,
      eraAfter: calendar.era_after,
      anchorEvent: calendar.anchor_event ?? '',
      franchise: franchiseNames.get(calendar.franchise ?? '') ?? calendar.franchise ?? '',
    });
    if (file.source?.name && file.source.licence) {
      chronologySources.push({ name: file.source.name, licence: file.source.licence, licenceUrl: file.source.licence_url ?? '' });
    }
    for (const [workId, entry] of Object.entries(file.entries ?? {})) {
      if (!entry?.parsed || !Array.isArray(entry.periods) || typeof entry.page !== 'string' || typeof entry.url !== 'string') continue;
      const periods = entry.periods.map(validPeriod).filter((period): period is Period => period !== null);
      if (periods.length === 0) continue;
      inWorldByWork.set(workId, { calendarId: calendar.id, page: entry.page, url: entry.url, revision: entry.revision ?? null, periods });
    }
  }
  const continuityNames = new Map(seed.continuities.map(c => [c.id, c.name]));

  const byWork = new Map<string, Membership[]>();
  for (const membership of seed.memberships) {
    const franchise = franchiseNames.get(membership.franchise_id);
    if (!franchise) continue;
    const list = byWork.get(membership.work_id) ?? [];
    const continuity = (membership.continuity_id && continuityNames.get(membership.continuity_id)) || 'Continuity not specified';
    if (!list.some(item => item.franchiseId === membership.franchise_id && item.continuity === continuity)) {
      list.push({ franchiseId: membership.franchise_id, franchise, continuity });
    }
    byWork.set(membership.work_id, list);
  }

  const works: Work[] = seed.works.map((work, index) => {
    const imported = metadata?.entries?.[work.id];
    const importedYear = imported?.year;
    // TMDB data past its cache limit is not shown; fetch-metadata.mjs re-fetches it.
    const fresh = Boolean(imported?.expires) && Date.parse(imported!.expires!) > Date.now();
    const useImported = work.release_year === null && fresh && Number.isInteger(importedYear) && importedYear! > 1800 && importedYear! < 2200;
    return {
      id: work.id,
      title: work.title,
      year: useImported ? importedYear! : work.release_year,
      yearImported: useImported || undefined,
      format: work.format === 'film' ? 'Film' : 'Series',
      memberships: byWork.get(work.id) ?? [],
      anime: work.animation_classification === 'anime',
      animated: work.animation_classification === 'anime' || work.animation_classification === 'animation',
      creators: 'Not supplied in seed',
      credits: freshCredits(credits?.entries?.[work.id]),
      inWorld: inWorldByWork.get(work.id),
      description: work.synopsis ?? 'Synopsis not supplied in seed.',
      color: COLORS[index % COLORS.length],
    };
  });
  const worksById = new Map(works.map(work => [work.id, work]));

  const franchises: Franchise[] = seed.franchises.map(franchise => ({
    id: franchise.id,
    name: franchise.name,
    companyIds: seed.franchise_company_associations.filter(a => a.franchise_id === franchise.id).map(a => a.company_id),
    workIds: [...new Set(seed.memberships.filter(m => m.franchise_id === franchise.id).map(m => m.work_id))],
  }));

  const parentOf = new Map<string, string>();
  for (const claim of seed.company_relationship_claims) {
    if (claim.relationship_type === 'parent_company_claim' && !parentOf.has(claim.object_company_id)) {
      parentOf.set(claim.object_company_id, claim.subject_company_id);
    }
  }

  // Only companies that reach a franchise are part of the browsing tree.
  const companyNames = new Map(seed.companies.map(c => [c.id, c.name]));
  const directFranchises = new Map<string, string[]>();
  for (const franchise of franchises) {
    for (const companyId of franchise.companyIds) {
      const list = directFranchises.get(companyId) ?? [];
      list.push(franchise.id);
      directFranchises.set(companyId, list);
    }
  }
  const needed = new Set<string>();
  for (const companyId of directFranchises.keys()) {
    let current: string | undefined = companyId;
    const guard = new Set<string>();
    while (current && !guard.has(current)) {
      guard.add(current);
      needed.add(current);
      current = parentOf.get(current);
    }
  }

  const companies = new Map<string, Company>();
  for (const companyId of needed) {
    companies.set(companyId, {
      id: companyId,
      name: companyNames.get(companyId) ?? companyId,
      parentId: parentOf.get(companyId) ?? null,
      childIds: [],
      franchiseIds: directFranchises.get(companyId) ?? [],
      subtreeFranchiseIds: [],
      depth: 0,
    });
  }
  for (const company of companies.values()) {
    if (company.parentId && companies.has(company.parentId)) companies.get(company.parentId)!.childIds.push(company.id);
  }
  for (const company of companies.values()) {
    company.childIds.sort((a, b) => {
      const left = companies.get(a)!, right = companies.get(b)!;
      return right.franchiseIds.length - left.franchiseIds.length || left.name.localeCompare(right.name);
    });
  }
  const collect = (id: string, seen = new Set<string>()): string[] => {
    const company = companies.get(id);
    if (!company || seen.has(id)) return [];
    seen.add(id);
    const ids = new Set(company.franchiseIds);
    for (const child of company.childIds) for (const franchiseId of collect(child, seen)) ids.add(franchiseId);
    company.subtreeFranchiseIds = [...ids];
    return company.subtreeFranchiseIds;
  };
  const roots: string[] = [];
  for (const company of companies.values()) {
    if (!company.parentId || !companies.has(company.parentId)) {
      roots.push(company.id);
      company.depth = 0;
      collect(company.id);
    }
  }
  const setDepth = (id: string, depth: number) => {
    const company = companies.get(id);
    if (!company || company.depth >= depth) return;
    company.depth = depth;
    for (const child of company.childIds) setDepth(child, depth + 1);
  };
  for (const root of roots) setDepth(root, 0);
  roots.sort((a, b) => (companies.get(b)?.subtreeFranchiseIds.length ?? 0) - (companies.get(a)?.subtreeFranchiseIds.length ?? 0) || companies.get(a)!.name.localeCompare(companies.get(b)!.name));

  const sequences = seed.sequences
    .filter(sequence => sequence.sequence_type === 'narrative')
    .map(sequence => ({
      id: sequence.id,
      franchise: franchiseNames.get(sequence.franchise_id) ?? 'Unknown franchise',
      continuity: continuityNames.get(sequence.continuity_id) ?? 'Continuity not specified',
      name: sequence.name,
      basis: sequence.ordering_basis,
      items: seed.sequence_items
        .filter(item => item.sequence_id === sequence.id && worksById.has(item.work_id))
        .sort((a, b) => a.position - b.position)
        .map(item => ({ workId: item.work_id, position: item.position })),
    }));

  const tags: EditorialTag[] = seed.tags.map(tag => ({
    id: tag.id,
    name: tag.name,
    rationale: tag.selection_rationale ?? '',
  }));
  const tagIds = new Set(tags.map(tag => tag.id));
  const workTags = new Map<string, string[]>();
  for (const entry of seed.work_tags) {
    if (!tagIds.has(entry.tag_id) || !worksById.has(entry.work_id)) continue;
    const list = workTags.get(entry.work_id) ?? [];
    if (!list.includes(entry.tag_id)) list.push(entry.tag_id);
    workTags.set(entry.work_id, list);
  }

  const people = new Map<number, string>();
  for (const work of works) {
    for (const entry of [...(work.credits?.directors ?? []), ...(work.credits?.writers ?? []), ...(work.credits?.cast ?? [])]) {
      people.set(entry.id, entry.name);
    }
  }

  return {
    works,
    worksById,
    people,
    calendars,
    chronologySources,
    franchises,
    companies,
    roots,
    sequences,
    tags,
    workTags,
    stats: {
      films: works.filter(work => work.format === 'Film').length,
      series: works.filter(work => work.format === 'Series').length,
      franchises: franchises.length,
      companies: [...companies.keys()].length,
    },
  };
}
