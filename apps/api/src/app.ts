import Fastify, { FastifyInstance, FastifyError } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { CryptoError } from "@repo/crypto";
import { healthRoutes } from "./routes/health";
import { txRoutes } from "./routes/tx";

/**
 * Builds and configures the Fastify application.
 *
 * This is separated from the server entry point so the same app
 * can be used for both local development (standalone server) and
 * Vercel serverless deployment.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  });

  // ── CORS ──────────────────────────────────────────────────────────────
  // Allow requests from the Next.js frontend (local and deployed)
  await app.register(cors, {
    origin: true, // Reflect the request origin (allows any origin in dev)
    methods: ["GET", "POST", "OPTIONS"],
  });

  // ── Sensible defaults ─────────────────────────────────────────────────
  // Adds httpErrors, to(), assert() helpers to Fastify
  await app.register(sensible);

  // ── Allow empty POST bodies ──────────────────────────────────────────
  // Some routes (like /tx/:id/decrypt) use POST but don't require a body.
  // By default Fastify rejects empty JSON bodies and unknown content types,
  // so we override the JSON parser to handle empty payloads gracefully.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    function (_request, _payload, done) {
      done(null, {});
    }
  );
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    function (_request, body, done) {
      const str = (body as string).trim();
      if (!str) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(str));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // ── Routes ────────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(txRoutes);

  // ── Global error handler ──────────────────────────────────────────────
  // Catches unhandled errors and returns consistent JSON responses.
  // Never leaks stack traces — only returns the error message.
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    // Fastify validation errors (from JSON schema)
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: `Validation error: ${error.message}`,
      });
    }

    // Crypto package errors
    if (error instanceof CryptoError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
      });
    }

    // Unexpected errors — log but don't leak details
    app.log.error(error);
    return reply.status(500).send({
      success: false,
      error: "Internal server error",
    });
  });

  return app;
}
