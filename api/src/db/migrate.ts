import postgres from 'postgres';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const sql = postgres(connectionString, { max: 1 });

async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const applied = new Set(
    (await sql`SELECT filename FROM _migrations`).map((r) => r.filename)
  );

  const migrationsDir = join(import.meta.dir, '../../migrations');
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }
    const content = await readFile(join(migrationsDir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO _migrations (filename) VALUES (${file})`;
    });
    console.log(`  apply ${file}`);
  }

  console.log('Migrations complete.');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
