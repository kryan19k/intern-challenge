# Architecture Decisions

This document explains the key architectural decisions made in this project and the reasoning behind them.

## Why Envelope Encryption Over Direct Encryption?

**Direct encryption** would encrypt every payload directly with the master key. This is simpler but has critical drawbacks:

| Concern | Direct Encryption | Envelope Encryption |
|---------|-------------------|---------------------|
| Key compromise | All records exposed | Only one record exposed |
| Key rotation | Must re-encrypt everything | Only re-wrap DEKs |
| Master key exposure | MK touches all plaintext | MK never touches plaintext |
| Industry standard | Not recommended | Used by AWS KMS, Google KMS, Azure Key Vault |

With envelope encryption, the master key only ever encrypts small 32-byte DEKs, not arbitrary user data. This limits the amount of data encrypted under any single key, which is a cryptographic best practice.

## Why AES-256-GCM (Authenticated Encryption)?

We chose AES-256-GCM over alternatives like:

- **AES-256-CBC** — Provides confidentiality but NOT integrity. An attacker can modify ciphertext without detection (bit-flipping attacks). Would require a separate HMAC step.
- **AES-256-CBC + HMAC** — Provides both, but requires careful implementation (encrypt-then-MAC ordering). More code, more room for error.
- **ChaCha20-Poly1305** — Excellent alternative, but AES-256-GCM has hardware acceleration (AES-NI) on most modern CPUs and is the industry standard.

AES-256-GCM gives us **authenticated encryption** in a single pass:
- **Confidentiality** via AES-256 in counter mode
- **Integrity** via the 128-bit GCM authentication tag
- **Performance** via hardware AES-NI acceleration

## Storage Trade-offs

### Current: In-Memory Map

```
Pros:
  ✅ Zero setup — no database to configure
  ✅ Fast — O(1) lookups
  ✅ Simple — easy to understand and debug

Cons:
  ❌ Data lost on server restart
  ❌ Not suitable for production
  ❌ No persistence, no replication
```

### Production Alternative: PostgreSQL

```
Pros:
  ✅ Persistent storage
  ✅ ACID transactions
  ✅ Can add encryption at rest
  ✅ Supports indexing for fast lookups

Cons:
  ❌ Requires database setup and management
  ❌ Additional latency for network calls
```

The in-memory approach is explicitly acceptable for this challenge and keeps the focus on the encryption implementation.

## API Design Decisions

### REST Conventions

| Route | Method | Purpose | Status Codes |
|-------|--------|---------|--------------|
| `/tx/encrypt` | POST | Create encrypted record | 201, 400, 500 |
| `/tx/:id` | GET | Read encrypted record | 200, 404 |
| `/tx/:id/decrypt` | POST | Decrypt a record | 200, 400, 404, 500 |
| `/health` | GET | Server health check | 200 |

**Why POST for decrypt?** Decryption is a sensitive operation that should be auditable. Using POST (instead of GET) ensures:
- The operation is not cached by browsers or CDNs
- It can be rate-limited separately from reads
- It signals that this is an action, not just a retrieval

### JSON Schema Validation

Fastify's built-in JSON schema validation is used for request bodies. This provides:
- Automatic 400 responses for malformed requests
- Type coercion where appropriate
- Clear error messages without custom validation code

### Global Error Handler

All crypto errors are caught at the Fastify level and translated to appropriate HTTP status codes. Stack traces are never leaked to clients.

## Monorepo Structure

### Why TurboRepo?

- **Dependency graph** — TurboRepo understands that `apps/api` and `apps/web` depend on `packages/crypto`, and builds them in the correct order
- **Caching** — Repeated builds are instant if inputs haven't changed
- **Parallel execution** — Independent tasks run simultaneously
- **Single command** — `pnpm dev` starts everything

### Why Shared Crypto Package?

Extracting encryption logic into `packages/crypto` provides:
- **Reusability** — Both API and any future services can use the same encryption
- **Testability** — Crypto logic is tested independently of HTTP concerns
- **Separation of concerns** — API handles HTTP, crypto handles encryption
- **Type safety** — Shared `TxSecureRecord` type ensures consistency

## Future Scalability Considerations

### Horizontal Scaling
The current in-memory store doesn't support multiple server instances. For horizontal scaling:
- Move to a shared database (PostgreSQL, Redis)
- Use sticky sessions or shared state

### Key Rotation
The `mk_version` field enables zero-downtime key rotation:
1. Deploy new master key as version N+1
2. New encryptions use version N+1
3. Decryptions check `mk_version` and use the corresponding key
4. Eventually re-wrap old DEKs with the new key

### Audit Trail
In production, every encrypt/decrypt operation should be logged with:
- Timestamp
- Party ID
- Record ID
- Operation type
- IP address
- Success/failure status

This enables security monitoring and compliance reporting.
