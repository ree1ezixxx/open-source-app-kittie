import { createDb, type Db } from "@kittie/db";

let db: Db | null = null;

export function getDb(): Db {
  db ??= createDb();
  return db;
}
