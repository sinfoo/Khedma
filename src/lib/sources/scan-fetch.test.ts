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
