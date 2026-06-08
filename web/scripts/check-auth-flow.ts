#!/usr/bin/env bun
/**
 * THE CHECK for the auth goal. Walks the full flow against a running server
 * (dev-server.ts or `vercel dev`) and exits non-zero on the first failure:
 *
 *   1. POST /api/auth/sign-up/email      -> 200, session cookie set
 *   2. POST /api/auth/sign-in/email      -> 200, session cookie set
 *   3. POST /api/auth/api-key/create     -> 200, returns key (shown once)
 *   4. GET  /api/v1/me  (Bearer <key>)   -> 200, email matches the new user
 *
 * Env: BASE (default http://localhost:3000).
 * Run:  bun scripts/check-auth-flow.ts
 */
const BASE = process.env.BASE ?? "http://localhost:3000";

// Unique email per run so reruns don't collide on the users table.
const email = `check+${Date.now()}@cuecards.cc`;
const password = "Test-passw0rd!";
const name = "Check User";

let cookie = "";

// BetterAuth enforces a trusted Origin on authenticated, state-changing
// requests (CSRF). Browsers send this automatically; the check models a browser.
const origin = BASE;

function captureCookie(res: Response): void {
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0]; // first pair is the session cookie
}

function fail(step: string, detail: string): never {
  console.error(`FAIL [${step}] ${detail}`);
  process.exit(1);
}

async function main(): Promise<void> {
  // 1. Register
  let res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, password, name }),
  });
  if (res.status !== 200) fail("sign-up", `status ${res.status}: ${await res.text()}`);
  captureCookie(res);
  console.log(`ok   sign-up        -> 200 (${email})`);

  // 2. Login
  res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) fail("sign-in", `status ${res.status}: ${await res.text()}`);
  captureCookie(res);
  if (!cookie) fail("sign-in", "no session cookie set");
  console.log("ok   sign-in        -> 200 (session cookie set)");

  // 3. Create an API token (authenticated by the session cookie)
  res = await fetch(`${BASE}/api/auth/api-key/create`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin },
    body: JSON.stringify({ name: "claude" }),
  });
  if (res.status !== 200) fail("api-key/create", `status ${res.status}: ${await res.text()}`);
  const created = (await res.json()) as { key?: string };
  if (!created.key) fail("api-key/create", `no key in response: ${JSON.stringify(created)}`);
  const token = created.key;
  console.log(`ok   api-key/create  -> 200 (token: ${token.slice(0, 6)}…, shown once)`);

  // 4. Use the token as a Bearer credential — no cookie this time
  res = await fetch(`${BASE}/api/v1/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) fail("me", `status ${res.status}: ${await res.text()}`);
  const me = (await res.json()) as { ok: boolean; data?: { email?: string } };
  if (!me.ok || me.data?.email !== email) {
    fail("me", `unexpected body: ${JSON.stringify(me)}`);
  }
  console.log(`ok   me (Bearer)     -> 200 (authenticated as ${me.data?.email})`);

  // 5. The apiKey plugin defaults to 10 requests/24h per key, which would
  //    silently cripple a programmatic token. Fire >10 calls to prove the
  //    configured (generous) rate limit is in effect, not the default.
  const BURST = 15;
  for (let i = 0; i < BURST; i++) {
    res = await fetch(`${BASE}/api/v1/me`, { headers: { authorization: `Bearer ${token}` } });
    if (res.status !== 200) {
      fail("rate-limit", `Bearer call ${i + 1}/${BURST} returned ${res.status} (default 10/day cap not lifted?): ${await res.text()}`);
    }
  }
  console.log(`ok   ${BURST}× Bearer     -> all 200 (per-key rate limit is generous, not 10/day)`);

  console.log("\nPASS  full auth flow: register -> login -> token -> Bearer /me (+burst)");
}

main().catch((err) => fail("uncaught", String(err)));
