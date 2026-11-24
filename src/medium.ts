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
