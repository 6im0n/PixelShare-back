import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

export function createDrizzleClient(url: string): {
  db: DrizzleDB;
  pg: ReturnType<typeof postgres>;
} {
  const pg = postgres(url, { max: 10 });
  const db = drizzle(pg, { schema });
  return { db, pg };
}
