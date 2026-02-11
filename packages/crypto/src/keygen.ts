import crypto from "crypto";

/**
 * Generates a cryptographically secure 32-byte (256-bit) master key.
 *
 * This key is used as the Master Key (MK) in the envelope encryption scheme.
 * It should be stored securely (e.g. in environment variables, a secrets manager,
 * or an HSM in production) and NEVER committed to source control.
 *
 * @returns A 64-character hex string representing 32 random bytes
 */
export function generateMasterKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ── CLI entry point ─────────────────────────────────────────────────────
// When this file is run directly (e.g. `node dist/keygen.js`), it prints
// a fresh master key to stdout. Usage:
//   pnpm generate-master-key
//
// Copy the output and set it as your MASTER_KEY_HEX environment variable.
if (require.main === module) {
  const key = generateMasterKey();
  console.log("\n🔑 Generated Master Key (32 bytes, hex-encoded):\n");
  console.log(`   ${key}\n`);
  console.log("   Copy this value and set it as your MASTER_KEY_HEX environment variable.");
  console.log("   ⚠️  Do NOT commit this key to source control.\n");
}
