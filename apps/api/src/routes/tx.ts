import { FastifyInstance } from "fastify";
import {
  encrypt,
  decrypt,
  validateRecord,
  CryptoError,
  TamperedDataError,
  ValidationError,
} from "../crypto";
import { saveRecord, getRecord } from "../store";

/**
 * Transaction routes — the core API for the secure transaction service.
 *
 * POST /tx/encrypt   → Encrypt a payload and store the record
 * GET  /tx/:id       → Retrieve an encrypted record (no decryption)
 * POST /tx/:id/decrypt → Decrypt a stored record
 */
export async function txRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /tx/encrypt
   *
   * Accepts a partyId and JSON payload, encrypts using envelope encryption,
   * stores the record in memory, and returns the encrypted record.
   *
   * Request body is validated using Fastify's built-in JSON schema validation.
   */
  app.post(
    "/tx/encrypt",
    {
      schema: {
        body: {
          type: "object",
          required: ["partyId", "payload"],
          properties: {
            partyId: {
              type: "string",
              minLength: 1,
              description: "Identifier for the party owning this transaction",
            },
            payload: {
              type: "object",
              description: "The JSON payload to encrypt (must be a non-null object)",
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { partyId, payload } = request.body as {
        partyId: string;
        payload: Record<string, unknown>;
      };

      const masterKey = process.env.MASTER_KEY_HEX;
      if (!masterKey) {
        return reply.status(500).send({
          success: false,
          error: "Server misconfiguration: MASTER_KEY not set",
        });
      }

      try {
        // Encrypt the payload using envelope encryption from @repo/crypto
        const record = encrypt(masterKey, partyId, payload);

        // Validate the record structure before storing (defense in depth)
        validateRecord(record);

        // Store in PostgreSQL (Supabase)
        await saveRecord(record);

        return reply.status(201).send({
          success: true,
          record,
        });
      } catch (error: unknown) {
        if (error instanceof CryptoError) {
          return reply.status(400).send({
            success: false,
            error: error.message,
          });
        }
        throw error;
      }
    }
  );

  /**
   * GET /tx/:id
   *
   * Retrieves an encrypted record by its ID.
   * Returns the raw encrypted record — no decryption is performed.
   */
  app.get(
    "/tx/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const record = await getRecord(id);

      if (!record) {
        return reply.status(404).send({
          success: false,
          error: "Record not found",
        });
      }

      return reply.status(200).send({
        success: true,
        record,
      });
    }
  );

  /**
   * POST /tx/:id/decrypt
   *
   * Decrypts a stored record and returns the original payload.
   * If the data has been tampered with, returns a 400 error.
   */
  app.post(
    "/tx/:id/decrypt",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const record = await getRecord(id);

      if (!record) {
        return reply.status(404).send({
          success: false,
          error: "Record not found",
        });
      }

      const masterKey = process.env.MASTER_KEY_HEX;
      if (!masterKey) {
        return reply.status(500).send({
          success: false,
          error: "Server misconfiguration: MASTER_KEY not set",
        });
      }

      try {
        const payload = decrypt(masterKey, record);

        return reply.status(200).send({
          success: true,
          partyId: record.partyId,
          payload,
          decryptedAt: new Date().toISOString(),
        });
      } catch (error: unknown) {
        if (error instanceof TamperedDataError) {
          return reply.status(400).send({
            success: false,
            error: `Tampered data detected: ${error.message}`,
          });
        }
        if (error instanceof ValidationError) {
          return reply.status(400).send({
            success: false,
            error: `Validation failed: ${error.message}`,
          });
        }
        if (error instanceof CryptoError) {
          return reply.status(400).send({
            success: false,
            error: `Decryption failed: ${error.message}`,
          });
        }
        throw error;
      }
    }
  );
}
