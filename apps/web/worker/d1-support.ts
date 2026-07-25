// oxlint-disable eslint/no-use-before-define typescript/no-unnecessary-type-parameters
// oxlint-disable typescript/no-unsafe-type-assertion
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const migrationsDirectory = new URL("../../../packages/db/migrations/", import.meta.url);
  for (const filename of readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .toSorted()) {
    const migration = readFileSync(new URL(filename, migrationsDirectory), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") {
        database.exec(statement);
      }
    }
  }
  return database;
}

export function asD1(database: DatabaseSync): D1Database {
  const adapter = {
    prepare(query: string): D1PreparedStatement {
      return new SqliteD1Statement(database, query) as unknown as D1PreparedStatement;
    },
    async batch(statements: readonly D1PreparedStatement[]): Promise<readonly D1Result[]> {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return adapter as unknown as D1Database;
}

class SqliteD1Statement {
  private readonly database: DatabaseSync;
  private readonly parameters: readonly SQLInputValue[];
  private readonly query: string;

  public constructor(
    database: DatabaseSync,
    query: string,
    parameters: readonly SQLInputValue[] = [],
  ) {
    this.database = database;
    this.parameters = parameters;
    this.query = query;
  }

  public bind(...parameters: SQLInputValue[]): SqliteD1Statement {
    return new SqliteD1Statement(this.database, this.query, parameters);
  }

  public async all<T>(): Promise<{ readonly results: readonly T[] }> {
    return {
      results: this.database.prepare(this.query).all(...this.parameters) as T[],
    };
  }

  public async raw(): Promise<readonly (readonly unknown[])[]> {
    return this.database
      .prepare(this.query)
      .all(...this.parameters)
      .map((row) => Object.values(row));
  }

  public async run(): Promise<D1Result> {
    const result = this.database.prepare(this.query).run(...this.parameters);
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
    } as unknown as D1Result;
  }
}
