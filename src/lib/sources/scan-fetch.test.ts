// The network side of a scan, with fetch stubbed: what a board's answer (or failure) does to the result, and above
// all to `listed`, which closes the offers a complete board no longer lists. A failed or empty answer must never
// count as "the board is now empty".
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type Profile } from "../types";
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
