// Universe families: owner-approved groups of franchises that share one fictional
// world (Marvel, DC). A family only groups blocks in the "In-universe order" view;
// it never merges continuities (each keeps its own lane). No imports, so
// `node --test` can run it directly (tests/families.test.mjs).

export type SameWorld = { continuityId: string; asContinuityId: string };
export type Family = { id: string; name: string; franchiseIds: string[]; sameWorld: SameWorld[] };
export type Block = { id: string; name: string; franchiseIds: string[]; family: boolean };

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** public/data/universe_families.json -> families; malformed rows are dropped, never thrown on. */
export function parseFamilies(raw: unknown): Family[] {
  const rows = (raw as { families?: unknown } | null)?.families;
  if (!Array.isArray(rows)) return [];
  const taken = new Set<string>();
  const families: Family[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    if (!row || !isText(row.id) || !isText(row.name) || !Array.isArray(row.franchises)) continue;
    const franchiseIds = (row.franchises as unknown[]).filter(isText).filter(id => !taken.has(id));
    if (franchiseIds.length === 0) continue;
    franchiseIds.forEach(id => taken.add(id));
    const notes = Array.isArray(row.same_world) ? (row.same_world as Record<string, unknown>[]) : [];
    const sameWorld = notes
      .filter(note => note && isText(note.continuity) && isText(note.as_continuity))
      .map(note => ({ continuityId: note.continuity as string, asContinuityId: note.as_continuity as string }));
    families.push({ id: row.id, name: row.name, franchiseIds, sameWorld });
  }
  return families;
}

/**
 * One block per family and one per franchise outside any family, by name. Only
 * franchises that exist are listed; a family with none of them disappears.
 */
export function buildBlocks(franchises: { id: string; name: string }[], families: Family[]): Block[] {
  const existing = new Set(franchises.map(franchise => franchise.id));
  const inFamily = new Set<string>();
  const blocks: Block[] = [];
  for (const family of families) {
    const ids = family.franchiseIds.filter(id => existing.has(id));
    if (ids.length === 0) continue;
    ids.forEach(id => inFamily.add(id));
    blocks.push({ id: family.id, name: family.name, franchiseIds: ids, family: true });
  }
  for (const franchise of franchises) {
    if (!inFamily.has(franchise.id)) blocks.push({ id: franchise.id, name: franchise.name, franchiseIds: [franchise.id], family: false });
  }
  return blocks.sort((a, b) => a.name.localeCompare(b.name));
}
