// Text media (comics & manga): the formats and the adaptations table added by
// migration 005, against a real PostgreSQL engine (PGlite), fresh database per test.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../migrate.mjs';

async function withDb(run) {
  const db = new PGlite();
  try {
    await migrate(db);
    return await run(db);
  } finally {
    await db.close();
  }
}

async function refuses(db, sql, codes, params) {
  const expected = Array.isArray(codes) ? codes : [codes];
  await assert.rejects(
    () => db.query(sql, params),
    (error) => {
      assert.ok(expected.includes(error.code), `expected ${expected.join(' or ')} but got ${error.code}: ${error.message}`);
      return true;
    },
  );
}

const work = async (db, title, format) =>
  (await db.query('insert into works (title, format) values ($1, $2) returning id', [title, format])).rows[0].id;

describe('text works', () => {
  it('accepts every text format with no parent', async () => {
    await withDb(async (db) => {
      for (const format of ['comic_series', 'manga_series', 'graphic_novel']) {
        assert.ok(await work(db, `T ${format}`, format));
      }
    });
  });
  it('refuses a text work with a parent', async () => {
    await withDb(async (db) => {
      const parent = await work(db, 'Parent', 'series');
      await refuses(db, "insert into works (title, format, parent_work_id) values ('Child', 'manga_series', $1)", '23514', [parent]);
    });
  });
  it('refuses video-only columns on a text work', async () => {
    await withDb(async (db) => {
      await refuses(db, "insert into works (title, format, is_anime) values ('A', 'manga_series', true)", '23514');
      await refuses(db, "insert into works (title, format, is_animation) values ('B', 'comic_series', true)", '23514');
      await refuses(db, "insert into works (title, format, episode_count) values ('C', 'graphic_novel', 3)", '23514');
    });
  });
  it('still refuses an unknown format', async () => {
    await withDb(async (db) => {
      await refuses(db, "insert into works (title, format) values ('X', 'podcast')", '23514');
    });
  });
});

describe('adaptations', () => {
  const link = (db, source, adapted, kind = 'anime', certainty = 'unknown') =>
    db.query('insert into adaptations (source_work_id, adapted_work_id, kind, certainty) values ($1, $2, $3, $4)', [source, adapted, kind, certainty]);

  it('links a text work and a video work, readable from both ends', async () => {
    await withDb(async (db) => {
      const manga = await work(db, 'Manga', 'manga_series');
      const anime = await work(db, 'Anime', 'series');
      await link(db, manga, anime);
      const row = (await db.query('select review_status, certainty from adaptations')).rows[0];
      assert.deepEqual(row, { review_status: 'needs_review', certainty: 'unknown' });
      assert.equal((await db.query('select 1 from adaptations where source_work_id = $1', [manga])).rows.length, 1);
      assert.equal((await db.query('select 1 from adaptations where adapted_work_id = $1', [anime])).rows.length, 1);
    });
  });
  it('refuses a work adapted onto itself', async () => {
    await withDb(async (db) => {
      const manga = await work(db, 'Manga', 'manga_series');
      await refuses(db, "insert into adaptations (source_work_id, adapted_work_id, kind) values ($1, $1, 'anime')", '23514', [manga]);
    });
  });
  it('refuses a duplicate (source, adapted, kind) but allows another kind', async () => {
    await withDb(async (db) => {
      const manga = await work(db, 'Manga', 'manga_series');
      const anime = await work(db, 'Anime', 'series');
      await link(db, manga, anime, 'anime');
      await refuses(db, "insert into adaptations (source_work_id, adapted_work_id, kind) values ($1, $2, 'anime')", '23505', [manga, anime]);
      await link(db, manga, anime, 'series');
    });
  });
  it('refuses a kind outside the list and certainty outside unknown/estimated/confirmed', async () => {
    await withDb(async (db) => {
      const manga = await work(db, 'Manga', 'manga_series');
      const anime = await work(db, 'Anime', 'series');
      await refuses(db, "insert into adaptations (source_work_id, adapted_work_id, kind) values ($1, $2, 'musical')", '23514', [manga, anime]);
      await refuses(db, "insert into adaptations (source_work_id, adapted_work_id, kind, certainty) values ($1, $2, 'anime', 'disputed')", '23514', [manga, anime]);
    });
  });
  it('refuses reviewed without a review date', async () => {
    await withDb(async (db) => {
      const manga = await work(db, 'Manga', 'manga_series');
      const anime = await work(db, 'Anime', 'series');
      await refuses(db, "insert into adaptations (source_work_id, adapted_work_id, kind, review_status) values ($1, $2, 'anime', 'reviewed')", '23514', [manga, anime]);
    });
  });
  it('refuses a link to a work that does not exist', async () => {
    await withDb(async (db) => {
      const manga = await work(db, 'Manga', 'manga_series');
      await refuses(db, "insert into adaptations (source_work_id, adapted_work_id, kind) values ($1, 999999, 'anime')", '23503', [manga]);
    });
  });
});
