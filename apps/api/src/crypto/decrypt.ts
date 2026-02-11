import * as crypto from "crypto";
import { TxSecureRecord } from "./types";
import { DecryptionError, TamperedDataError } from "./errors";

/**
 * Envelope Decryption — How it works:
 *
 * Decryption reverses the two-layer encryption process:
 *
 *   Step 1: Unwrap the DEK
 *     MasterKey + dek_wrap_nonce + dek_wrap_tag → DEK (plaintext)
 *
 *   Step 2: Decrypt the payload
 *     DEK + payload_nonce + payload_tag → original JSON payload
 *
 * SECURITY: Constant-time tag comparison
 * ───────────────────────────────────────
 * AES-256-GCM internally verifies the authentication tag during decryption.
 * If the tag doesn't match, Node.js crypto throws an error. We catch this
 * and throw a TamperedDataError.
 *
 * We also use crypto.timingSafeEqual() for any explicit tag comparisons
 * to prevent timing side-channel attacks. A timing attack works by measuring
 * how long a comparison takes — if we used === or Buffer.equals(), an attacker
 * could learn partial tag information by observing response times.
 */

/**
 * Decrypts a TxSecureRecord back to the original JSON payload.
 *
 * @param masterKey - Hex-encoded 32-byte master key (must match the key used for encryption)
 * @param record    - The encrypted TxSecureRecord to decrypt
 * @returns The original JSON payload as a parsed object
 * @throws TamperedDataError if any ciphertext or tag has been modified
 * @throws DecryptionError for other decryption failures (e.g. wrong key)
 */
export function decrypt(
  masterKey: string,
  record: TxSecureRecord
): Record<string, unknown> {
  const mkBuffer = Buffer.from(masterKey, "hex");
  if (mkBuffer.length !== 32) {
    throw new DecryptionError(
      `Master key must be 32 bytes (64 hex chars), got ${mkBuffer.length} bytes`
    );
  }

  // Convert all hex strings back to Buffers
  const dekWrapNonce = Buffer.from(record.dek_wrap_nonce, "hex");
  const dekWrapped = Buffer.from(record.dek_wrapped, "hex");
  const dekWrapTag = Buffer.from(record.dek_wrap_tag, "hex");
  const payloadNonce = Buffer.from(record.payload_nonce, "hex");
  const payloadCt = Buffer.from(record.payload_ct, "hex");
  const payloadTag = Buffer.from(record.payload_tag, "hex");

  let dek: Buffer;

  // ── Step 1: Unwrap the DEK using the Master Key ────────────────────
  // The DEK was encrypted with AES-256-GCM using the Master Key.
  // We decrypt it here. If the dek_wrap_tag doesn't match (tampering),
  // Node.js will throw an "Unsupported state or unable to authenticate data" error.
  try {
    const dekDecipher = crypto.createDecipheriv("aes-256-gcm", mkBuffer, dekWrapNonce);

    // Set the authentication tag BEFORE calling update/final.
    // GCM uses this tag to verify the integrity of the wrapped DEK.
    dekDecipher.setAuthTag(dekWrapTag);

    dek = Buffer.concat([
      dekDecipher.update(dekWrapped),
      dekDecipher.final(), // This is where tag verification happens
    ]);
  } catch (error: unknown) {
    // GCM auth failure means the DEK wrap was tampered with,
    // or the wrong master key was used.
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Unsupported state or unable to authenticate data")) {
      throw new TamperedDataError(
        "DEK unwrap failed — the wrapped DEK or its tag may have been tampered with, or the wrong master key was used"
      );
    }
    throw new DecryptionError(`DEK unwrap failed: ${message}`);
  }

  try {
    // ── Step 2: Decrypt the payload using the unwrapped DEK ───────────
    // Now that we have the plaintext DEK, we use it to decrypt the actual
    // payload. Again, GCM verifies the payload_tag to detect tampering.
    const payloadDecipher = crypto.createDecipheriv("aes-256-gcm", dek, payloadNonce);
    payloadDecipher.setAuthTag(payloadTag);

    const payloadPlaintext = Buffer.concat([
      payloadDecipher.update(payloadCt),
      payloadDecipher.final(), // Tag verification happens here
    ]);

    // Parse the decrypted UTF-8 string back into a JSON object
    return JSON.parse(payloadPlaintext.toString("utf-8")) as Record<string, unknown>;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Unsupported state or unable to authenticate data")) {
      throw new TamperedDataError(
        "Payload decryption failed — the ciphertext or its tag may have been tampered with"
      );
    }
    throw new DecryptionError(`Payload decryption failed: ${message}`);
  } finally {
    // ── Step 3: Zero out the DEK from memory ──────────────────────────
    // Same defense-in-depth practice as in encrypt(): overwrite the DEK
    // so it can't be recovered from a memory dump or core dump.
    dek!.fill(0);
  }
}

/**
 * Constant-time comparison utility for authentication tags.
 *
 * Uses crypto.timingSafeEqual to prevent timing side-channel attacks.
 * A regular === comparison leaks information about which byte position
 * differs, allowing an attacker to forge a valid tag one byte at a time.
 *
 * @param tagA - First tag as a hex string
 * @param tagB - Second tag as a hex string
 * @returns true if tags are identical, false otherwise
 */
export function constantTimeTagCompare(tagA: string, tagB: string): boolean {
  const bufA = Buffer.from(tagA, "hex");
  const bufB = Buffer.from(tagB, "hex");

  // timingSafeEqual requires both buffers to be the same length
  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
