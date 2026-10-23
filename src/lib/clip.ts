import { randomBytes } from "node:crypto";
import { kvGet, kvSet, upsertJob, type NewJob } from "./db";
import { extractTags, guessRemote, guessType, normalizeDate } from "./sources/classify";

/** Per-install secret embedded in the clipper bookmarklet; checked on every import (importClipped). */
export function clipToken(): string {
  let t = kvGet<string>("clip_token", "");
  if (!t) {
    t = randomBytes(12).toString("hex");
    kvSet("clip_token", t);
  }
  return t;
}

const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Stores offers clipped by the bookmarklet. The token proves the bookmark is this install's, so another site cannot plant offers. */
export function importClipped(body: { token?: unknown; site?: unknown; jobs?: unknown }): { ok: false } | { ok: true; added: number; known: number; ids: number[] } {
  if (typeof body?.token !== "string" || !body.token || body.token !== clipToken()) return { ok: false };
  const site = str(body.site, 80).toLowerCase();
  const source: NewJob["source"] = /linkedin/.test(site) ? "linkedin" : "url";
  let added = 0;
  let known = 0;
  const ids: number[] = [];
  for (const raw of (Array.isArray(body.jobs) ? body.jobs : []).slice(0, 60)) {
    const j = (raw ?? {}) as Record<string, unknown>;
    const url = str(j.url, 1000);
    const title = str(j.title, 200);
    if (!/^https?:\/\//.test(url) || !title) continue;
    const description = String(j.description ?? "").trim().slice(0, 20_000);
    const job: NewJob = {
      title,
      company: str(j.company, 200) || site.replace(/^www\./, ""),
      location: str(j.location, 200),
      remote: guessRemote(`${title} ${str(j.location, 200)} ${description.slice(0, 500)}`),
      url,
      source,
      type: guessType(title, description),
      description,
      tags: extractTags(title, description),
      posted_at: normalizeDate(typeof j.posted_at === "string" ? j.posted_at : null),
      deadline: normalizeDate(typeof j.deadline === "string" ? j.deadline : null),
    };
    const r = upsertJob(job);
    if (r.inserted) {
      added++;
      ids.push(r.id);
    } else known++;
  }
  return { ok: true, added, known, ids };
}
