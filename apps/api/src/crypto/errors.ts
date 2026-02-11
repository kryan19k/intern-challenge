/**
 * Custom error classes for the crypto package.
 *
 * Using a dedicated error hierarchy lets consumers (e.g. the API layer)
 * distinguish between different failure modes and return appropriate
 * HTTP status codes and messages.
 */

/** Base class for all crypto-related errors */
export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

/** Thrown when the encryption process fails (e.g. invalid master key format) */
export class EncryptionError extends CryptoError {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

/** Thrown when decryption fails for non-tampering reasons (e.g. wrong key) */
export class DecryptionError extends CryptoError {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}

/**
 * Thrown when record validation fails.
 * Examples: wrong nonce length, invalid hex characters, empty ciphertext.
 */
export class ValidationError extends CryptoError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Thrown when decryption detects data tampering.
 * This happens when the GCM authentication tag does not match,
 * indicating the ciphertext or associated data was modified.
 */
export class TamperedDataError extends CryptoError {
  constructor(message: string = "Data integrity check failed — possible tampering detected") {
    super(message);
    this.name = "TamperedDataError";
  }
}
