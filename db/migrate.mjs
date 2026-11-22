// Migration runner: the proposed schema, then every file in db/migrations/ in
// name order, each in its own transaction. Applied files are recorded with a
// checksum, and a file that changed after being applied is refused instead of
// silently skipped.
//
// Small on purpose: no down migrations, no ORM. Tests use an in-memory PGlite;
// `npm run db:migrate` uses db/.data (ignored by git).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = join(here, 'schema.sql');
const MIGRATIONS = join(here, 'migrations');

const checksum = (text) => createHash('sha256').update(text).digest('hex');

/**
 * Applies everything pending and returns the names it applied (empty when the
 * database is already current).
 */
export async function migrate(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Map(
    (await db.query('select name, checksum from schema_migrations')).rows.map((row) => [
      row.name,
      row.checksum,
    ])
  );

  const files = [
    { name: 'base:schema.sql', sql: readFileSync(BASE, 'utf8') },
    ...readdirSync(MIGRATIONS)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => ({ name: file, sql: readFileSync(join(MIGRATIONS, file), 'utf8') })),
  ];

  const ran = [];
  for (const file of files) {
    const sum = checksum(file.sql);
    const previous = applied.get(file.name);
    if (previous) {
      if (previous !== sum) {
        throw new Error(`${file.name} changed after it was applied (checksum mismatch)`);
      }
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.exec(file.sql);
      await tx.query('insert into schema_migrations (name, checksum) values ($1, $2)', [
        file.name,
        sum,
      ]);
    });
    ran.push(file.name);
  }
  return ran;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new PGlite(join(here, '.data'));
  try {
    const ran = await migrate(db);
    console.log(ran.length ? `applied: ${ran.join(', ')}` : 'nothing to apply');
  } finally {
    await db.close();
  }
}
