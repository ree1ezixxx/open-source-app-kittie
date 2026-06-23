/**
 * File I/O primitives. JSON writes are atomic (write to a unique temp file, then
 * rename) so a concurrent reader never sees a half-written file and the last
 * writer wins cleanly. The decisions log is append-only — `appendJsonl` never
 * rewrites existing lines.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function fileExists(file: string): boolean {
  return existsSync(file);
}

export function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function writeJsonAtomic(file: string, data: unknown): void {
  ensureDir(dirname(file));
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tmp, file);
}

export function readText(file: string): string | null {
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

export function writeTextAtomic(file: string, text: string): void {
  ensureDir(dirname(file));
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, file);
}

/** Append one JSON record as a line. Never rewrites prior lines. */
export function appendJsonl(file: string, record: unknown): void {
  ensureDir(dirname(file));
  appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
}

export function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  const out: T[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    out.push(JSON.parse(trimmed) as T);
  }
  return out;
}
