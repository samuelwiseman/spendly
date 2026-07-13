import Database from "better-sqlite3";
import { SCHEMA } from "./schema";

/** The instance type. `import { Database }` gives you the constructor, not this. */
export type DB = Database.Database;

export function createDb(file: string): DB {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

const globalForDb = globalThis as unknown as { __spendlyDb?: DB };

export function getDb(): DB {
  globalForDb.__spendlyDb ??= createDb(process.env.DB_PATH ?? "data.db");
  return globalForDb.__spendlyDb;
}
