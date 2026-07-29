import { Pool, PoolConfig, QueryResult } from 'pg';

/**
 * Database connection utility with connection pooling and retry logic.
 * Uses pg library with exponential backoff for resilient database access.
 *
 * Retry policies (from design spec):
 * - Writes: 3 retries, exponential backoff (1s, 2s, 4s), 5s timeout per attempt
 * - Reads: 2 retries, fixed 500ms delay, 3s timeout per attempt
 */

export type QueryMode = 'read' | 'write';

export interface QueryOptions {
  /** Maximum number of retry attempts. Defaults based on mode: writes=3, reads=2 */
  maxRetries?: number;
  /** Statement timeout in milliseconds. Defaults based on mode: writes=5000, reads=3000 */
  timeoutMs?: number;
  /** Query mode: 'read' or 'write'. Defaults to 'write'. */
  mode?: QueryMode;
}

const DEFAULT_WRITE_RETRIES = 3;
const DEFAULT_READ_RETRIES = 2;
const DEFAULT_WRITE_TIMEOUT_MS = 5000;
const DEFAULT_READ_TIMEOUT_MS = 3000;
const WRITE_BACKOFF_BASE_MS = 1000;
const READ_BACKOFF_MS = 500;

let pool: Pool | null = null;

function getPoolConfig(): PoolConfig {
  // Support Railway's DATABASE_URL or individual vars
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

/**
 * Get or create the connection pool (singleton per Lambda container).
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getPoolConfig());
  }
  return pool;
}

/**
 * Calculate backoff delay based on query mode and attempt number.
 * - Writes use exponential backoff: 1s, 2s, 4s
 * - Reads use fixed delay: 500ms
 */
function getBackoffMs(mode: QueryMode, attempt: number): number {
  if (mode === 'read') {
    return READ_BACKOFF_MS;
  }
  return WRITE_BACKOFF_BASE_MS * Math.pow(2, attempt);
}

/**
 * Execute a query with retry logic and configurable timeout.
 *
 * For writes (default): 3 attempts, exponential backoff (1s, 2s, 4s), 5s timeout
 * For reads: 2 attempts, fixed 500ms delay, 3s timeout
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T extends Record<string, any> = Record<string, any>>(
  text: string,
  params?: unknown[],
  options: QueryOptions = {}
): Promise<QueryResult<T>> {
  const mode = options.mode ?? 'write';
  const maxRetries = options.maxRetries ?? (mode === 'read' ? DEFAULT_READ_RETRIES : DEFAULT_WRITE_RETRIES);
  const timeoutMs = options.timeoutMs ?? (mode === 'read' ? DEFAULT_READ_TIMEOUT_MS : DEFAULT_WRITE_TIMEOUT_MS);
  const dbPool = getPool();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const client = await dbPool.connect();
      try {
        if (timeoutMs > 0) {
          await client.query(`SET statement_timeout = ${timeoutMs}`);
        }
        const result = await client.query<T>(text, params);
        return result;
      } finally {
        client.release();
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        const backoffMs = getBackoffMs(mode, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError ?? new Error('Database query failed after retries');
}

/**
 * Close the connection pool (for graceful shutdown).
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
