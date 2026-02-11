# Security Considerations

This document outlines the threat model, security measures, and production recommendations for the Secure Transactions Mini-App.

## Threat Model

### What Attacks Does This Prevent?

| Attack | Prevention | Implementation |
|--------|------------|----------------|
| **Data theft** | AES-256 encryption | Payload encrypted with unique DEK per record |
| **Data tampering** | GCM authentication tags | 16-byte auth tags on both payload and DEK wrap |
| **Key compromise (single record)** | Envelope encryption | Each record has its own DEK; compromising one doesn't affect others |
| **Timing attacks** | Constant-time comparison | `crypto.timingSafeEqual()` for tag verification |
| **Memory dump attacks** | DEK zeroing | `buffer.fill(0)` after use |
| **Nonce reuse attacks** | Random nonces | Fresh 12-byte random nonce per operation |
| **Replay attacks** | Unique record IDs + timestamps | UUIDv4 IDs and ISO 8601 timestamps |

### What Attacks Are NOT Prevented (Out of Scope)?

| Attack | Why Not Prevented | Production Mitigation |
|--------|-------------------|----------------------|
| **Unauthorized access** | No authentication | Add JWT/API key authentication |
| **DDoS** | No rate limiting | Add rate limiting, WAF |
| **Man-in-the-middle** | Depends on HTTPS config | Enforce HTTPS, HSTS headers |
| **Master key theft** | MK in env variable | Use HSM/KMS |
| **Insider threats** | No audit logging | Add comprehensive audit trail |

## Key Management Strategy

### Current Implementation

```
Master Key (MK)
├── Stored in: Environment variable (MASTER_KEY_HEX)
├── Format: 64-character hex string (32 bytes)
├── Generation: crypto.randomBytes(32)
├── Validation: Checked on server startup (fail-fast)
└── Version: mk_version field in each record
```

### Production Recommendations

1. **Use a Hardware Security Module (HSM) or Key Management Service (KMS)**
   - AWS KMS, Google Cloud KMS, or Azure Key Vault
   - The master key never leaves the HSM — wrapping/unwrapping happens inside it
   - Automatic key rotation with version tracking

2. **Key Rotation Strategy**
   - Generate new MK version periodically (e.g., every 90 days)
   - New encryptions use the latest version
   - Old records retain their `mk_version` for decryption
   - Background job to re-wrap old DEKs with the new MK

3. **Access Control**
   - Principle of least privilege — only the API service should access the MK
   - Separate read and write permissions
   - Audit all key access

## Why Hex Encoding for Storage?

Binary data (nonces, tags, ciphertext, wrapped DEKs) is stored as hex strings because:

1. **JSON compatibility** — JSON doesn't support binary data natively
2. **Readability** — Hex is human-readable for debugging
3. **Consistency** — All binary fields use the same encoding
4. **No padding issues** — Unlike Base64, hex has no padding characters

**Trade-off:** Hex encoding doubles the storage size compared to raw binary. The current Supabase PostgreSQL store uses `TEXT` columns for simplicity. In a production optimization pass, you could use `BYTEA` columns for more efficient binary storage.

## Tag Verification Importance

The 16-byte GCM authentication tag is **critical** for security:

```
Without tag verification:
  Attacker modifies ciphertext → Decryption produces garbage → No error
  (Attacker can manipulate plaintext via bit-flipping)

With tag verification (GCM):
  Attacker modifies ciphertext → Tag mismatch → Decryption fails with error
  (Tampering is detected and rejected)
```

### Why Constant-Time Comparison?

```
Regular comparison (===):
  "aabbccdd" vs "aabbccee"
  Compares: a=a ✓, a=a ✓, b=b ✓, b=b ✓, c=c ✓, c=c ✓, d=e ✗ → STOP
  Time: 7 comparisons
  
  "aabbccdd" vs "xxbbccdd"  
  Compares: a=x ✗ → STOP
  Time: 1 comparison
  
  ⚠️ Attacker can measure response time to learn which bytes match!

Constant-time comparison (timingSafeEqual):
  Always compares ALL bytes regardless of where the mismatch is.
  Time: Always the same.
  
  ✅ No timing information leaked.
```

## Validation as Defense in Depth

The `validateRecord()` function checks record structure BEFORE attempting decryption:

```
Why validate first?
├── Clear error messages instead of cryptic OpenSSL errors
├── Catches malformed data early (saves CPU on failed decryption)
├── Prevents potential edge cases in the crypto library
└── Documents expected data format in code
```

Validation rules:
- Nonces: exactly 12 bytes (24 hex chars)
- Tags: exactly 16 bytes (32 hex chars)
- All hex fields: valid hex characters only
- Ciphertext: non-empty
- Algorithm: must be "AES-256-GCM"
- mk_version: positive number

## Database Security (Supabase PostgreSQL)

### Current Implementation

```
Supabase PostgreSQL
├── Connection: @supabase/supabase-js (HTTP-based, no raw TCP)
├── Auth: Service role key (full access, server-side only)
├── Table: transactions (stores encrypted records as hex TEXT)
├── RLS: Disabled (service role bypasses RLS)
└── Encryption at rest: Supabase default (AES-256 on disk)
```

### Security Considerations

- **Service role key** is used server-side only — never exposed to the browser
- **No Row Level Security (RLS)** — acceptable because the API is the only client, and all data is already encrypted at the application layer
- **Double encryption** — data is encrypted by our envelope encryption before it reaches the database, and Supabase encrypts at rest on disk
- **Network security** — Supabase connections use HTTPS/TLS

### Production Recommendations

1. **Enable RLS** with policies scoped to authenticated service roles
2. **Rotate the service role key** periodically
3. **Use connection pooling** (Supabase PgBouncer) for high-traffic deployments
4. **Enable Supabase audit logging** to track all database access
5. **Restrict network access** — allow connections only from known API server IPs

## Production Security Checklist

- [ ] Move master key to HSM/KMS
- [ ] Add JWT/API key authentication
- [ ] Enforce HTTPS with HSTS headers
- [ ] Add rate limiting (per-IP and per-API-key)
- [ ] Add comprehensive audit logging
- [ ] Set up monitoring and alerting for decryption failures
- [ ] Implement key rotation with version tracking
- [ ] Add input sanitization beyond JSON schema validation
- [ ] Set up CSP (Content Security Policy) headers
- [ ] Regular security audits and penetration testing
- [ ] Implement backup and disaster recovery for encrypted records
- [ ] Add request signing for API-to-API communication
