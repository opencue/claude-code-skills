import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";

import { parseDashArgs, dashUrl, dashFetch, ROUTES } from "./dash";

describe("parseDashArgs", () => {
  const savedPort = process.env.CUE_DASH_PORT;
  const savedHost = process.env.CUE_DASH_HOST;
  beforeAll(() => { delete process.env.CUE_DASH_PORT; delete process.env.CUE_DASH_HOST; });
  afterAll(() => {
    if (savedPort === undefined) delete process.env.CUE_DASH_PORT; else process.env.CUE_DASH_PORT = savedPort;
    if (savedHost === undefined) delete process.env.CUE_DASH_HOST; else process.env.CUE_DASH_HOST = savedHost;
  });

  test("defaults are 127.0.0.1:7891", () => {
    const a = parseDashArgs(["status"]);
    expect(a).toMatchObject({ sub: "status", host: "127.0.0.1", port: 7891, json: false });
  });

  test("first non-flag is the subcommand; the rest are positionals", () => {
    const a = parseDashArgs(["profile", "browser", "extra"]);
    expect(a.sub).toBe("profile");
    expect(a.rest).toEqual(["browser", "extra"]);
  });

  test("flags parse and don't leak into positionals", () => {
    const a = parseDashArgs(["kill", "123", "--port", "9000", "--host", "0.0.0.0", "--json", "--sigkill"]);
    expect(a).toMatchObject({ sub: "kill", rest: ["123"], port: 9000, host: "0.0.0.0", json: true, sigkill: true });
  });

  test("--as captures the merge target name", () => {
    expect(parseDashArgs(["merge-save", "a", "b", "--as", "ab"]).as).toBe("ab");
  });

  test("env overrides the default host/port", () => {
    process.env.CUE_DASH_PORT = "5555";
    process.env.CUE_DASH_HOST = "example.test";
    const a = parseDashArgs(["status"]);
    expect(a.port).toBe(5555);
    expect(a.host).toBe("example.test");
    delete process.env.CUE_DASH_PORT; delete process.env.CUE_DASH_HOST;
  });

  test("invalid port is ignored", () => {
    expect(parseDashArgs(["status", "--port", "garbage"]).port).toBe(7891);
    expect(parseDashArgs(["status", "--port", "99999"]).port).toBe(7891);
  });
});

describe("dashUrl", () => {
  test("builds the /api/v1 path with no query", () => {
    expect(dashUrl("127.0.0.1", 7891, "/status")).toBe("http://127.0.0.1:7891/api/v1/status");
  });
  test("appends a query string", () => {
    expect(dashUrl("h", 1, "/profile-detail", { profile: "a b" })).toBe("http://h:1/api/v1/profile-detail?profile=a+b");
  });
});

describe("ROUTES.build", () => {
  const base = parseDashArgs([]);
  test("profile → GET profile-detail with the name query", () => {
    const r = ROUTES.profile!.build({ ...base, rest: ["browser"] });
    expect(r).toEqual({ path: "/profile-detail", query: { profile: "browser" } });
  });
  test("add-mcp → POST mcps/add with {profile,id}", () => {
    const r = ROUTES["add-mcp"]!.build({ ...base, rest: ["frontend", "playwright"] });
    expect(r).toEqual({ path: "/mcps/add", method: "POST", body: { profile: "frontend", id: "playwright" } });
  });
  test("kill → POST sessions/kill, SIGKILL only when --sigkill", () => {
    expect(ROUTES.kill!.build({ ...base, rest: ["42"] }).body).toEqual({ pid: 42, signal: "SIGTERM" });
    expect(ROUTES.kill!.build({ ...base, rest: ["42"], sigkill: true }).body).toEqual({ pid: 42, signal: "SIGKILL" });
  });
  test("merge-save carries names + --as target", () => {
    expect(ROUTES["merge-save"]!.build({ ...base, rest: ["a", "b"], as: "ab" }).body).toEqual({ names: ["a", "b"], name: "ab" });
  });
  test("mutating routes are flagged", () => {
    expect(ROUTES["add-mcp"]!.mutating).toBe(true);
    expect(ROUTES.status!.mutating).toBeUndefined();
  });
});

describe("dashFetch (stub server)", () => {
  let server: Server;
  let port = 0;
  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = req.url ?? "";
      res.setHeader("content-type", "application/json");
      if (url.startsWith("/api/v1/ok")) { res.end(JSON.stringify({ ok: true, data: { hello: "world" } })); return; }
      if (url.startsWith("/api/v1/bad")) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: "missing-profile" })); return; }
      res.end("not json");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => { server.close(); });

  test("unwraps the {ok,data} envelope", async () => {
    expect(await dashFetch({ host: "127.0.0.1", port }, "/ok")).toEqual({ hello: "world" });
  });
  test("throws the server's error message on {ok:false}", async () => {
    await expect(dashFetch({ host: "127.0.0.1", port }, "/bad")).rejects.toThrow("missing-profile");
  });
  test("throws a clear message on non-JSON", async () => {
    await expect(dashFetch({ host: "127.0.0.1", port }, "/other")).rejects.toThrow(/non-JSON/);
  });
  test("refused connection points at `cue dashboard`", async () => {
    await expect(dashFetch({ host: "127.0.0.1", port: 1 }, "/ok")).rejects.toThrow(/cue dashboard/);
  });
});
