// The network side of a scan, with fetch stubbed: what a board's answer (or failure) does to the result, and above
// all to `listed`, which closes the offers a complete board no longer lists. A failed or empty answer must never
// count as "the board is now empty".
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type Profile } from "../types";
import { clearScanCache, getText, retryAfterMs, scanCache } from "./http";
import { scanSource } from "./index";

type Route = (url: string) => Response | Promise<Response>;
let route: Route = () => new Response("not stubbed", { status: 599 });
const asked: string[] = [];
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input);
  asked.push(url);
  return route(url);
}) as typeof fetch;
beforeEach(() => {
  asked.length = 0;
  clearScanCache();
});

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const profile: Profile = { id: 1, name: "", email: "", headline: "", cv_md: "", skills: [], target_roles: [], target_locations: [], target_types: [], languages: [], settings: DEFAULT_SETTINGS };
const gh = (ids: number[]) => ({
  jobs: ids.map((id) => ({ id, title: `Stage ${id}`, absolute_url: `https://job-boards.greenhouse.io/acme/jobs/${id}`, location: { name: "Tunis" }, updated_at: "2026-10-20T10:00:00Z", content: "&lt;p&gt;Stage PFE&lt;/p&gt;" })),
});

test("a full Greenhouse answer lists every offer, so vanished ones can be closed", async () => {
  route = () => json(gh([1, 2, 3]));
  const r = await scanSource({ kind: "greenhouse", handle: "acme" }, profile, { keepAll: true });
  assert.equal(r.error, undefined);
  assert.equal(r.total, 3);
  assert.deepEqual(r.listed?.urls, [1, 2, 3].map((id) => `https://job-boards.greenhouse.io/acme/jobs/${id}`));
  assert.match(asked[0], /boards-api\.greenhouse\.io\/v1\/boards\/acme\/jobs\?content=true/);
});

test("an HTTP error, a network failure or an empty board never counts as a complete listing", async () => {
  for (const answer of [() => json({ error: "boom" }, 500), () => Promise.reject(new TypeError("fetch failed")), () => json({ jobs: [] })] as Route[]) {
    route = answer;
    const r = await scanSource({ kind: "greenhouse", handle: "acme" }, profile, { keepAll: true });
    assert.equal(r.listed, undefined);
    assert.equal(r.jobs.length, 0);
  }
  clearScanCache(); // the empty answer above is a good one, kept for ten minutes
  route = () => json({ error: "boom" }, 500);
  assert.ok((await scanSource({ kind: "greenhouse", handle: "acme" }, profile, { keepAll: true })).error, "the failure is reported");
});

test("Lever: a board missing on the global host is read from the EU host", async () => {
  route = (url) =>
    url.includes("api.eu.lever.co")
      ? json([{ id: "a1", text: "Stage développeur", hostedUrl: "https://jobs.eu.lever.co/acme/a1", categories: { location: "Paris" }, createdAt: 1760000000000, descriptionPlain: "Stage de 6 mois" }])
      : json({ ok: false, error: "Document not found" }, 404);
  const r = await scanSource({ kind: "lever", handle: "acme" }, profile, { keepAll: true });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.jobs.map((j) => j.url), ["https://jobs.eu.lever.co/acme/a1"]);
  assert.ok(r.listed);
  assert.deepEqual(asked.map((u) => new URL(u).host), ["api.lever.co", "api.eu.lever.co"]);
});

test("offers already known are not returned again but stay listed, so they are not closed", async () => {
  route = () => json(gh([1]));
  const r = await scanSource({ kind: "greenhouse", handle: "acme" }, profile, { keepAll: true, isKnown: () => true });
  assert.equal(r.jobs.length, 0, "known offers are not returned again");
  assert.ok(r.listed, "but still listed, so they are not closed");
});

test("a redirect to a private address is refused, and non-UTF-8 pages decode by their charset", async () => {
  const { getText, isPrivateHost, isLoopbackHost, isSameOrigin } = await import("./http");
  route = (url) => (url.includes("hop") ? new Response(null, { status: 302, headers: { location: "http://127.0.0.1:3000/" } }) : new Response("x"));
  const r = await getText("https://example.com/hop");
  assert.match(r.error ?? "", /Private or local/);
  assert.ok(!asked.some((u) => u.includes("127.0.0.1")), "the private hop is never fetched");

  route = () => new Response(new Uint8Array([0x45, 0x6d, 0x70, 0x72, 0xe9, 0x67, 0x6f]), { headers: { "content-type": "text/xml; charset=ISO-8859-1" } });
  assert.equal((await getText("https://example.com/feed")).text, "Emprégo");

  for (const h of ["127.0.0.1", "10.1.2.3", "100.64.0.1", "0.0.0.1", "169.254.1.1", "172.16.0.1", "192.168.0.1", "::1", "[::1]", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "box.local", "intranet"])
    assert.ok(isPrivateHost(h), h);
  for (const h of ["fdj.fr", "fcbarcelona.com", "8.8.8.8", "100.128.0.1", "2001:db8::1", "example.com"]) assert.ok(!isPrivateHost(h), h);

  assert.ok(isLoopbackHost("localhost:3000") && isLoopbackHost("127.0.0.1:3000") && isLoopbackHost("[::1]:3000"));
  assert.ok(!isLoopbackHost("192.168.1.20:3000") && !isLoopbackHost("evil.example:3000") && !isLoopbackHost(null));
  const req = (h: Record<string, string>) => new Request("http://localhost:3000/api/x", { method: "POST", headers: h });
  assert.ok(isSameOrigin(req({ host: "localhost:3000", origin: "http://localhost:3000" })));
  assert.ok(!isSameOrigin(req({ host: "evil.example:3000", origin: "http://evil.example:3000" })), "DNS rebinding: Host is not loopback");
  assert.ok(!isSameOrigin(req({ host: "localhost:3000", origin: "https://evil.example" })), "CSRF: foreign Origin");
  assert.ok(!isSameOrigin(req({ host: "localhost:3000", "sec-fetch-site": "cross-site" })));
});

