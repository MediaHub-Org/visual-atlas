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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from './migrate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = join(here, '..', 'public', 'data', 'media_atlas_seed.json');
const CHRONOLOGY_DIR = join(here, '..', 'public', 'data', 'chronology');
const TEXT_SEED_FILE = join(here, '..', 'public', 'data', 'media_text_seed.json');

/**
 * The first pass (approved 2026-11-22): the five entities with no claim
 * semantics. The second pass below adds the relations and claims.
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

/** Seed arrays handled by the relation pass below. */
const RELATION_ARRAYS = [
  'continuities',
  'memberships',
  'franchise_company_associations',
  'company_relationship_claims',
  'work_tags',
  'sequences',
  'sequence_items',
  'adaptations',
];

/** Tables the relation pass writes, in report order. */
const RELATION_TABLES = [
  'continuities',
  'franchise_memberships',
  'continuity_memberships',
  'franchise_companies',
  'company_relationships',
  'work_tags',
  'sequences',
  'sequence_items',
  'adaptations',
  'fictional_calendars',
  'narrative_periods',
];

/** Sections that exist in the export and are deliberately not imported yet. */
const SKIPPED = new Map([
  ['schema_version', 'metadata'],
  ['metadata', 'metadata'],
  ['project_rules', 'metadata'],
  ['import_contract', 'metadata'],
  ['people', 'empty'],
  ['credits', 'empty'],
  ['work_company_credits', 'empty'],
  ['seasons', 'empty'],
  ['places', 'empty'],
  ['work_locations', 'empty'],
  ['narrative_periods', 'empty'],
  ['calendar_systems', 'metadata'],
]);

const COMPANY_CLAIMS = {
  parent_company_claim: 'parent_company',
  division_claim: 'division',
  joint_venture_claim: 'joint_venture',
};

const SEQUENCE_TYPES = new Set(['release', 'narrative']);

const MEMBERSHIP_TYPES = new Set(['included', 'related_series']);

/** The arrays the text seed may add to the video seed; its adaptations are handled in their own pass. */
const TEXT_ARRAYS = ['works', 'franchises', 'continuities', 'memberships'];
const TEXT_FORMATS = new Set(['comic_series', 'manga_series', 'graphic_novel']);

/**
 * The video seed with the text seed's works, franchises, continuities and
 * memberships added (the same row shapes, so the existing passes import them).
 * A text id that the video seed already uses is refused, never overwritten.
 */
function withText(seed, text) {
  if (!text) return seed;
  const merged = { ...seed, adaptations: [...(seed.adaptations ?? []), ...(text.adaptations ?? [])] };
  for (const array of TEXT_ARRAYS) {
    // Every id is unique across both seeds and inside the text seed (a membership id keys its audit row).
    const taken = new Set((seed[array] ?? []).map((row) => row.id));
    for (const row of text[array] ?? []) {
      if (taken.has(row.id)) {
        throw new Error(
          array === 'memberships'
            ? `text seed membership id "${row.id}" is already used`
            : `text seed ${array} "${row.id}" is already in the video seed`
        );
      }
      taken.add(row.id);
    }
    merged[array] = [...(seed[array] ?? []), ...(text[array] ?? [])];
  }
  // The text seed may only add text works, and may only join its own works to franchises.
  const textWorkIds = new Set();
  for (const work of text.works ?? []) {
    if (!TEXT_FORMATS.has(work.format)) {
      throw new Error(`text seed work "${work.id}" has format "${work.format}", which is not a text format`);
    }
    textWorkIds.add(work.id);
  }
  for (const membership of text.memberships ?? []) {
    if (!textWorkIds.has(membership.work_id)) {
      throw new Error(`text seed membership "${membership.id}" joins "${membership.work_id}", which is not a text work`);
    }
  }
  return merged;
}

