import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { Scan, Review, OcrResult } from './domain';
import { normalizeCedula, validateReview } from './domain';

export const schema = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY, batch_id TEXT NOT NULL,
  original_path TEXT NOT NULL, optimized_path TEXT NOT NULL DEFAULT '',
  thumbnail_path TEXT NOT NULL DEFAULT '',
  width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'preparing',
  name TEXT NOT NULL DEFAULT '', cedula TEXT NOT NULL DEFAULT '',
  document_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '', ocr_text TEXT NOT NULL DEFAULT '', ocr_name TEXT NOT NULL DEFAULT '',
  ocr_cedula TEXT NOT NULL DEFAULT '', warnings TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scans_status ON scans(status, created_at);
CREATE TABLE IF NOT EXISTS scan_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, scan_id TEXT NOT NULL,
  action TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
PRAGMA user_version = 1;
`;

let connection: Promise<SQLite.SQLiteDatabase> | undefined;
let writes: Promise<unknown> = Promise.resolve();

export function database() {
  connection ??= (async () => {
    const db = await SQLite.openDatabaseAsync('optical-flow.db');
    await db.execAsync(schema);
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        "INSERT INTO scan_events(scan_id,action,created_at) SELECT id,'recovered',? FROM scans WHERE status IN ('processing','preparing')",
        new Date().toISOString(),
      );
      await db.runAsync("UPDATE scans SET status='queued', error='' WHERE status='processing'");
      await db.runAsync("UPDATE scans SET status='error', error='Preparación interrumpida. Reintenta optimizar.' WHERE status='preparing'");
    });
    return db;
  })();
  return connection;
}

function write<T>(task: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const result = writes.then(async () => {
    const db = await database();
    let value!: T;
    await db.withExclusiveTransactionAsync(async (transaction) => { value = await task(transaction); });
    return value;
  });
  writes = result.catch(() => undefined);
  return result;
}

async function event(db: SQLite.SQLiteDatabase, id: string, action: string, details: object = {}) {
  await db.runAsync(
    'INSERT INTO scan_events(scan_id,action,details,created_at) VALUES(?,?,?,?)',
    id, action, JSON.stringify(details), new Date().toISOString(),
  );
}

export async function currentBatch(): Promise<string> {
  return write(async (db) => {
    const batch = await db.getFirstAsync<{ id: string }>('SELECT id FROM batches ORDER BY created_at DESC LIMIT 1');
    return batch?.id ?? insertBatch(db);
  });
}

async function insertBatch(db: SQLite.SQLiteDatabase): Promise<string> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync('INSERT INTO batches(id,label,created_at) VALUES(?,?,?)', id, 'Lote ' + now.slice(0, 16), now);
  return id;
}

export function newBatch() { return write(insertBatch); }

export async function listScans(): Promise<Scan[]> {
  return (await database()).getAllAsync<Scan>('SELECT * FROM scans ORDER BY created_at DESC');
}

export async function getScan(id: string): Promise<Scan> {
  const scan = await (await database()).getFirstAsync<Scan>('SELECT * FROM scans WHERE id=?', id);
  if (!scan) throw new Error('No se encontró la captura.');
  return scan;
}

export function addScan(id: string, batch: string, originalPath: string, width: number, height: number) {
  return write(async (db) => {
    const now = new Date().toISOString();
    await db.runAsync(
      'INSERT INTO scans(id,batch_id,original_path,width,height,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      id, batch, originalPath, width, height, now, now,
    );
    await event(db, id, 'captured');
  });
}

export function markPrepared(id: string, optimized: string, thumbnail: string, width: number, height: number, bytes: number) {
  return write(async (db) => {
    await db.runAsync(
      "UPDATE scans SET optimized_path=?, thumbnail_path=?, width=?, height=?, bytes=?, status='queued', error='', updated_at=? WHERE id=? AND status IN ('preparing','error')",
      optimized, thumbnail, width, height, bytes, new Date().toISOString(), id,
    );
    await event(db, id, 'optimized', { width, height, bytes });
  });
}

export function claimNext(): Promise<Scan | null> {
  return write(async (db) => {
    const scan = await db.getFirstAsync<Scan>("SELECT * FROM scans WHERE status='queued' ORDER BY created_at LIMIT 1");
    if (!scan) return null;
    await db.runAsync("UPDATE scans SET status='processing',attempts=attempts+1,updated_at=? WHERE id=?", new Date().toISOString(), scan.id);
    await event(db, scan.id, 'ocr_started');
    return scan;
  });
}

export function completeOcr(id: string, result: OcrResult) {
  return write(async (db) => {
    const warnings = (result.extraction?.warnings ?? []).join('\n');
    await db.runAsync(
      "UPDATE scans SET status='review',raw_text=?,ocr_text=?,name=?,cedula=?,ocr_name=?,ocr_cedula=?,warnings=?,error='',updated_at=? WHERE id=? AND status='processing'",
      result.text, result.text, result.name ?? '', result.cedula ?? '', result.name ?? '', result.cedula ?? '',
      warnings, new Date().toISOString(), id,
    );
    await event(db, id, 'ocr_completed', { suggested_name: result.name, suggested_cedula: result.cedula });
  });
}

export function failScan(id: string, message: string) {
  return write(async (db) => {
    await db.runAsync("UPDATE scans SET status='error',error=?,updated_at=? WHERE id=? AND status IN ('preparing','processing','queued','error')",
      message, new Date().toISOString(), id);
    await event(db, id, 'error', { message });
  });
}

export function retryScan(id: string) {
  return write(async (db) => {
    await db.runAsync("UPDATE scans SET status='queued',error='',updated_at=? WHERE id=? AND status='error' AND optimized_path<>''", new Date().toISOString(), id);
    await event(db, id, 'retry_requested');
  });
}

export function reviewManually(id: string) {
  return write(async (db) => {
    const result = await db.runAsync(
      "UPDATE scans SET status='review',error='',updated_at=? WHERE id=? AND status IN ('queued','error')",
      new Date().toISOString(), id,
    );
    if (!result.changes) throw new Error('Espera a que termine el OCR antes de revisar.');
    await event(db, id, 'manual_review_started');
  });
}

export function saveReview(id: string, review: Review, approve: boolean) {
  const problem = validateReview(review, approve);
  if (problem) return Promise.reject(new Error(problem));
  return write(async (db) => {
    const result = await db.runAsync(
      "UPDATE scans SET name=?,cedula=?,document_date=?,notes=?,raw_text=?,status=?,updated_at=? WHERE id=? AND status IN ('review','approved')",
      review.name.trim(), normalizeCedula(review.cedula), review.document_date, review.notes,
      review.raw_text, approve ? 'approved' : 'review', new Date().toISOString(), id,
    );
    if (!result.changes) throw new Error('Esta captura todavía se está procesando.');
    await event(db, id, approve ? 'review_approved' : 'draft_saved', review);
  });
}

export async function history(id: string) {
  return (await database()).getAllAsync<{ action: string; details: string; created_at: string }>(
    'SELECT action,details,created_at FROM scan_events WHERE scan_id=? ORDER BY id DESC', id,
  );
}
