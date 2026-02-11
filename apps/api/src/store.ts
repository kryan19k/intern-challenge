import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import * as path from "path";
import * as fs from "fs";
import { TxSecureRecord } from "@repo/crypto";

/**
 * SQLite-backed persistent storage for encrypted transaction records.
 *
 * Uses sql.js — a pure JavaScript SQLite implementation compiled from
 * the C source via Emscripten. No native compilation or node-gyp needed.
 *
 * The database file is stored at data/transactions.db relative to the
 * API root. Data survives server restarts.
 *
 * All encrypted fields are stored as TEXT (hex strings), matching the
 * TxSecureRecord type. SQLite is a great fit here because:
 * - Zero config — no external database server needed
 * - ACID transactions out of the box
 * - Single-file database, easy to back up
 * - Pure JS — works on any platform without build tools
 */

// ── Database path ────────────────────────────────────────────────────
const DB_PATH = path.resolve(process.cwd(), "data", "transactions.db");

// Ensure the data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ── Database singleton ───────────────────────────────────────────────
let db: SqlJsDatabase | null = null;

/**
 * Initialize the SQLite database. Must be called once before any
 * read/write operations (called from the server entry point).
 */
export async function initStore(): Promise<void> {
  const SQL = await initSqlJs();

  // Load existing database file if it exists, otherwise create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create the transactions table if it doesn't exist
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

  persist();
}

/** Write the in-memory database to disk */
function persist(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/** Get the database instance, throwing if not initialized */
function getDb(): SqlJsDatabase {
  if (!db) throw new Error("Database not initialized — call initStore() first");
  return db;
}

/** Store a new encrypted record in SQLite */
export function saveRecord(record: TxSecureRecord): void {
  const d = getDb();
  d.run(
    `INSERT INTO transactions (
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
  persist();
}

/** Retrieve a record by ID, or undefined if not found */
export function getRecord(id: string): TxSecureRecord | undefined {
  const d = getDb();
  const stmt = d.prepare("SELECT * FROM transactions WHERE id = ?");
  stmt.bind([id]);

  if (!stmt.step()) {
    stmt.free();
    return undefined;
  }

  const row = stmt.getAsObject() as unknown as TxSecureRecord;
  stmt.free();
  return row;
}

/** Get the total number of stored records */
export function getRecordCount(): number {
  const d = getDb();
  const stmt = d.prepare("SELECT COUNT(*) as count FROM transactions");
  stmt.step();
  const row = stmt.getAsObject() as { count: number };
  stmt.free();
  return row.count;
}
