import * as crypto from "crypto";
import { TxSecureRecord } from "./types";
import { EncryptionError } from "./errors";

/**
 * Envelope Encryption — How it works:
 *
 * Instead of encrypting data directly with the Master Key (MK), we use a
 * two-layer key hierarchy:
 *
 *   Layer 1: Master Key (MK)
 *     └── Wraps (encrypts) the Data Encryption Key
 *
 *   Layer 2: Data Encryption Key (DEK)
 *     └── Encrypts the actual payload data
 *
 * WHY envelope encryption?
 * ─────────────────────────
 * 1. If a DEK is compromised, only ONE record is affected (not all records).
 * 2. The Master Key never directly touches plaintext data.
 * 3. Enables key rotation: change the MK without re-encrypting all data.
 * 4. Mirrors how AWS KMS, Google Cloud KMS, and Azure Key Vault work.
 *
 * WHY AES-256-GCM?
 * ─────────────────
 * AES-256-GCM is an "authenticated encryption" algorithm. It provides:
 * - Confidentiality: data is encrypted (AES-256 in counter mode)
 * - Integrity: a 16-byte authentication tag detects any tampering
 * - No need for a separate HMAC step
 *
 * WHY random nonces?
 * ──────────────────
 * GCM requires a unique nonce (IV) for every encryption with the same key.
 * Reusing a nonce with the same key completely breaks GCM security.
 * We generate a fresh 12-byte random nonce for every operation.
 */

/**
 * Encrypts a JSON payload using envelope encryption.
 *
 * @param masterKey - Hex-encoded 32-byte master key (64 hex chars)
 * @param partyId   - Identifier for the party owning this transaction
 * @param payload   - The JSON-serializable object to encrypt
 * @param mkVersion - Master key version (default: 1, for key rotation support)
 * @returns A complete TxSecureRecord with all encrypted components
 */
export function encrypt(
  masterKey: string,
  partyId: string,
  payload: Record<string, unknown>,
  mkVersion: number = 1
): TxSecureRecord {
  // ── Step 0: Validate the master key ──────────────────────────────────
  // The master key must be exactly 32 bytes (64 hex characters).
  const mkBuffer = Buffer.from(masterKey, "hex");
  if (mkBuffer.length !== 32) {
    throw new EncryptionError(
      `Master key must be 32 bytes (64 hex chars), got ${mkBuffer.length} bytes`
    );
  }

  // ── Step 1: Generate a random Data Encryption Key (DEK) ─────────────
  // Each transaction gets its own unique DEK. This is the "envelope" —
  // even if this DEK leaks, only this one record is compromised.
  const dek = crypto.randomBytes(32);

  try {
    // ── Step 2: Encrypt the payload with the DEK ────────────────────────
    // Convert the JSON payload to a UTF-8 string, then encrypt it with
    // AES-256-GCM using the DEK and a fresh random 12-byte nonce.
    const payloadPlaintext = Buffer.from(JSON.stringify(payload), "utf-8");
    const payloadNonce = crypto.randomBytes(12); // 12 bytes = 96 bits, standard for GCM

    const payloadCipher = crypto.createCipheriv("aes-256-gcm", dek, payloadNonce);
    const payloadCt = Buffer.concat([
      payloadCipher.update(payloadPlaintext),
      payloadCipher.final(),
    ]);
    const payloadTag = payloadCipher.getAuthTag(); // 16-byte authentication tag

    // ── Step 3: Wrap (encrypt) the DEK with the Master Key ──────────────
    // The DEK itself is encrypted with the Master Key so it can be safely
    // stored alongside the ciphertext. Only someone with the MK can unwrap it.
    const dekWrapNonce = crypto.randomBytes(12);

    const dekCipher = crypto.createCipheriv("aes-256-gcm", mkBuffer, dekWrapNonce);
    const dekWrapped = Buffer.concat([
      dekCipher.update(dek),
      dekCipher.final(),
    ]);
    const dekWrapTag = dekCipher.getAuthTag();

    // ── Step 4: Assemble the secure record ──────────────────────────────
    // All binary values are converted to hex strings for safe JSON storage.
    const record: TxSecureRecord = {
      id: crypto.randomUUID(),
      partyId,
      createdAt: new Date().toISOString(),

      // Payload encryption components
      payload_nonce: payloadNonce.toString("hex"),
      payload_ct: payloadCt.toString("hex"),
      payload_tag: payloadTag.toString("hex"),

      // DEK wrapping components
      dek_wrap_nonce: dekWrapNonce.toString("hex"),
      dek_wrapped: dekWrapped.toString("hex"),
      dek_wrap_tag: dekWrapTag.toString("hex"),

      // Metadata
      alg: "AES-256-GCM",
      mk_version: mkVersion,
    };

    return record;
  } finally {
    // ── Step 5: Zero out the DEK from memory ────────────────────────────
    // Defense in depth: overwrite the DEK buffer with zeros so it cannot
    // be recovered from a memory dump. In a garbage-collected language like
    // JS this isn't foolproof, but it raises the bar for attackers and is
    // a security best practice used in production crypto systems.
    dek.fill(0);
  }
}
