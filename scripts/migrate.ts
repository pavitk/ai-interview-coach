/**
 * Database migration runner.
 * Runs all SQL migration files in order against the configured PostgreSQL database.
 * 
 * Usage: npx tsx scripts/migrate.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

async function migrate() {
  // Load env vars
  const envPath = join(process.cwd(), '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      env[key!] = valueParts.join('=');
    }
  }

  const pool = new Pool({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT) || 5432,
    database: env.DB_NAME || 'ai_interview_coach',
    user: env.DB_USER || 'postgres',
    password: env.DB_PASSWORD || '',
  });

  const migrationsDir = join(process.cwd(), 'backend', 'src', 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Running ${files.length} migrations against ${env.DB_NAME}...\n`);

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    try {
      await pool.query(sql);
      console.log(`  ✓ ${file}`);
    } catch (err: any) {
      // Skip "already exists" errors (idempotent migrations)
      if (err.message?.includes('already exists') || err.code === '42710' || err.code === '42P07') {
        console.log(`  ⊘ ${file} (already applied)`);
      } else {
        console.error(`  ✗ ${file}: ${err.message}`);
        process.exit(1);
      }
    }
  }

  await pool.end();
  console.log('\nMigrations complete!');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
