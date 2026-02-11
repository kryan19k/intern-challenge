import { TxSecureRecord } from "@repo/crypto";

/**
 * Storage layer for encrypted transaction records.
 *
 * Two modes controlled by process.env.VERCEL:
 * - **Local (standalone):** SQLite via sql.js for persistent storage.
 *   Data survives server restarts in data/transactions.db.
 * - **Vercel (serverless):** In-memory Map. Serverless functions are
 *   ephemeral anyway, so persistence requires an external DB (Postgres).
 *   This is acceptable for a demo.
 */

// ── In-memory store ──────────────────────────────────────────────────
const store = new Map<string, TxSecureRecord>();

/**
 * Initialize the store. On Vercel this is a no-op (Map is ready).
 * Locally, loads existing records from SQLite into the Map.
 */
export async function initStore(): Promise<void> {
  if (process.env.VERCEL) return; // Map is already ready

  try {
    const path = await import("path");
    const fs = await import("fs");
    const sqljs = await import("sql.js");
    const initSqlJs = sqljs.default;

    const DB_PATH = path.resolve(process.cwd(), "data", "transactions.db");
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const SQL = await initSqlJs();
    let db;

    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id             TEXT PRIMARY KEY,
        partyId        TEXT NOT NULL,
        createdAt      TEXT NOT NULL,
        payload_nonce  TEXT NOT NULL,
        payload_ct     TEXT NOT NULL,
        payload_tag    TEXT NOT NULL,
        dek_wrap_nonce TEXT NOT NULL,
        dek_wrapped    TEXT NOT NULL,
        dek_wrap_tag   TEXT NOT NULL,
        alg            TEXT NOT NULL DEFAULT 'AES-256-GCM',
        mk_version     INTEGER NOT NULL DEFAULT 1
      )
    `);

    // Load all existing records into the Map
    const rows = db.exec("SELECT * FROM transactions");
    if (rows.length > 0) {
      const cols = rows[0].columns;
      for (const values of rows[0].values) {
        const record: Record<string, unknown> = {};
        cols.forEach((col, i) => { record[col] = values[i]; });
        store.set(record.id as string, record as unknown as TxSecureRecord);
      }
    }

    // Store the db reference for persistence
    (globalThis as unknown as { __sqliteDb: unknown; __sqliteDbPath: string }).__sqliteDb = db;
    (globalThis as unknown as { __sqliteDbPath: string }).__sqliteDbPath = DB_PATH;
  } catch (err) {
    console.warn("SQLite init failed, using in-memory only:", err);
  }
}

/** Persist to SQLite on disk (local only, no-op on Vercel) */
function persistToSqlite(record: TxSecureRecord): void {
  try {
    const g = globalThis as unknown as { __sqliteDb: { run: Function; export: Function }; __sqliteDbPath: string };
    if (!g.__sqliteDb) return;
    const fs = require("fs") as typeof import("fs");

    g.__sqliteDb.run(
      `INSERT OR REPLACE INTO transactions (
        id, partyId, createdAt,
        payload_nonce, payload_ct, payload_tag,
        dek_wrap_nonce, dek_wrapped, dek_wrap_tag,
        alg, mk_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id, record.partyId, record.createdAt,
        record.payload_nonce, record.payload_ct, record.payload_tag,
        record.dek_wrap_nonce, record.dek_wrapped, record.dek_wrap_tag,
        record.alg, record.mk_version,
      ]
    );

    const data = g.__sqliteDb.export();
    fs.writeFileSync(g.__sqliteDbPath, Buffer.from(data as Uint8Array));
  } catch {
    // Silently fail — Map is the source of truth
  }
}

/** Store a new encrypted record */
export function saveRecord(record: TxSecureRecord): void {
  store.set(record.id, record);
  persistToSqlite(record);
}

/** Retrieve a record by ID, or undefined if not found */
export function getRecord(id: string): TxSecureRecord | undefined {
  return store.get(id);
}

/** Get the total number of stored records */
export function getRecordCount(): number {
  return store.size;
}