test("Stop reaches every fetch and pause inside a scan", async () => {
  const { getText, scanSignal, sleep } = await import("./http");
  const ctl = new AbortController();
  route = () => new Response("ok");
  const t0 = Date.now();
  const r = await scanSignal.run(ctl.signal, async () => {
    setTimeout(() => ctl.abort(), 50);
    await sleep(5_000); // a polite 5 s pause ends as soon as Stop is pressed
    return getText("https://example.com/next");
  });
  assert.ok(Date.now() - t0 < 2_000, "the pause did not wait 5 s");
  assert.match(r.error ?? "", /^Stopped/);
});

test("a board read a moment ago is not read again, and an old answer is revalidated with its ETag", async () => {
  route = () => new Response(JSON.stringify(gh([1, 2])), { headers: { "content-type": "application/json", etag: '"v1"' } });
  const first = await scanSource({ kind: "greenhouse", handle: "acme" }, profile, { keepAll: true });
  assert.equal(first.cached, false);
  route = () => json({ error: "the board must not be asked again" }, 500);
  const again = await scanSource({ kind: "greenhouse", handle: "acme" }, profile, { keepAll: true });
  assert.equal(asked.length, 1, "one request for two scans");
  assert.equal(again.cached, true);
  assert.deepEqual(again.jobs.map((j) => j.url), first.jobs.map((j) => j.url));
  assert.ok(again.listed, "a cached complete listing is still complete");

  // Past the fresh window: one conditional request, and a 304 keeps the stored answer.
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60_000;
  try {
    let sent: Headers | undefined;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      sent = new Headers(init?.headers);
      asked.push(String(input));
      return new Response(null, { status: 304 });
    }) as typeof fetch;
    const later = await scanSource({ kind: "greenhouse", handle: "acme" }, profile, { keepAll: true });
    assert.equal(sent?.get("if-none-match"), '"v1"');
    assert.equal(later.jobs.length, 2);
    assert.equal(later.cached, true);
  } finally {
    Date.now = realNow;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      asked.push(url);
      return route(url);
    }) as typeof fetch;
  }
});

test("outside a scan nothing is cached, and errors are never kept", async () => {
  route = () => new Response("one");
  assert.equal((await getText("https://example.com/page")).text, "one");
  route = () => new Response("two");
  assert.equal((await getText("https://example.com/page")).text, "two", "a liveness check or an import always reads the page");

  const scope = { hits: 0, misses: 0 };
  route = () => json({ error: "boom" }, 500);
  assert.ok((await scanCache.run(scope, () => getText("https://example.com/api"))).error);
  route = () => new Response("fine");
  assert.equal((await scanCache.run(scope, () => getText("https://example.com/api"))).text, "fine", "the failure was not served again");
});

test("a busy board (429, 503) gets one more try, a refusal does not", async () => {
  let n = 0;
  route = () => (++n === 1 ? new Response("busy", { status: 503, headers: { "retry-after": "0" } }) : new Response("ok"));
  assert.deepEqual(await getText("https://example.com/busy"), { text: "ok" });
  assert.equal(asked.length, 2);

  asked.length = 0;
  route = () => new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
  assert.match((await getText("https://example.com/limited")).error ?? "", /HTTP 429/);
  assert.equal(asked.length, 2, "two tries, not a loop");

  asked.length = 0;
  route = () => new Response("come back in an hour", { status: 429, headers: { "retry-after": "3600" } });
  assert.match((await getText("https://example.com/hour")).error ?? "", /HTTP 429/);
  assert.equal(asked.length, 1, "a long Retry-After is not waited for");

  asked.length = 0;
  route = () => new Response("no", { status: 403 });
  await getText("https://example.com/refused");
  assert.equal(asked.length, 1);

  assert.equal(retryAfterMs(null), 1000);
  assert.equal(retryAfterMs("2"), 2000);
  assert.equal(retryAfterMs("Wed, 21 Oct 2026 07:28:10 GMT", Date.parse("2026-10-21T07:28:00Z")), 10_000);
});

test("a second query of the same board counts and returns each offer once, and known offers are refreshed", async () => {
  const seen = new Set<string>();
  route = () => json(gh([1, 2]));
  const a = await scanSource({ kind: "greenhouse", handle: "acme" }, profile, { keepAll: true, seen });
  clearScanCache();
  route = () => json(gh([2, 3, 3]));
  const b = await scanSource({ kind: "greenhouse", handle: "acme" }, profile, { keepAll: true, seen });
  assert.deepEqual([a.total, b.total], [2, 1], "offer 2 is not counted twice, the doubled 3 once");
  assert.deepEqual(b.jobs.map((j) => j.url), ["https://job-boards.greenhouse.io/acme/jobs/3"]);
  assert.equal(b.listed?.urls.length, 3, "the complete listing still names every offer the board showed");

  clearScanCache();
  const refreshed: string[] = [];
  route = () => json(gh([1, 2, 3]));
  const c = await scanSource({ kind: "greenhouse", handle: "acme" }, profile, {
    keepAll: true,
    isKnown: (j) => !j.url.endsWith("/3"),
    refresh: (j) => (refreshed.push(j.url), j.url.endsWith("/1")),
  });
  assert.equal(refreshed.length, 2, "every known offer is offered for a refresh");
  assert.deepEqual([c.known, c.updated, c.jobs.length], [2, 1, 1]);
});
