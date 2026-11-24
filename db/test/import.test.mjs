// Import tests: the migrations, the importer and the rules db/IMPORT.md promises,
// against a real PostgreSQL engine (PGlite) with a fresh database per test.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../migrate.mjs';
import { importSeed } from '../import.mjs';

const seed = JSON.parse(
  readFileSync(new URL('../../public/data/media_atlas_seed.json', import.meta.url), 'utf8')
);

const chronology = JSON.parse(
  readFileSync(new URL('../../public/data/chronology/star-wars.json', import.meta.url), 'utf8')
);
const PERIODS = Object.values(chronology.entries)
  .filter((entry) => entry.parsed)
  .reduce((sum, entry) => sum + entry.periods.length, 0);

const unique = (rows, key) => new Set(rows.map(key)).size;

const TOTALS = {
  sources: seed.sources.length,
  companies: seed.companies.length,
  franchises: seed.franchises.length,
  works: seed.works.length,
  tags: seed.tags.length,
};

// Natural-key totals: the seed can repeat a pair, and the import must collapse it.
const RELATION_TOTALS = {
  continuities: seed.continuities.length,
  franchise_memberships: unique(seed.memberships, (row) => `${row.work_id}|${row.franchise_id}`),
  continuity_memberships: unique(
    seed.memberships.filter((row) => row.continuity_id),
    (row) => `${row.continuity_id}|${row.work_id}`
  ),
  franchise_companies: unique(
    seed.franchise_company_associations,
    (row) => `${row.franchise_id}|${row.company_id}|${row.relationship_type}`
  ),
  company_relationships: seed.company_relationship_claims.length,
  work_tags: unique(seed.work_tags, (row) => `${row.work_id}|${row.tag_id}`),
  sequences: seed.sequences.length,
  sequence_items: unique(seed.sequence_items, (row) => `${row.sequence_id}|${row.work_id}`),
};

const ALL_TOTALS = { ...TOTALS, ...RELATION_TOTALS };
// One payload per seed row, not per table row: a membership writes two tables.
const PAYLOADS =
  Object.values(TOTALS).reduce((sum, n) => sum + n, 0) +
  seed.continuities.length +
  seed.memberships.length +
  seed.franchise_company_associations.length +
  seed.company_relationship_claims.length +
  seed.work_tags.length +
  seed.sequences.length +
  seed.sequence_items.length;

async function withDb(run) {
  const db = new PGlite();
  try {
    await migrate(db);
    return await run(db);
  } finally {
    await db.close();
  }
}

const count = async (db, table) =>
  (await db.query(`select count(*)::int as n from ${table}`)).rows[0].n;

describe('migrations', () => {
  it('applies the base schema and the migrations once', async () => {
    await withDb(async (db) => {
      const again = await migrate(db);
      assert.deepEqual(again, []);
      const applied = await db.query('select name from schema_migrations order by name');
      assert.deepEqual(
        applied.rows.map((row) => row.name),
        ['001_review_and_seed_key.sql', '002_relations_and_claims.sql', '003_sequences.sql', '004_inworld_chronology.sql', '005_text_media.sql', 'base:schema.sql']
      );
    });
  });

  it('adds the review columns and refuses "reviewed" without a date', async () => {
    await withDb(async (db) => {
      await db.query("insert into works (title, format, seed_key) values ('x', 'film', 'x')");
      await assert.rejects(
        () => db.query("update works set review_status = 'reviewed' where seed_key = 'x'"),
        (error) => error.code === '23514'
      );
      await db.query("update works set review_status = 'reviewed', reviewed_at = current_date where seed_key = 'x'");
      const row = (await db.query("select review_status from works where seed_key = 'x'")).rows[0];
      assert.equal(row.review_status, 'reviewed');
    });
  });

  it('gives continuities and company claims the same review rule', async () => {
    await withDb(async (db) => {
      const franchise = (
        await db.query("insert into franchises (name, seed_key) values ('F', 'f') returning id")
      ).rows[0].id;
      await db.query(
        "insert into continuities (franchise_id, name, seed_key) values ($1, 'C', 'c')",
        [franchise]
      );
      await assert.rejects(
        () => db.query("update continuities set review_status = 'reviewed' where seed_key = 'c'"),
        (error) => error.code === '23514'
      );
      await db.query(
        "update continuities set review_status = 'reviewed', reviewed_at = current_date where seed_key = 'c'"
      );

      const parent = (await db.query("insert into companies (name) values ('P') returning id")).rows[0].id;
      const child = (await db.query("insert into companies (name) values ('C') returning id")).rows[0].id;
      await db.query(
        `insert into company_relationships
           (parent_company_id, child_company_id, relationship, seed_key)
         values ($1, $2, 'parent_company', 'claim')`,
        [parent, child]
      );
      await assert.rejects(
        () => db.query("update company_relationships set review_status = 'reviewed' where seed_key = 'claim'"),
        (error) => error.code === '23514'
      );
    });
  });
});

