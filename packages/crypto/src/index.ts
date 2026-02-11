/**
 * @repo/crypto — Envelope Encryption Library
 *
 * This package implements envelope encryption using AES-256-GCM with
 * Node.js native crypto module (zero external dependencies).
 *
 * Exports:
 * - encrypt()           — Encrypt a JSON payload with envelope encryption
 * - decrypt()           — Decrypt a TxSecureRecord back to the original payload
 * - constantTimeTagCompare() — Timing-safe tag comparison utility
 * - validateRecord()    — Validate a TxSecureRecord's structure
 * - generateMasterKey() — Generate a secure random master key
 * - TxSecureRecord      — TypeScript type for encrypted records
 * - Error classes       — EncryptionError, DecryptionError, ValidationError, TamperedDataError
 */

export type { TxSecureRecord } from "./types";

export {
  CryptoError,
  EncryptionError,
  DecryptionError,
  ValidationError,
  TamperedDataError,
} from "./errors";

export { encrypt } from "./encrypt";
export { decrypt, constantTimeTagCompare } from "./decrypt";
export { validateRecord } from "./validate";
export { generateMasterKey } from "./keygen";
