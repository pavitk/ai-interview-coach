/**
 * Simple migration runner - executes SQL migration files against the database.
 * Usage: npx tsx backend/src/migrate.ts
 */
import './load-env';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool, closePool } from './utils/db';

async function runMigrations() {
  console.log('   DATABASE_URL set:', !!process.env.DATABASE_URL);
  console.log('   URL starts with:', process.env.DATABASE_URL?.substring(0, 30) || 'NOT SET');
  const pool = getPool();
  const pool = getPool();
  const migrationFile = join(__dirname, 'migrations', '001_create_schema.sql');
  
  console.log('🗄️  Running migrations...');
  
  try {
    const sql = readFileSync(migrationFile, 'utf-8');
    await pool.query(sql);
    console.log('✅ Migrations completed successfully!');
  } catch (err: any) {
    console.error('❌ Migration failed:', err.message || err);
    console.error('   Detail:', err.detail || 'none');
    console.error('   Hint:', err.hint || 'none');
    console.error('   DATABASE_URL set:', !!process.env.DATABASE_URL);
    process.exit(1);
  } finally {
    await closePool();
  }
}

runMigrations();
