/**
 * Simple migration runner - executes SQL migration files against the database.
 * Usage: npx tsx backend/src/migrate.ts
 */
import './load-env';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool, closePool } from './utils/db';

async function runMigrations() {
  const pool = getPool();
  const migrationFile = join(__dirname, 'migrations', '001_create_schema.sql');
  
  console.log('🗄️  Running migrations...');
  
  try {
    const sql = readFileSync(migrationFile, 'utf-8');
    await pool.query(sql);
    console.log('✅ Migrations completed successfully!');
  } catch (err: any) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

runMigrations();
