import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessTypeWithContract, matchesKeywords, normalizeDate } from "./classify";
import { getText } from "./http";

// Keejob publishes its whole active catalog as one Markdown index (llms-full.txt,
// linked from /llms.txt) and every offer as Markdown (same URL with `.md`).
// One request lists ~800 offers; we filter by keyword locally, then fetch details.

const INDEX = "https://www.keejob.com/llms-full.txt";
// ponytail: "keejob" is not in SourceKind yet (types.ts is shared); the jobs.source column is plain TEXT.
const SOURCE = "keejob" as SourceKind;

/** "- [Title](https://…/123/slug.md): Company · City, Region, Tunisie · CDI, SIVP · Hybride · publiée le 2026-10-13" */
export function parseKeejobIndex(md: string): (NewJob & { contract: string })[] {
  const out: (NewJob & { contract: string })[] = [];
  const re = /^- \[(.+?)\]\((https:\/\/www\.keejob\.com\/offres-emploi\/\d+\/[^)\s]+?)\.md\):\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const [, rawTitle, base, meta] = m;
    const parts = meta.split(" · ").map((s) => s.trim());
    const date = /publiée le (\d{4}-\d{2}-\d{2})/.exec(meta)?.[1] ?? null;
    const company = parts[0] ?? "";
    const location = (parts[1] ?? "").replace(/,?\s*Tunisie$/, "") || "Tunisie";
    // Remaining parts: contract list, work mode, date — in that order when present.
    const rest = parts.slice(2).filter((p) => !p.startsWith("publiée le"));
    const mode = rest.find((p) => /^(Sur site|Hybride|Télétravail)$/i.test(p)) ?? "";
    const contract = rest.filter((p) => p !== mode).join(", ");
    const title = rawTitle.trim();
    out.push({
      title,
      company: company === "Entreprise Anonyme" ? "Entreprise anonyme" : company,
      location,
      remote: /t[ée]l[ée]travail/i.test(mode) || guessRemote(title),
      url: `${base}/`,
      source: SOURCE,
      type: guessTypeWithContract(title, contract),
      description: [contract && `Contrat : ${contract}`, mode && `Mode : ${mode}`].filter(Boolean).join("\n"),
      tags: extractTags(title),
      posted_at: date,
      deadline: null,
      contract,
    });
  }
  return out;
}

/** Offer page in Markdown -> description, deadline and location. */
export function parseKeejobDetail(md: string): Partial<NewJob> {
  const field = (name: string) => new RegExp(`^- \\*\\*${name}\\*\\* : (.+)$`, "m").exec(md)?.[1]?.trim();
  const body = /## Description\s*\n([\s\S]*?)(?:\n## Postuler|\n---\s*\nSource|$)/.exec(md)?.[1] ?? "";
  const description = body
    .replace(/\\-/g, "-")
    .replace(/\*\*/g, "")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const lieu = field("Lieu");
  return {
    description,
    deadline: normalizeDate(field("Date d'expiration")),
    posted_at: normalizeDate(field("Date de publication")),
    ...(lieu ? { location: lieu.replace(/,?\s*Tunisie$/, "") } : {}),
  };
}

export async function scan(_handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const { text, error } = await getText(INDEX, "text/plain, text/markdown;q=0.9, */*;q=0.5", { timeoutMs: 30_000 });
  if (error) return { jobs: [], error };
  const all = parseKeejobIndex(text);
  if (!all.length) return { jobs: [], error: "Keejob index format changed: no offers found" };
  return { jobs: all.filter((j) => matchesKeywords(`${j.title} ${j.contract}`, keywords)) };
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const { text, error } = await getText(job.url.replace(/\/$/, ".md"), "text/markdown, text/plain;q=0.9");
  if (error || !text.includes("## Description")) return null;
  const d = parseKeejobDetail(text);
  // Keep the contract line from the index in front of the full text.
  return { ...d, description: [job.description, d.description].filter(Boolean).join("\n\n") };
}
