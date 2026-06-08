#!/usr/bin/env bun
/**
 * Local auth server for development and the end-to-end check. Mounts the SAME
 * BetterAuth instance the Vercel functions use, so a green check here means the
 * real code paths work — only the transport (Bun vs Vercel Node) differs.
 *
 *   /api/auth/*  -> BetterAuth (sign-up, sign-in, session, api-key/*)
 *   /api/v1/me   -> shared getMe()
 *
 * Env: DATABASE_URL, BETTER_AUTH_SECRET, optional PORT (default 3000).
 * Run:  bun scripts/dev-server.ts
 */
import { auth } from "../lib/auth";
import { getMe } from "../lib/me";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/auth")) {
      return auth.handler(req);
    }
    if (pathname === "/api/v1/me") {
      const { status, body } = await getMe(req.headers);
      return Response.json(body, { status });
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`auth dev server listening on http://localhost:${server.port}`);
