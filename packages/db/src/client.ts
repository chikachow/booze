import { drizzle } from "drizzle-orm/d1";
import type { AnyD1Database, DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "./schema.ts";

export type BoozeDatabase = DrizzleD1Database<typeof schema>;

export function createD1Client(database: AnyD1Database): BoozeDatabase {
  return drizzle(database, { schema });
}

function d1DatabaseForSession(session: D1DatabaseSession): D1Database {
  return {
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      return session.batch<T>(statements);
    },
    async dump(): Promise<ArrayBuffer> {
      throw new Error("D1 sessions do not support dump");
    },
    async exec(): Promise<D1ExecResult> {
      throw new Error("D1 sessions do not support exec");
    },
    prepare(query: string): D1PreparedStatement {
      return session.prepare(query);
    },
    withSession(): D1DatabaseSession {
      return session;
    },
  };
}

export function createD1SessionClient(database: D1DatabaseSession): BoozeDatabase {
  return drizzle(d1DatabaseForSession(database), { schema });
}
