/**
 * Envelope Encryption Library (local copy for Vercel serverless compatibility)
 *
 * This is a local copy of @repo/crypto to avoid workspace resolution issues
 * in Vercel's serverless environment. The source of truth remains packages/crypto.
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
