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

type ImportedMetadata = {
  entries?: Record<string, {year?: number; date?: string; title?: string; origin?: string}>;
};

export async function loadAtlas(url = '/data/media_atlas_seed.json'): Promise<Dataset> {
  const [seedResponse, metadataResponse] = await Promise.all([
    fetch(url),
    fetch('/data/tmdb_metadata.json').catch(() => null),
  ]);
  if (!seedResponse.ok) throw new Error(`Unable to load the atlas dataset (${seedResponse.status}).`);
  const metadata = metadataResponse?.ok ? await metadataResponse.json() as ImportedMetadata : null;
  return buildDataset(await seedResponse.json() as Seed, metadata);
}

export function buildDataset(seed: Seed, metadata?: ImportedMetadata | null): Dataset {
  const franchiseNames = new Map(seed.franchises.map(f => [f.id, f.name]));
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
    const importedYear = metadata?.entries?.[work.id]?.year;
    const useImported = work.release_year === null && Number.isInteger(importedYear) && importedYear! > 1800 && importedYear! < 2200;
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

  return {
    works,
    worksById,
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
