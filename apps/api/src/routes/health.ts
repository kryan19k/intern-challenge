import { FastifyInstance } from "fastify";
import { getRecordCount } from "../store";

/**
 * Health check endpoint.
 * Returns server status, whether the master key is loaded, and record count.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    const masterKey = process.env.MASTER_KEY_HEX;
    const mkLoaded = typeof masterKey === "string" && masterKey.length === 64;

    return reply.status(200).send({
      status: "ok",
      timestamp: new Date().toISOString(),
      mk_loaded: mkLoaded,
      records: await getRecordCount(),
    });
  });
}
