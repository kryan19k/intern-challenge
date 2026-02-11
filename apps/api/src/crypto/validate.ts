import { TxSecureRecord } from "./types";
import { ValidationError } from "./errors";

/**
 * Validates a TxSecureRecord to ensure all fields conform to the expected
 * format before attempting decryption.
 *
 * This is a defense-in-depth measure: catching malformed records early
 * produces clear error messages instead of cryptic crypto failures.
 *
 * Validation rules:
 * - Nonces must be exactly 12 bytes (24 hex characters)
 * - Auth tags must be exactly 16 bytes (32 hex characters)
 * - All hex fields must contain only valid hex characters [0-9a-fA-F]
 * - Ciphertext must not be empty
 * - Algorithm must be "AES-256-GCM"
 */

/** Regex that matches a valid hex string (even number of chars, only hex digits) */
const HEX_REGEX = /^[0-9a-fA-F]+$/;

/**
 * Validates that a string is valid hex of the expected byte length.
 *
 * @param value     - The hex string to validate
 * @param fieldName - Human-readable field name for error messages
 * @param expectedBytes - Expected length in bytes (hex string will be 2x this)
 */
function validateHexField(value: string, fieldName: string, expectedBytes: number): void {
  if (!HEX_REGEX.test(value)) {
    throw new ValidationError(
      `${fieldName} contains invalid hex characters: "${value.slice(0, 20)}..."`
    );
  }

  const expectedHexLength = expectedBytes * 2;
  if (value.length !== expectedHexLength) {
    throw new ValidationError(
      `${fieldName} must be exactly ${expectedBytes} bytes (${expectedHexLength} hex chars), got ${value.length / 2} bytes (${value.length} hex chars)`
    );
  }
}

/**
 * Validates that a string is valid hex and is non-empty.
 * Used for variable-length fields like ciphertext and wrapped DEK.
 */
function validateHexFieldNonEmpty(value: string, fieldName: string): void {
  if (!value || value.length === 0) {
    throw new ValidationError(`${fieldName} must not be empty`);
  }

  if (value.length % 2 !== 0) {
    throw new ValidationError(
      `${fieldName} has odd-length hex string (${value.length} chars) — invalid hex encoding`
    );
  }

  if (!HEX_REGEX.test(value)) {
    throw new ValidationError(
      `${fieldName} contains invalid hex characters: "${value.slice(0, 20)}..."`
    );
  }
}

/**
 * Validates a TxSecureRecord for structural correctness.
 *
 * Call this before attempting decryption to get clear, descriptive errors
 * instead of cryptic OpenSSL failures.
 *
 * @param record - The record to validate
 * @throws ValidationError with a descriptive message if any field is invalid
 */
export function validateRecord(record: TxSecureRecord): void {
  // ── Validate nonces (must be exactly 12 bytes = 24 hex chars) ───────
  // GCM standard specifies 96-bit (12-byte) nonces. Using a different
  // size is technically possible but reduces security guarantees.
  validateHexField(record.payload_nonce, "payload_nonce", 12);
  validateHexField(record.dek_wrap_nonce, "dek_wrap_nonce", 12);

  // ── Validate auth tags (must be exactly 16 bytes = 32 hex chars) ────
  // GCM produces a 128-bit (16-byte) authentication tag by default.
  // A shorter tag would weaken integrity protection.
  validateHexField(record.payload_tag, "payload_tag", 16);
  validateHexField(record.dek_wrap_tag, "dek_wrap_tag", 16);

  // ── Validate ciphertext fields (must be valid hex, non-empty) ───────
  validateHexFieldNonEmpty(record.payload_ct, "payload_ct");
  validateHexFieldNonEmpty(record.dek_wrapped, "dek_wrapped");

  // ── Validate algorithm identifier ──────────────────────────────────
  if (record.alg !== "AES-256-GCM") {
    throw new ValidationError(
      `Unsupported algorithm "${record.alg}" — only "AES-256-GCM" is supported`
    );
  }

  // ── Validate mk_version ────────────────────────────────────────────
  if (typeof record.mk_version !== "number" || record.mk_version < 1) {
    throw new ValidationError(
      `mk_version must be a positive number, got ${record.mk_version}`
    );
  }
}
