/**
 * TxSecureRecord — The encrypted transaction record.
 *
 * This is the data model for a single encrypted transaction. Every field
 * that holds binary data is stored as a hex-encoded string for safe
 * serialization and transport over JSON.
 *
 * Envelope Encryption Layout:
 * ┌─────────────────────────────────────────────────────┐
 * │  payload_ct   = AES-256-GCM(DEK, plaintext)        │
 * │  payload_nonce = random 12-byte IV for payload      │
 * │  payload_tag   = 16-byte GCM auth tag for payload   │
 * │                                                     │
 * │  dek_wrapped   = AES-256-GCM(MasterKey, DEK)       │
 * │  dek_wrap_nonce = random 12-byte IV for DEK wrap    │
 * │  dek_wrap_tag   = 16-byte GCM auth tag for DEK wrap │
 * └─────────────────────────────────────────────────────┘
 */
export type TxSecureRecord = {
  /** UUIDv4 identifier for this transaction */
  id: string;

  /** Identifier for the party that owns this transaction */
  partyId: string;

  /** ISO 8601 timestamp of when the record was created */
  createdAt: string;

  /** 12-byte nonce (IV) used to encrypt the payload, stored as 24-char hex */
  payload_nonce: string;

  /** AES-256-GCM ciphertext of the JSON payload, stored as hex */
  payload_ct: string;

  /** 16-byte GCM authentication tag for the payload encryption, stored as 32-char hex */
  payload_tag: string;

  /** 12-byte nonce (IV) used to wrap the DEK, stored as 24-char hex */
  dek_wrap_nonce: string;

  /** The Data Encryption Key (DEK) encrypted with the Master Key, stored as hex */
  dek_wrapped: string;

  /** 16-byte GCM authentication tag for the DEK wrapping, stored as 32-char hex */
  dek_wrap_tag: string;

  /** Algorithm identifier — always AES-256-GCM */
  alg: "AES-256-GCM";

  /** Master Key version used for this record (supports future key rotation) */
  mk_version: number;
};
