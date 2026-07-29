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

  const dbPool = getPool();
  const migrationFile = join(__dirname, 'migrations', '001_create_schema.sql');
  
  console.log('🗄️  Running migrations...');
  
  try {
    const sql = readFileSync(migrationFile, 'utf-8');
    await dbPool.query(sql);
    console.log('✅ Migrations completed successfully!');
  } catch (err: any) {
    console.error('❌ Migration failed:', err.message || err);
    console.error('   Detail:', err.detail || 'none');
    console.error('   Hint:', err.hint || 'none');
    // Don't exit — let the server start anyway
    console.log('⚠️  Server will start without migrations. Database may be empty.');
  } finally {
    await closePool();
  }
}

runMigrations();
