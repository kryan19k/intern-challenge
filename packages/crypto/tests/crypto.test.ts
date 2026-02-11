import { describe, it, expect } from "vitest";
import {
  encrypt,
  decrypt,
  validateRecord,
  generateMasterKey,
  TxSecureRecord,
  TamperedDataError,
  ValidationError,
  DecryptionError,
} from "../src/index";

/**
 * Test suite for the @repo/crypto envelope encryption package.
 *
 * These tests verify:
 * 1. Correctness — encrypt/decrypt roundtrip preserves data
 * 2. Integrity — tampering with any component is detected
 * 3. Validation — malformed records are rejected with clear errors
 * 4. Security — nonce uniqueness, key isolation
 */

// Generate a fresh master key for testing
const TEST_MASTER_KEY = generateMasterKey();

const TEST_PAYLOAD = { amount: 100, currency: "AED", note: "Test transaction" };
const TEST_PARTY_ID = "party_123";

describe("Envelope Encryption", () => {
  // ── Test 1: Roundtrip ─────────────────────────────────────────────────
  it("encrypt → decrypt roundtrip returns original payload", () => {
    const record = encrypt(TEST_MASTER_KEY, TEST_PARTY_ID, TEST_PAYLOAD);
    const decrypted = decrypt(TEST_MASTER_KEY, record);

    expect(decrypted).toEqual(TEST_PAYLOAD);
    expect(record.partyId).toBe(TEST_PARTY_ID);
    expect(record.alg).toBe("AES-256-GCM");
    expect(record.mk_version).toBe(1);
  });

  // ── Test 2: Tampered ciphertext ───────────────────────────────────────
  it("tampered ciphertext → decryption throws TamperedDataError", () => {
    const record = encrypt(TEST_MASTER_KEY, TEST_PARTY_ID, TEST_PAYLOAD);

    // Flip a character in the ciphertext
    const tampered: TxSecureRecord = {
      ...record,
      payload_ct: flipHexChar(record.payload_ct),
    };

    expect(() => decrypt(TEST_MASTER_KEY, tampered)).toThrow(TamperedDataError);
  });

  // ── Test 3: Tampered payload auth tag ─────────────────────────────────
  it("tampered payload auth tag → decryption throws TamperedDataError", () => {
    const record = encrypt(TEST_MASTER_KEY, TEST_PARTY_ID, TEST_PAYLOAD);

    const tampered: TxSecureRecord = {
      ...record,
      payload_tag: flipHexChar(record.payload_tag),
    };

    expect(() => decrypt(TEST_MASTER_KEY, tampered)).toThrow(TamperedDataError);
  });

  // ── Test 4: Tampered DEK wrap tag ─────────────────────────────────────
  it("tampered DEK wrap tag → decryption throws TamperedDataError", () => {
    const record = encrypt(TEST_MASTER_KEY, TEST_PARTY_ID, TEST_PAYLOAD);

    const tampered: TxSecureRecord = {
      ...record,
      dek_wrap_tag: flipHexChar(record.dek_wrap_tag),
    };

    expect(() => decrypt(TEST_MASTER_KEY, tampered)).toThrow(TamperedDataError);
  });

  // ── Test 5: Wrong nonce length → validation fails ─────────────────────
  it("wrong nonce length (not 12 bytes) → validation throws ValidationError", () => {
    const record = encrypt(TEST_MASTER_KEY, TEST_PARTY_ID, TEST_PAYLOAD);

    const badRecord: TxSecureRecord = {
      ...record,
      payload_nonce: "aabbccdd", // Only 4 bytes instead of 12
    };

    expect(() => validateRecord(badRecord)).toThrow(ValidationError);
    expect(() => validateRecord(badRecord)).toThrow("payload_nonce must be exactly 12 bytes");
  });

  // ── Test 6: Wrong tag length → validation fails ───────────────────────
  it("wrong tag length (not 16 bytes) → validation throws ValidationError", () => {
    const record = encrypt(TEST_MASTER_KEY, TEST_PARTY_ID, TEST_PAYLOAD);

    const badRecord: TxSecureRecord = {
      ...record,
      payload_tag: "aabbccdd", // Only 4 bytes instead of 16
    };

    expect(() => validateRecord(badRecord)).toThrow(ValidationError);
    expect(() => validateRecord(badRecord)).toThrow("payload_tag must be exactly 16 bytes");
  });

  // ── Test 7: Invalid hex in fields → validation fails ──────────────────
  it("invalid hex in fields → validation throws ValidationError", () => {
    const record = encrypt(TEST_MASTER_KEY, TEST_PARTY_ID, TEST_PAYLOAD);

    const badRecord: TxSecureRecord = {
      ...record,
      payload_nonce: "zzzzzzzzzzzzzzzzzzzzzzzz", // 24 chars but not valid hex
    };

    expect(() => validateRecord(badRecord)).toThrow(ValidationError);
    expect(() => validateRecord(badRecord)).toThrow("invalid hex characters");
  });

  // ── Test 8: Wrong master key → decryption fails ───────────────────────
  it("wrong master key → decryption fails", () => {
    const record = encrypt(TEST_MASTER_KEY, TEST_PARTY_ID, TEST_PAYLOAD);

    // Generate a completely different master key
    const wrongKey = generateMasterKey();

    expect(() => decrypt(wrongKey, record)).toThrow();
  });

  // ── Test 9: Different partyIds can encrypt/decrypt independently ──────
  it("different partyIds can encrypt/decrypt independently", () => {
    const record1 = encrypt(TEST_MASTER_KEY, "party_A", { data: "alpha" });
    const record2 = encrypt(TEST_MASTER_KEY, "party_B", { data: "beta" });

    const decrypted1 = decrypt(TEST_MASTER_KEY, record1);
    const decrypted2 = decrypt(TEST_MASTER_KEY, record2);

    expect(decrypted1).toEqual({ data: "alpha" });
    expect(decrypted2).toEqual({ data: "beta" });
    expect(record1.partyId).toBe("party_A");
    expect(record2.partyId).toBe("party_B");
  });

  // ── Test 10: Nonce uniqueness ─────────────────────────────────────────
  it("two encryptions of same plaintext produce different ciphertexts (nonce uniqueness)", () => {
    const record1 = encrypt(TEST_MASTER_KEY, TEST_PARTY_ID, TEST_PAYLOAD);
    const record2 = encrypt(TEST_MASTER_KEY, TEST_PARTY_ID, TEST_PAYLOAD);

    // Same plaintext, same key, but different random nonces → different ciphertext
    expect(record1.payload_ct).not.toBe(record2.payload_ct);
    expect(record1.payload_nonce).not.toBe(record2.payload_nonce);
    expect(record1.dek_wrap_nonce).not.toBe(record2.dek_wrap_nonce);

    // But both should decrypt to the same payload
    expect(decrypt(TEST_MASTER_KEY, record1)).toEqual(TEST_PAYLOAD);
    expect(decrypt(TEST_MASTER_KEY, record2)).toEqual(TEST_PAYLOAD);
  });

  // ── Bonus Test 11: Empty ciphertext → validation fails ────────────────
  it("empty ciphertext → validation throws ValidationError", () => {
    const record = encrypt(TEST_MASTER_KEY, TEST_PARTY_ID, TEST_PAYLOAD);

    const badRecord: TxSecureRecord = {
      ...record,
      payload_ct: "",
    };

    expect(() => validateRecord(badRecord)).toThrow(ValidationError);
    expect(() => validateRecord(badRecord)).toThrow("must not be empty");
  });

  // ── Bonus Test 12: Wrong algorithm → validation fails ─────────────────
  it("wrong algorithm → validation throws ValidationError", () => {
    const record = encrypt(TEST_MASTER_KEY, TEST_PARTY_ID, TEST_PAYLOAD);

    const badRecord = {
      ...record,
      alg: "AES-128-CBC" as "AES-256-GCM",
    };

    expect(() => validateRecord(badRecord)).toThrow(ValidationError);
    expect(() => validateRecord(badRecord)).toThrow("Unsupported algorithm");
  });
});

/**
 * Helper: flips the first hex character in a string to produce a tampered value.
 * e.g. "a1b2c3" → "b1b2c3"
 */
function flipHexChar(hex: string): string {
  const firstChar = hex[0];
  const flipped = firstChar === "a" ? "b" : "a";
  return flipped + hex.slice(1);
}
