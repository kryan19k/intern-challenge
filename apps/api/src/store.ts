import { TxSecureRecord } from "@repo/crypto";

/**
 * Storage layer for encrypted transaction records.
 *
 * Two modes:
 * - **Local (standalone):** SQLite via sql.js for persistent storage.
 *   Data survives server restarts in data/transactions.db.
 * - **Vercel (serverless):** In-memory Map. Serverless functions are
 *   ephemeral anyway, so persistence requires an external DB (Postgres).
 *   This is acceptable for a demo.
 *
 * The store auto-detects the environment via process.env.VERCEL.
 */

// ── Environment detection ────────────────────────────────────────────
const IS_VERCEL = !!process.env.VERCEL;

// ── Storage interface ────────────────────────────────────────────────
interface Store {
  save(record: TxSecureRecord): void;
  get(id: string): TxSecureRecord | undefined;
  count(): number;
}

// ── In-memory store (used on Vercel) ─────────────────────────────────
class MemoryStore implements Store {
  private map = new Map<string, TxSecureRecord>();

  save(record: TxSecureRecord): void {
    this.map.set(record.id, record);
  }

  get(id: string): TxSecureRecord | undefined {
    return this.map.get(id);
  }

  count(): number {
    return this.map.size;
  }
}

// ── SQLite store (used locally) ──────────────────────────────────────
class SqliteStore implements Store {
  private db: import("sql.js").Database | null = null;

  async init(): Promise<void> {
    const path = await import("path");
    const fs = await import("fs");
    const { default: initSqlJs } = await import("sql.js");

    const DB_PATH = path.resolve(process.cwd(), "data", "transactions.db");
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.db.run(`
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

    this.persist();
    // Store path for later persistence
    (this as unknown as { dbPath: string }).dbPath = DB_PATH;
  }

  private persist(): void {
    if (!this.db) return;
    const dbPath = (this as unknown as { dbPath: string }).dbPath;
    if (!dbPath) return;
    const fs = require("fs") as typeof import("fs");
    const data = this.db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }

  save(record: TxSecureRecord): void {
    if (!this.db) throw new Error("SQLite not initialized");
    this.db.run(
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
    this.persist();
  }

  get(id: string): TxSecureRecord | undefined {
    if (!this.db) throw new Error("SQLite not initialized");
    const stmt = this.db.prepare("SELECT * FROM transactions WHERE id = ?");
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return undefined; }
    const row = stmt.getAsObject() as unknown as TxSecureRecord;
    stmt.free();
    return row;
  }

  count(): number {
    if (!this.db) throw new Error("SQLite not initialized");
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM transactions");
    stmt.step();
    const row = stmt.getAsObject() as { count: number };
    stmt.free();
    return row.count;
  }
}

// ── Singleton ────────────────────────────────────────────────────────
let store: Store | null = null;

/**
 * Initialize the store. On Vercel, uses a simple Map.
 * Locally, uses SQLite with file persistence.
 */
export async function initStore(): Promise<void> {
  if (IS_VERCEL) {
    store = new MemoryStore();
  } else {
    const sqlite = new SqliteStore();
    await sqlite.init();
    store = sqlite;
  }
}

function getStore(): Store {
  if (!store) throw new Error("Store not initialized — call initStore() first");
  return store;
}

/** Store a new encrypted record */
export function saveRecord(record: TxSecureRecord): void {
  getStore().save(record);
}

/** Retrieve a record by ID, or undefined if not found */
export function getRecord(id: string): TxSecureRecord | undefined {
  return getStore().get(id);
}

/** Get the total number of stored records */
export function getRecordCount(): number {
  return getStore().count();
}
