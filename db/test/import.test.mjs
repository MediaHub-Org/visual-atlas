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
        ['001_review_and_seed_key.sql', '002_relations_and_claims.sql', '003_sequences.sql', 'base:schema.sql']
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
