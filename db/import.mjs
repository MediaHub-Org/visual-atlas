// Imports the editorial seed into the curated tables, in the draft state the
// review columns exist for. See db/IMPORT.md for the reasoning and the scope.
//
// Rules this file follows:
//  - every row keeps its original JSON in imported_metadata, so nothing the
//    schema cannot hold (review flags, source lists, count claims) is lost;
//  - a re-import upserts by seed_key and only refreshes rows still marked
//    'needs_review', so a person's correction survives;
//  - the import never writes review_status itself;
//  - a seed section with no mapping is an error, not a silent skip.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from './migrate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = join(here, '..', 'public', 'data', 'media_atlas_seed.json');

/**
 * The first pass (approved 2026-11-22): the five entities with no claim
 * semantics. Anything relation-shaped stays out until it has a review path.
 */
const PLAN = [
  {
    array: 'sources',
    table: 'sources',
    row: (source) => ({
      title: source.title,
      url: source.url ?? null,
      // The export has no access date; inventing one would be worse than null.
      accessed_on: null,
      attribution: source.source_type ?? null,
      license_notes: source.verification_status
        ? `seed verification: ${source.verification_status}`
        : null,
    }),
  },
  {
    array: 'companies',
    table: 'companies',
    row: (company) => ({ name: company.name }),
  },
  {
    array: 'franchises',
    table: 'franchises',
    row: (franchise) => ({ name: franchise.name }),
  },
  {
    array: 'works',
    table: 'works',
    row: (work) => ({
      title: work.title,
      format: work.format,
      // A season's or episode's parent is not in the export (no parents exist),
      // and episode_count is only allowed on series.
      parent_work_id: null,
      // The export has three classifications plus null (unknown). The column is
      // NOT NULL, so unknown and live action both import as false and the row
      // stays needs_review; the verbatim payload keeps the original null.
      is_animation: work.animation_classification === 'animation' || work.animation_classification === 'anime',
      is_anime: work.animation_classification === 'anime',
      episode_count: work.format === 'series' ? (work.episode_count ?? null) : null,
      synopsis: work.synopsis ?? null,
    }),
  },
  {
    array: 'tags',
    table: 'tags',
    row: (tag) => ({
      name: tag.name,
      rationale: tag.selection_rationale ?? null,
      // The export's tags carry no source id; leaving it null is honest.
      source_id: null,
    }),
  },
];

/** Sections that exist in the export and are deliberately not imported yet. */
const SKIPPED = new Map([
  ['schema_version', 'metadata'],
  ['metadata', 'metadata'],
  ['project_rules', 'metadata'],
  ['import_contract', 'metadata'],
  ['company_relationship_claims', 'claim: needs its own review path'],
  ['franchise_company_associations', 'claim: needs its own review path'],
  ['memberships', 'claim: needs its own review path'],
  ['continuities', 'needs chronology design'],
  ['sequences', 'editorial narrative proposal, not a date'],
  ['sequence_items', 'editorial narrative proposal, not a date'],
  ['work_tags', 'join table, later with the rest of the relations'],
  ['people', 'empty'],
  ['credits', 'empty'],
  ['work_company_credits', 'empty'],
  ['seasons', 'empty'],
  ['places', 'empty'],
  ['work_locations', 'empty'],
  ['narrative_periods', 'empty'],
  ['calendar_systems', 'metadata'],
]);

function checkSections(seed) {
  const planned = new Set(PLAN.map((step) => step.array));
  for (const key of Object.keys(seed)) {
    if (planned.has(key) || SKIPPED.has(key)) continue;
    throw new Error(`seed section "${key}" has no mapping; decide where it goes before importing`);
  }
}

function upsertSql(table, columns) {
  const placeholders = columns.map((_, index) => `$${index + 2}`).join(', ');
  // A reviewed row is frozen: the import only refreshes rows still in draft.
  const updates = columns
    .map(
      (column) =>
        `${column} = CASE WHEN ${table}.review_status = 'needs_review' THEN excluded.${column} ELSE ${table}.${column} END`
    )
    .join(', ');
  return `insert into ${table} (seed_key, ${columns.join(', ')}) values ($1, ${placeholders})
          on conflict (seed_key) where seed_key is not null do update set ${updates}
          returning id, (xmax = 0) as inserted`;
}

/**
 * Runs the import. Returns per-table insert/update counts; with `dryRun` the
 * work happens inside a transaction that is rolled back, so the numbers are
 * real but nothing is kept.
 */
export async function importSeed(db, seed, { dryRun = false } = {}) {
  checkSections(seed);
  const counts = {};

  const run = async (query) => {
    for (const step of PLAN) {
      counts[step.table] = { inserted: 0, updated: 0 };
      const rows = seed[step.array] ?? [];
      for (const raw of rows) {
        if (!raw || typeof raw.id !== 'string' || !raw.id) {
          throw new Error(`${step.array}: a row has no id`);
        }
        const values = step.row(raw);
        const columns = Object.keys(values);
        const params = [raw.id, ...columns.map((column) => values[column])];

        const result = await query.query(upsertSql(step.table, columns), params);
        const row = result.rows[0];
        if (!row) throw new Error(`${step.table}: upsert returned no row for ${raw.id}`);
        counts[step.table][row.inserted ? 'inserted' : 'updated'] += 1;

        // The verbatim payload is the audit trail for everything the curated
        // columns cannot hold.
        await query.query(
          `insert into imported_metadata (provider, external_id, payload, work_id)
           values ('seed', $1, $2::jsonb, $3)
           on conflict (provider, external_id) do update
             set payload = excluded.payload, imported_at = now()`,
          [`${step.array}:${raw.id}`, JSON.stringify(raw), step.table === 'works' ? row.id : null]
        );
      }
    }
  };

  if (dryRun) {
    await db.exec('begin');
    try {
      await run(db);
    } finally {
      await db.exec('rollback');
    }
  } else {
    await db.transaction(async (tx) => {
      await run(tx);
    });
  }

  return counts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  const db = new PGlite(join(here, '.data'));
  try {
    await migrate(db);
    const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8'));
    const counts = await importSeed(db, seed, { dryRun });
    console.log(JSON.stringify({ dryRun, counts }, null, 2));
  } finally {
    await db.close();
  }
}