describe('seed import', () => {
  it('fills the entities and the relations on the first pass', async () => {
    await withDb(async (db) => {
      const first = await importSeed(db, seed);
      for (const [table, total] of Object.entries(ALL_TOTALS)) {
        assert.equal(first[table].inserted, total, `${table} inserted`);
        assert.equal(await count(db, table), total, `${table} rows`);
      }
      // A work can repeat inside a franchise through two continuities: the
      // first row inserts and the rest refresh the same natural key.
      assert.equal(
        first.franchise_memberships.updated,
        seed.memberships.length - RELATION_TOTALS.franchise_memberships
      );
      for (const table of Object.keys(ALL_TOTALS)) {
        if (table !== 'franchise_memberships') assert.equal(first[table].updated, 0, `${table} updated`);
      }
      assert.equal(await count(db, 'imported_metadata'), PAYLOADS);
    });
  });

  it('updates the entities and relations on the second import without duplicating', async () => {
    await withDb(async (db) => {
      await importSeed(db, seed);
      const second = await importSeed(db, seed);
      for (const table of [...Object.keys(TOTALS), 'continuities', 'company_relationships']) {
        assert.equal(second[table].inserted, 0, `${table} re-inserted`);
        assert.equal(second[table].updated, ALL_TOTALS[table], `${table} re-updated`);
      }
      assert.equal(second.franchise_memberships.inserted, 0);
      // Every membership row is upserted, including the repeats of one pair.
      assert.equal(second.franchise_memberships.updated, seed.memberships.length);
      for (const table of ['continuity_memberships', 'franchise_companies']) {
        assert.equal(second[table].inserted, 0, `${table} re-inserted`);
        assert.equal(second[table].updated, ALL_TOTALS[table], `${table} re-updated`);
      }
      // The tag links are write-once: an existing row is left untouched.
      assert.deepEqual(second.work_tags, { inserted: 0, updated: 0 });
      for (const [table, total] of Object.entries(ALL_TOTALS)) {
        assert.equal(await count(db, table), total, `${table} duplicated`);
      }
    });
  });

  it('leaves every imported row in draft state and keeps the original payload', async () => {
    await withDb(async (db) => {
      await importSeed(db, seed);
      for (const table of Object.keys(ALL_TOTALS)) {
        assert.equal(
          (await db.query(`select count(*)::int as n from ${table} where review_status <> 'needs_review'`)).rows[0].n,
          0,
          `${table} escaped the draft state`
        );
      }
      const work = seed.works.find((row) => row.animation_classification === null);
      const payload = await db.query(
        'select payload from imported_metadata where external_id = $1',
        [`works:${work.id}`]
      );
      assert.equal(payload.rows[0].payload.animation_classification, null);
    });
  });

  it('does not overwrite a reviewed row on re-import', async () => {
    await withDb(async (db) => {
      await importSeed(db, seed);
      const work = seed.works[0];
      await db.query(
        `update works set title = 'Curated title', review_status = 'reviewed', reviewed_at = current_date
         where seed_key = $1`,
        [work.id]
      );
      const continuity = seed.continuities[0];
      await db.query(
        `update continuities set name = 'Curated continuity', review_status = 'reviewed', reviewed_at = current_date
         where seed_key = $1`,
        [continuity.id]
      );
      await importSeed(db, seed);
      const workRow = (await db.query('select title, review_status from works where seed_key = $1', [work.id])).rows[0];
      assert.equal(workRow.title, 'Curated title');
      assert.equal(workRow.review_status, 'reviewed');
      const continuityRow = (
        await db.query('select name, review_status from continuities where seed_key = $1', [continuity.id])
      ).rows[0];
      assert.equal(continuityRow.name, 'Curated continuity');
      assert.equal(continuityRow.review_status, 'reviewed');
    });
  });

  it('freezes a reviewed membership type', async () => {
    await withDb(async (db) => {
      await importSeed(db, seed);
      const membership = seed.memberships.find((row) => row.membership_type === 'included' && row.continuity_id);
      const work = (await db.query('select id from works where seed_key = $1', [membership.work_id])).rows[0].id;
      const franchise = (
        await db.query('select id from franchises where seed_key = $1', [membership.franchise_id])
      ).rows[0].id;
      await db.query(
        `update franchise_memberships set membership_type = 'related_series', review_status = 'reviewed'
         where work_id = $1 and franchise_id = $2`,
        [work, franchise]
      );
      await importSeed(db, seed);
      const row = (
        await db.query(
          'select membership_type, review_status from franchise_memberships where work_id = $1 and franchise_id = $2',
          [work, franchise]
        )
      ).rows[0];
      assert.equal(row.membership_type, 'related_series');
      assert.equal(row.review_status, 'reviewed');
    });
  });

  it('keeps a franchise membership when the seed has no continuity', async () => {
    await withDb(async (db) => {
      await importSeed(db, seed);
      const withoutContinuity = seed.memberships.filter((row) => !row.continuity_id);
      assert.equal(withoutContinuity.length, 32);
      const work = (
        await db.query('select id from works where seed_key = $1', [withoutContinuity[0].work_id])
      ).rows[0].id;
      assert.equal(
        (
          await db.query('select count(*)::int as n from franchise_memberships where work_id = $1', [work])
        ).rows[0].n,
        1
      );
      assert.equal(
        (
          await db.query('select count(*)::int as n from continuity_memberships where work_id = $1', [work])
        ).rows[0].n,
        0
      );
    });
  });

  it('imports claims as draft rows, never as reviewed facts', async () => {
    await withDb(async (db) => {
      await importSeed(db, seed);
      const claim = seed.company_relationship_claims[0];
      const parent = (
        await db.query('select id from companies where seed_key = $1', [claim.subject_company_id])
      ).rows[0].id;
      const child = (
        await db.query('select id from companies where seed_key = $1', [claim.object_company_id])
      ).rows[0].id;
      const row = (
        await db.query(
          `select relationship, review_status, seed_key from company_relationships
           where parent_company_id = $1 and child_company_id = $2`,
          [parent, child]
        )
      ).rows[0];
      assert.equal(row.relationship, 'parent_company');
      assert.equal(row.review_status, 'needs_review');
      assert.equal(row.seed_key, claim.id);

      const link = (
        await db.query(
          `select relationship, review_status from franchise_companies
           where franchise_id = (select id from franchises where seed_key = $1)
             and company_id = (select id from companies where seed_key = $2)`,
          [seed.franchise_company_associations[0].franchise_id, seed.franchise_company_associations[0].company_id]
        )
      ).rows[0];
      assert.equal(link.relationship, 'catalog_association');
      assert.equal(link.review_status, 'needs_review');
      assert.equal(await count(db, 'work_tags'), RELATION_TOTALS.work_tags);
    });
  });

  it("imports sequences as unknown, editorial proposals, never as estimated or confirmed", async () => {
    await withDb(async (db) => {
      await importSeed(db, seed);
      const rows = (
        await db.query(
          'select certainty, origin, review_status, count(*)::int as n from sequences group by 1, 2, 3'
        )
      ).rows;
      assert.deepEqual(rows, [
        { certainty: 'unknown', origin: 'editorial_proposal', review_status: 'needs_review', n: seed.sequences.length },
      ]);
      const items = (
        await db.query('select certainty, review_status, count(*)::int as n from sequence_items group by 1, 2')
      ).rows;
      assert.deepEqual(items, [
        { certainty: 'unknown', review_status: 'needs_review', n: RELATION_TOTALS.sequence_items },
      ]);
      // The seed's own words survive in the verbatim payload.
      const payload = (
        await db.query("select payload from imported_metadata where external_id = $1", [
          `sequences:${seed.sequences[0].id}`,
        ])
      ).rows[0].payload;
      assert.equal(payload.certainty, 'editorial_proposal');
      // Order inside a sequence is kept.
      const first = seed.sequence_items.find((row) => row.position === 1);
      const stored = (
        await db.query(
          `select i.position from sequence_items i
             join sequences s on s.id = i.sequence_id
             join works w on w.id = i.work_id
            where s.seed_key = $1 and w.seed_key = $2`,
          [first.sequence_id, first.work_id]
        )
      ).rows[0];
      assert.equal(stored.position, 1);
    });
  });

  it('refuses a sequence item whose work is not in the sequence continuity', async () => {
    await withDb(async (db) => {
      const broken = structuredClone(seed);
      const memberWorks = new Set(
        broken.memberships
          .filter((row) => row.continuity_id === broken.sequences[0].continuity_id)
          .map((row) => row.work_id)
      );
      const outsider = broken.works.find((work) => !memberWorks.has(work.id));
      broken.sequence_items.push({
        sequence_id: broken.sequences[0].id,
        work_id: outsider.id,
        position: 9999,
        position_certainty: 'needs_review',
        simultaneous_group: null,
      });
      await assert.rejects(() => importSeed(db, broken), (error) => error.code === '23503');
      assert.equal(await count(db, 'sequences'), 0);
    });
  });

  it('does not overwrite a reviewed sequence item on re-import', async () => {
    await withDb(async (db) => {
      await importSeed(db, seed);
      await db.query(
        `update sequence_items set position = 500, review_status = 'reviewed' where ctid = (select ctid from sequence_items limit 1)`
      );
      await importSeed(db, seed);
      const kept = (await db.query("select position from sequence_items where review_status = 'reviewed'")).rows;
      assert.deepEqual(kept, [{ position: 500 }]);
    });
  });

  it('rolls the whole import back when a row cannot be stored', async () => {
    await withDb(async (db) => {
      const broken = structuredClone(seed);
      broken.works[0].title = null;
      await assert.rejects(() => importSeed(db, broken), (error) => error.code === '23502');
      assert.equal(await count(db, 'works'), 0);
      assert.equal(await count(db, 'sources'), 0);
      assert.equal(await count(db, 'continuities'), 0);
    });
  });

  it('refuses a seed section it has no mapping for', async () => {
    await withDb(async (db) => {
      const surprise = structuredClone(seed);
      surprise.awards = [{ id: 'x', name: 'x' }];
      await assert.rejects(() => importSeed(db, surprise), /has no mapping/);
    });
  });

  it('a dry run reports counts and keeps nothing', async () => {
    await withDb(async (db) => {
      const counts = await importSeed(db, seed, { dryRun: true });
      assert.equal(counts.works.inserted, TOTALS.works);
      assert.equal(counts.company_relationships.inserted, RELATION_TOTALS.company_relationships);
      assert.equal(await count(db, 'works'), 0);
      assert.equal(await count(db, 'company_relationships'), 0);
      assert.equal(await count(db, 'imported_metadata'), 0);
    });
  });
});

