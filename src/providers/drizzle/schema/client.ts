import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

export function createDrizzleClient(url: string): {
  db: DrizzleDB;
  pg: ReturnType<typeof postgres>;
} {
  const pg = postgres(url, {
    max: 10,
    idle_timeout: 30,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
    connection: {
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 60000,
    } as Record<string, number>,
  });
  const db = drizzle(pg, { schema });
  return { db, pg };
}
