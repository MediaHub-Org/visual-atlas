// What a text-style card shows besides the title: an icon for the format, the people
// behind the work and a few flags. Pure, no imports, so `node --test` can run it
// (tests/facts.test.mjs). Missing information produces no line, never a placeholder.

export const FORMAT_ICONS: Record<string, string> = {
  Film: '▶',
  Series: '◫',
  Comic: '❖',
  Manga: '✎',
  'Graphic novel': '▤',
};

export type Facts = {
  icon: string;
  people: string | null;
  peopleKind: 'director' | 'creator' | null;
  anime: boolean;
  inWorld: boolean;
  links: number;
};

export function factsOf(work: {
  format: string;
  anime: boolean;
  medium: 'video' | 'text';
  creators: string;
  credits?: { directors: { name: string }[] };
  inWorld?: unknown;
  links?: number;
}): Facts {
  let people: string | null = null;
  let peopleKind: Facts['peopleKind'] = null;
  if (work.medium === 'text') {
    if (work.creators && !work.creators.startsWith('Not supplied')) { people = work.creators; peopleKind = 'creator'; }
  } else if (work.credits && work.credits.directors.length > 0) {
    const names = work.credits.directors.map(person => person.name);
    people = names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
    peopleKind = 'director';
  }
  return {
    icon: FORMAT_ICONS[work.format] ?? FORMAT_ICONS.Film,
    people,
    peopleKind,
    anime: work.anime,
    inWorld: work.inWorld !== undefined,
    links: work.links ?? 0,
  };
}