function checkSections(seed) {
  const planned = new Set([...PLAN.map((step) => step.array), ...RELATION_ARRAYS]);
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

/** seed_key -> id for every imported row of a table. */
async function loadIds(query, table) {
  const result = await query.query(`select id, seed_key from ${table} where seed_key is not null`);
  return new Map(result.rows.map((row) => [row.seed_key, row.id]));
}

function ref(ids, key, what) {
  const id = ids.get(key);
  if (id === undefined) throw new Error(`${what} "${key}" is not in the imported seed`);
  return id;
}

/** The first seed source that exists, or null; the payload keeps the rest. */
function sourceId(raw, ids) {
  for (const key of raw.source_ids ?? []) {
    if (ids.sources.has(key)) return ids.sources.get(key);
  }
  return null;
}

async function keepPayload(query, array, raw, externalId = raw.id, workId = null) {
  await query.query(
    `insert into imported_metadata (provider, external_id, payload, work_id)
     values ('seed', $1, $2::jsonb, $3)
     on conflict (provider, external_id) do update
       set payload = excluded.payload, imported_at = now()`,
    [`${array}:${externalId}`, JSON.stringify(raw), workId]
  );
}

/**
 * Runs the import. Returns per-table insert/update counts; with `dryRun` the
 * work happens inside a transaction that is rolled back, so the numbers are
 * real but nothing is kept.
 */
export async function importSeed(db, seed, { dryRun = false, chronology = [], text } = {}) {
  seed = withText(seed, text);
  checkSections(seed);
  const counts = {};
  for (const table of [...PLAN.map((step) => step.table), ...RELATION_TABLES]) {
    counts[table] = { inserted: 0, updated: 0 };
  }

  const tally = (table, inserted) => {
    counts[table][inserted ? 'inserted' : 'updated'] += 1;
  };

  const run = async (query) => {
    for (const step of PLAN) {
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
        tally(step.table, row.inserted);

        // The verbatim payload is the audit trail for everything the curated
        // columns cannot hold.
        await keepPayload(query, step.array, raw, raw.id, step.table === 'works' ? row.id : null);
      }
    }

    const ids = {
      sources: await loadIds(query, 'sources'),
      companies: await loadIds(query, 'companies'),
      franchises: await loadIds(query, 'franchises'),
      works: await loadIds(query, 'works'),
      tags: await loadIds(query, 'tags'),
    };

    // Continuities are entities, not claims: upsert by seed_key like the first
    // pass and keep the franchise reference explicit.
    for (const raw of seed.continuities ?? []) {
      const result = await query.query(
        upsertSql('continuities', ['franchise_id', 'name']),
        [raw.id, ref(ids.franchises, raw.franchise_id, 'franchise'), raw.name]
      );
      tally('continuities', result.rows[0].inserted);
      await keepPayload(query, 'continuities', raw);
    }
    ids.continuities = await loadIds(query, 'continuities');

    // A membership claims that a work belongs to a franchise, and optionally
    // to one continuity of it. The franchise row is inserted first because the
    // continuity row's foreign key points at it.
    for (const raw of seed.memberships ?? []) {
      const workId = ref(ids.works, raw.work_id, 'work');
      const franchiseId = ref(ids.franchises, raw.franchise_id, 'franchise');
      const type = raw.membership_type ?? 'included';
      if (!MEMBERSHIP_TYPES.has(type)) {
        throw new Error(`memberships: unknown membership_type "${type}"`);
      }
      const source = sourceId(raw, ids);

      const franchiseRow = await query.query(
        `insert into franchise_memberships (work_id, franchise_id, source_id, membership_type)
         values ($1, $2, $3, $4)
         on conflict (work_id, franchise_id) do update set
           source_id = case when franchise_memberships.review_status = 'needs_review'
             then excluded.source_id else franchise_memberships.source_id end,
           membership_type = case when franchise_memberships.review_status = 'needs_review'
             then excluded.membership_type else franchise_memberships.membership_type end
         returning (xmax = 0) as inserted`,
        [workId, franchiseId, source, type]
      );
      tally('franchise_memberships', franchiseRow.rows[0].inserted);

      if (raw.continuity_id) {
        const continuityId = ref(ids.continuities, raw.continuity_id, 'continuity');
        const continuityRow = await query.query(
          `insert into continuity_memberships (continuity_id, work_id, franchise_id, source_id, membership_type)
           values ($1, $2, $3, $4, $5)
           on conflict (continuity_id, work_id) do update set
             source_id = case when continuity_memberships.review_status = 'needs_review'
               then excluded.source_id else continuity_memberships.source_id end,
             membership_type = case when continuity_memberships.review_status = 'needs_review'
               then excluded.membership_type else continuity_memberships.membership_type end
           returning (xmax = 0) as inserted`,
          [continuityId, workId, franchiseId, source, type]
        );
        tally('continuity_memberships', continuityRow.rows[0].inserted);
      }

      await keepPayload(query, 'memberships', raw, raw.id, workId);
    }

    // Which company a franchise is catalogued under. The seed says
    // ownership_asserted: false, and the schema's relationship is the weaker
    // catalog association, so no ownership is invented.
    for (const raw of seed.franchise_company_associations ?? []) {
      const franchiseId = ref(ids.franchises, raw.franchise_id, 'franchise');
      const companyId = ref(ids.companies, raw.company_id, 'company');
      const relationship = raw.relationship_type;
      if (!['catalog_association', 'rights_holder', 'production'].includes(relationship)) {
        throw new Error(`franchise_company_associations: unknown relationship "${relationship}"`);
      }
      const result = await query.query(
        `insert into franchise_companies
           (franchise_id, company_id, relationship, valid_from, valid_until, source_id)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (franchise_id, company_id, relationship) do update set
           valid_from = case when franchise_companies.review_status = 'needs_review'
             then excluded.valid_from else franchise_companies.valid_from end,
           valid_until = case when franchise_companies.review_status = 'needs_review'
             then excluded.valid_until else franchise_companies.valid_until end,
           source_id = case when franchise_companies.review_status = 'needs_review'
             then excluded.source_id else franchise_companies.source_id end
         returning (xmax = 0) as inserted`,
        [franchiseId, companyId, relationship, raw.valid_from ?? null, raw.valid_to ?? null, sourceId(raw, ids)]
      );
      tally('franchise_companies', result.rows[0].inserted);
      await keepPayload(query, 'franchise_company_associations', raw);
    }

    // Corporate claims. The seed's subject is the parent and its object the
    // child; the schema trigger refuses a cycle, so a bad claim fails the whole
    // import instead of silently reordering the tree.
    for (const raw of seed.company_relationship_claims ?? []) {
      const relationship = COMPANY_CLAIMS[raw.relationship_type];
      if (!relationship) {
        throw new Error(`company_relationship_claims: unknown relationship "${raw.relationship_type}"`);
      }
      const result = await query.query(
        upsertSql('company_relationships', [
          'parent_company_id',
          'child_company_id',
          'relationship',
          'valid_from',
          'valid_until',
          'source_id',
        ]),
        [
          raw.id,
          ref(ids.companies, raw.subject_company_id, 'company'),
          ref(ids.companies, raw.object_company_id, 'company'),
          relationship,
          raw.valid_from ?? null,
          raw.valid_to ?? null,
          sourceId(raw, ids),
        ]
      );
      tally('company_relationships', result.rows[0].inserted);
      await keepPayload(query, 'company_relationship_claims', raw);
    }

    // Editorial tag links. There is nothing to refresh on conflict; a reviewed
    // or rejected link is left exactly as it is.
    for (const raw of seed.work_tags ?? []) {
      const workId = ref(ids.works, raw.work_id, 'work');
      const tagId = ref(ids.tags, raw.tag_id, 'tag');
      const result = await query.query(
        `insert into work_tags (work_id, tag_id) values ($1, $2)
         on conflict (work_id, tag_id) do nothing
         returning work_id`,
        [workId, tagId]
      );
      if (result.rows.length > 0) tally('work_tags', true);
      await keepPayload(query, 'work_tags', raw, `${raw.work_id}:${raw.tag_id}`, workId);
    }

    // Sequences (owner's rule, 2026-11-24): the seed's order is an editorial
    // proposal, so it imports with certainty 'unknown' and origin
    // 'editorial_proposal' -- never as estimated or confirmed -- and every
    // position stays needs_review. The seed's own certainty and
    // position_certainty values live on in the verbatim payload.
    const sequenceSource = new Map();
    for (const raw of seed.sequences ?? []) {
      if (!SEQUENCE_TYPES.has(raw.sequence_type)) {
        throw new Error(`sequences: unknown sequence_type "${raw.sequence_type}"`);
      }
      const result = await query.query(
        upsertSql('sequences', [
          'franchise_id',
          'continuity_id',
          'name',
          'sequence_type',
          'ordering_basis',
          'notes',
          'source_id',
        ]),
        [
          raw.id,
          ref(ids.franchises, raw.franchise_id, 'franchise'),
          ref(ids.continuities, raw.continuity_id, 'continuity'),
          raw.name,
          raw.sequence_type,
          raw.ordering_basis,
          raw.notes ?? null,
          sourceId(raw, ids),
        ]
      );
      tally('sequences', result.rows[0].inserted);
      sequenceSource.set(raw.id, { id: result.rows[0].id, continuity: raw.continuity_id });
      await keepPayload(query, 'sequences', raw);
    }

    for (const raw of seed.sequence_items ?? []) {
      const sequence = sequenceSource.get(raw.sequence_id);
      if (!sequence) throw new Error(`sequence "${raw.sequence_id}" is not in the imported seed`);
      const workId = ref(ids.works, raw.work_id, 'work');
      const result = await query.query(
        `insert into sequence_items (sequence_id, continuity_id, work_id, position, simultaneous_group)
         values ($1, $2, $3, $4, $5)
         on conflict (sequence_id, work_id) do update set
           position = case when sequence_items.review_status = 'needs_review'
             then excluded.position else sequence_items.position end,
           simultaneous_group = case when sequence_items.review_status = 'needs_review'
             then excluded.simultaneous_group else sequence_items.simultaneous_group end
         returning (xmax = 0) as inserted`,
        [sequence.id, ids.continuities.get(sequence.continuity), workId, raw.position,
         raw.simultaneous_group ?? null]
      );
      tally('sequence_items', result.rows[0].inserted);
      await keepPayload(query, 'sequence_items', raw, `${raw.sequence_id}:${raw.work_id}`, workId);
    }

    // Adaptations: an editorial link between a text work and a video work. The
    // import never asserts 'confirmed' (a person does, by reviewing the row), and a
    // link whose endpoint is in neither seed fails the import.
    for (const raw of seed.adaptations ?? []) {
      const certainty = raw.certainty ?? 'unknown';
      if (certainty === 'confirmed') {
        throw new Error(`adaptations: "${raw.id}" claims certainty confirmed; only a reviewer sets that`);
      }
      const result = await query.query(
        upsertSql('adaptations', ['source_work_id', 'adapted_work_id', 'kind', 'certainty', 'notes', 'source_id']),
        [
          raw.id,
          ref(ids.works, raw.source_work_id, 'work'),
          ref(ids.works, raw.adapted_work_id, 'work'),
          raw.kind,
          certainty,
          raw.notes ?? null,
          sourceId(raw, ids),
        ]
      );
      tally('adaptations', result.rows[0].inserted);
      await keepPayload(query, 'adaptations', raw);
    }

    // In-world dates (public/data/chronology/*.json, from Wookieepedia): a
    // calendar row per file and one draft period per parsed date. A stated date
    // is 'estimated', an open-ended one 'unknown', never 'confirmed'; an entry the
    // parser could not read creates nothing (the raw string stays in the payload).
    for (const file of chronology) {
      const calendar = file.calendar;
      const calendarResult = await query.query(
        `insert into fictional_calendars
           (id, name, franchise_id, anchor_event, unit, era_before, era_after, zero_year_exists)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do update set
           name = excluded.name, franchise_id = excluded.franchise_id,
           anchor_event = excluded.anchor_event, unit = excluded.unit,
           era_before = excluded.era_before, era_after = excluded.era_after,
           zero_year_exists = excluded.zero_year_exists
         returning (xmax = 0) as inserted`,
        [calendar.id, calendar.name, ref(ids.franchises, calendar.franchise, 'franchise'),
         calendar.anchor_event, calendar.unit, calendar.era_before, calendar.era_after,
         calendar.zero_year_exists ?? true]
      );
      tally('fictional_calendars', calendarResult.rows[0].inserted);

      const currentKeys = [];
      for (const [seedWorkId, entry] of Object.entries(file.entries ?? {})) {
        const workId = ref(ids.works, seedWorkId, 'work');
        await keepPayload(query, 'chronology', entry, seedWorkId, workId);
        if (!entry.parsed) continue;
        // The source may move "primary" to another entry. Draft rows give the flag
        // up first (the schema allows one primary per work); a reviewed primary is
        // frozen, so it keeps the flag and the new primary arrives as a plain period.
        const reviewedPrimary = (await query.query(
          `select 1 from narrative_periods
            where work_id = $1 and is_primary and review_status <> 'needs_review' limit 1`,
          [workId]
        )).rows.length > 0;
        await query.query(
          `update narrative_periods set is_primary = false
            where work_id = $1 and review_status = 'needs_review' and seed_key is not null`,
          [workId]
        );
        for (const [index, period] of entry.periods.entries()) {
          currentKeys.push(`${seedWorkId}#${index}`);
          const result = await query.query(
            upsertSql('narrative_periods', [
              'work_id', 'label', 'calendar', 'calendar_id', 'start_value', 'end_value',
              'qualifier', 'certainty', 'is_primary', 'raw_text', 'source_page',
              'source_revision', 'retrieved_at', 'licence',
            ]),
            [
              `${seedWorkId}#${index}`, workId, period.label || 'Story', calendar.id, calendar.id,
              period.start, period.end, period.qualifier,
              period.qualifier === 'open_after' ? 'unknown' : 'estimated',
              period.primary && !reviewedPrimary, entry.raw, entry.page, entry.revision ?? null,
              entry.retrievedAt ?? null, file.source?.licence ?? null,
            ]
          );
          tally('narrative_periods', result.rows[0].inserted);
        }
      }
      // A draft period the source no longer has (an entry that lost a date, stopped
      // parsing or left the file) goes; a reviewed one is a person's decision and stays.
      await query.query(
        `delete from narrative_periods
          where calendar_id = $1 and review_status = 'needs_review' and seed_key is not null
            and not (seed_key = any($2::text[]))`,
        [calendar.id, currentKeys]
      );
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
    const chronology = existsSync(CHRONOLOGY_DIR)
      ? readdirSync(CHRONOLOGY_DIR)
          .filter((name) => name.endsWith('.json'))
          .map((name) => JSON.parse(readFileSync(join(CHRONOLOGY_DIR, name), 'utf8')))
      : [];
    const text = existsSync(TEXT_SEED_FILE) ? JSON.parse(readFileSync(TEXT_SEED_FILE, 'utf8')) : undefined;
    const counts = await importSeed(db, seed, { dryRun, chronology, text });
    console.log(JSON.stringify({ dryRun, counts }, null, 2));
  } finally {
    await db.close();
  }
}
