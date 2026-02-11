import * as dotenv from "dotenv";
import { buildApp } from "./app";
import { initStore } from "./store";

// Load environment variables from .env file (for local development)
dotenv.config({ path: "../../.env" });

/**
 * Standalone Fastify server entry point.
 *
 * Validates that the MASTER_KEY_HEX environment variable is set and correctly
 * formatted before starting the server. This is a "fail fast" approach —
 * better to crash on startup with a clear message than to fail silently
 * on the first request.
 */
async function main(): Promise<void> {
  // ── Validate MASTER_KEY_HEX ─────────────────────────────────────────────
  const masterKey = process.env.MASTER_KEY_HEX;

  if (!masterKey) {
    console.error("❌ MASTER_KEY_HEX environment variable is not set.");
    console.error("   Run: pnpm generate-master-key");
    console.error("   Then set MASTER_KEY_HEX in your .env file.");
    process.exit(1);
  }

  if (masterKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(masterKey)) {
    console.error("❌ MASTER_KEY_HEX must be exactly 64 hex characters (32 bytes).");
    console.error(`   Got ${masterKey.length} characters.`);
    process.exit(1);
  }

  console.log("✅ MASTER_KEY_HEX loaded and validated (32 bytes)");

  // ── Initialize store (Supabase PostgreSQL) ─────────────────────────
  await initStore();
  console.log("✅ Store initialized");

  // ── Start server ────────────────────────────────────────────────────
  const app = await buildApp();
  const port = parseInt(process.env.PORT || "3001", 10);
  const host = process.env.HOST || "0.0.0.0";

  try {
    await app.listen({ port, host });
    console.log(`🚀 API server running at http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