describe('in-world chronology import', () => {
  const load = (db) => importSeed(db, seed, { chronology: [chronology] });

  it('creates the calendar and one draft period per parsed date', async () => {
    await withDb(async (db) => {
      const counts = await load(db);
      assert.deepEqual(counts.fictional_calendars, { inserted: 1, updated: 0 });
      assert.equal(counts.narrative_periods.inserted, PERIODS);
      assert.equal(await count(db, 'narrative_periods'), PERIODS);
      const calendar = (await db.query('select * from fictional_calendars')).rows[0];
      assert.equal(calendar.id, 'star-wars-yavin');
      assert.equal(calendar.era_before, 'BBY');
      assert.equal(calendar.era_after, 'ABY');
      const states = (await db.query('select distinct review_status from narrative_periods')).rows;
      assert.deepEqual(states, [{ review_status: 'needs_review' }]);
    });
  });

  it('is estimated for a stated date, unknown when open-ended, never confirmed', async () => {
    await withDb(async (db) => {
      await load(db);
      const rows = (await db.query('select qualifier, certainty, count(*)::int as n from narrative_periods group by 1, 2')).rows;
      assert.ok(rows.every((row) => row.certainty !== 'confirmed'));
      assert.ok(rows.filter((row) => row.qualifier === 'open_after').every((row) => row.certainty === 'unknown'));
      assert.ok(rows.filter((row) => row.qualifier !== 'open_after').every((row) => row.certainty === 'estimated'));
      const ahsoka = (await db.query(
        `select p.start_value, p.end_value from narrative_periods p join works w on w.id = p.work_id
          where w.seed_key = 'series--ahsoka'`)).rows[0];
      assert.deepEqual(ahsoka, { start_value: 9, end_value: null });
    });
  });

  it('keeps provenance and at most one primary period per work', async () => {
    await withDb(async (db) => {
      await load(db);
      const row = (await db.query(
        `select p.source_page, p.source_revision, p.licence, p.raw_text, p.is_primary
           from narrative_periods p join works w on w.id = p.work_id
          where w.seed_key = 'film--a-new-hope--1977'`)).rows[0];
      assert.equal(row.source_page, 'Star Wars: Episode IV A New Hope');
      assert.ok(Number(row.source_revision) > 0);
      assert.equal(row.licence, 'CC BY-SA 3.0');
      assert.equal(row.is_primary, true);
      const solo = (await db.query(
        `select count(*)::int as n from narrative_periods p join works w on w.id = p.work_id
          where w.seed_key = 'film--solo-a-star-wars-story--2018'`)).rows[0].n;
      assert.equal(solo, 2);
    });
  });

  it('does not overwrite a period a person marked reviewed', async () => {
    await withDb(async (db) => {
      await load(db);
      await db.query(
        `update narrative_periods set label = 'Edited by hand', review_status = 'reviewed', reviewed_at = current_date
          where seed_key = 'film--a-new-hope--1977#0'`);
      const again = await load(db);
      assert.equal(again.narrative_periods.inserted, 0);
      assert.equal((await db.query("select label from narrative_periods where seed_key = 'film--a-new-hope--1977#0'")).rows[0].label, 'Edited by hand');
      assert.equal(await count(db, 'narrative_periods'), PERIODS);
    });
  });

  it('creates nothing for a date that could not be parsed and refuses an unknown work', async () => {
    await withDb(async (db) => {
      const odd = structuredClone(chronology);
      odd.entries['film--a-new-hope--1977'] = { ...odd.entries['film--a-new-hope--1977'], parsed: false, periods: [] };
      await importSeed(db, seed, { chronology: [odd] });
      assert.equal(await count(db, 'narrative_periods'), PERIODS - chronology.entries['film--a-new-hope--1977'].periods.length);
    });
    await withDb(async (db) => {
      const bad = structuredClone(chronology);
      bad.entries['film--not-in-the-seed--1900'] = bad.entries['film--a-new-hope--1977'];
      await assert.rejects(() => importSeed(db, seed, { chronology: [bad] }), /is not in the imported seed/);
    });
  });

  const soloKeys = ["film--solo-a-star-wars-story--2018#0", "film--solo-a-star-wars-story--2018#1"];
  const primaryOf = async (db, work) =>
    (await db.query(
      `select p.seed_key from narrative_periods p join works w on w.id = p.work_id
        where w.seed_key = $1 and p.is_primary`, [work])).rows.map((row) => row.seed_key);

  it('moves the primary period back to an earlier entry, instead of failing the import', async () => {
    await withDb(async (db) => {
      const moved = structuredClone(chronology);
      const solo = moved.entries['film--solo-a-star-wars-story--2018'].periods;
      solo[0].primary = false;
      solo[1].primary = true;
      await importSeed(db, seed, { chronology: [moved] });
      assert.deepEqual(await primaryOf(db, 'film--solo-a-star-wars-story--2018'), [soloKeys[1]]);
      await load(db);
      assert.deepEqual(await primaryOf(db, 'film--solo-a-star-wars-story--2018'), [soloKeys[0]]);
    });
  });

  it('keeps a reviewed primary and brings the new primary in as a plain period', async () => {
    await withDb(async (db) => {
      await load(db);
      await db.query(`update narrative_periods set review_status = 'reviewed', reviewed_at = current_date where seed_key = $1`, [soloKeys[0]]);
      const moved = structuredClone(chronology);
      const solo = moved.entries['film--solo-a-star-wars-story--2018'].periods;
      solo[0].primary = false;
      solo[1].primary = true;
      await importSeed(db, seed, { chronology: [moved] });
      assert.deepEqual(await primaryOf(db, 'film--solo-a-star-wars-story--2018'), [soloKeys[0]]);
    });
  });

  it('removes draft periods the source no longer has, but keeps reviewed ones', async () => {
    await withDb(async (db) => {
      await load(db);
      const fewer = structuredClone(chronology);
      fewer.entries['film--solo-a-star-wars-story--2018'].periods.pop();
      fewer.entries['film--a-new-hope--1977'] = { ...fewer.entries['film--a-new-hope--1977'], parsed: false, periods: [] };
      await db.query(`update narrative_periods set review_status = 'reviewed', reviewed_at = current_date where seed_key = 'series--star-wars-rebels#1'`);
      fewer.entries['series--star-wars-rebels'].periods.pop();
      await importSeed(db, seed, { chronology: [fewer] });
      const keys = (await db.query('select seed_key from narrative_periods')).rows.map((row) => row.seed_key);
      assert.ok(!keys.includes(soloKeys[1]), 'the dropped Solo period is gone');
      assert.ok(!keys.includes('film--a-new-hope--1977#0'), 'an entry that stopped parsing leaves no draft rows');
      assert.ok(keys.includes('series--star-wars-rebels#1'), 'a reviewed period is never deleted');
    });
  });

  it('stores an empty label as "Story" instead of aborting', async () => {
    await withDb(async (db) => {
      const blank = structuredClone(chronology);
      blank.entries['film--a-new-hope--1977'].periods[0].label = '';
      await importSeed(db, seed, { chronology: [blank] });
      const row = (await db.query("select label from narrative_periods where seed_key = 'film--a-new-hope--1977#0'")).rows[0];
      assert.equal(row.label, 'Story');
    });
  });

  it('refuses a period that ends before it starts', async () => {
    await withDb(async (db) => {
      await load(db);
      await assert.rejects(
        () => db.query("update narrative_periods set start_value = 5, end_value = 1 where seed_key = 'film--a-new-hope--1977#0'"),
        (error) => error.code === '23514'
      );
    });
  });

  it('a dry run reports the periods and keeps nothing', async () => {
    await withDb(async (db) => {
      const counts = await importSeed(db, seed, { dryRun: true, chronology: [chronology] });
      assert.equal(counts.narrative_periods.inserted, PERIODS);
      assert.equal(await count(db, 'narrative_periods'), 0);
      assert.equal(await count(db, 'fictional_calendars'), 0);
    });
  });
});

