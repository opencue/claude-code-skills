/**
 * Vercel catch-all for BetterAuth. Every `/api/auth/*` request (sign-up,
 * sign-in, sign-out, session, and the api-key endpoints) is handled here.
 *
 * Body parsing is disabled so BetterAuth reads the raw request itself.
 */
import { toNodeHandler } from "better-auth/node";
import { auth } from "../../lib/auth";

export const config = { api: { bodyParser: false } };

export default toNodeHandler(auth);
