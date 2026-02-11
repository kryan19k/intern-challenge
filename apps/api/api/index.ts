import { buildApp } from "../src/app";
import { initStore } from "../src/store";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Vercel Serverless Function entry point.
 *
 * This wraps the Fastify app so it can handle requests in Vercel's
 * serverless environment. Each request creates a new Fastify instance,
 * injects the request, and returns the response.
 *
 * Environment variables (MASTER_KEY) are configured in the Vercel dashboard.
 */

let appPromise: ReturnType<typeof buildApp> | null = null;

async function getApp() {
  if (!appPromise) {
    await initStore();
    appPromise = buildApp();
  }
  return appPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();

  await app.ready();

  // Convert Vercel request to Fastify-compatible format
  const response = await app.inject({
    method: req.method as "GET" | "POST" | "PUT" | "DELETE",
    url: req.url || "/",
    headers: req.headers as Record<string, string>,
    payload: req.body ? JSON.stringify(req.body) : undefined,
  });

  // Forward Fastify response to Vercel
  res.status(response.statusCode);

  // Set response headers
  const headers = response.headers;
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      res.setHeader(key, value as string);
    }
  }

  res.send(response.body);
}