describe('text media import', () => {
  const text = () => ({
    schema_version: '1.0.0',
    works: [
      { id: 'text--dragon-ball-manga', format: 'manga_series', title: 'Dragon Ball (manga)', release_year: 1984, review_status: 'needs_review', source_ids: ['conversation'] },
      { id: 'text--maus', format: 'graphic_novel', title: 'Maus', release_year: null, review_status: 'needs_review', source_ids: ['conversation'] },
    ],
    franchises: [{ id: 'maus', name: 'Maus' }],
    continuities: [],
    memberships: [
      { id: 'text-m1', work_id: 'text--dragon-ball-manga', franchise_id: 'dragon-ball', continuity_id: null, source_ids: ['conversation'] },
      { id: 'text-m2', work_id: 'text--maus', franchise_id: 'maus', continuity_id: null, source_ids: ['conversation'] },
    ],
    adaptations: [
      { id: 'ad1', source_work_id: 'text--dragon-ball-manga', adapted_work_id: 'series--dragon-ball', kind: 'anime', certainty: 'unknown', notes: 'editorial proposal, unverified' },
    ],
  });
  const load = (db, t = text()) => importSeed(db, seed, { text: t });

  it('imports text works and joins one to an existing franchise', async () => {
    await withDb(async (db) => {
      const counts = await load(db);
      assert.equal(counts.works.inserted, TOTALS.works + 2);
      const formats = (await db.query("select format from works where seed_key like 'text--%' order by format")).rows.map((r) => r.format);
      assert.deepEqual(formats, ['graphic_novel', 'manga_series']);
      const joined = (await db.query(
        `select f.seed_key from franchise_memberships fm join works w on w.id = fm.work_id join franchises f on f.id = fm.franchise_id
          where w.seed_key = 'text--dragon-ball-manga'`
      )).rows;
      assert.deepEqual(joined.map((r) => r.seed_key), ['dragon-ball']);
    });
  });
  it('imports an adaptation as needs_review with certainty unknown', async () => {
    await withDb(async (db) => {
      const counts = await load(db);
      assert.deepEqual(counts.adaptations, { inserted: 1, updated: 0 });
      const row = (await db.query('select review_status, certainty, kind from adaptations')).rows[0];
      assert.deepEqual(row, { review_status: 'needs_review', certainty: 'unknown', kind: 'anime' });
    });
  });
  it('refuses certainty confirmed from the import', async () => {
    await withDb(async (db) => {
      const t = text();
      t.adaptations[0].certainty = 'confirmed';
      await assert.rejects(() => load(db, t), /confirmed/);
      assert.equal(await count(db, 'adaptations'), 0);
    });
  });
  it('refuses an adaptation whose endpoint is in neither seed', async () => {
    await withDb(async (db) => {
      const t = text();
      t.adaptations[0].adapted_work_id = 'series--nowhere';
      await assert.rejects(() => load(db, t), /not in the imported seed/);
    });
  });
  it('refuses a text work or franchise id that the video seed already uses', async () => {
    await withDb(async (db) => {
      const t = text();
      t.works[0].id = 'series--dragon-ball';
      await assert.rejects(() => load(db, t), /already in the video seed/);
    });
  });
  it('is idempotent and leaves a reviewed adaptation alone', async () => {
    await withDb(async (db) => {
      await load(db);
      await db.query("update adaptations set review_status = 'reviewed', reviewed_at = '2026-11-24', certainty = 'estimated'");
      const t = text();
      t.adaptations[0].certainty = 'unknown';
      t.adaptations[0].notes = 'changed in the file';
      const second = await load(db, t);
      assert.deepEqual(second.adaptations, { inserted: 0, updated: 1 });
      assert.equal(await count(db, 'adaptations'), 1);
      const row = (await db.query('select certainty, notes from adaptations')).rows[0];
      assert.equal(row.certainty, 'estimated');
      assert.notEqual(row.notes, 'changed in the file');
    });
  });
  it('is unchanged without a text seed', async () => {
    await withDb(async (db) => {
      const counts = await importSeed(db, seed);
      assert.equal(counts.works.inserted, TOTALS.works);
      assert.deepEqual(counts.adaptations, { inserted: 0, updated: 0 });
    });
  });
});
