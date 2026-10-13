// Streaming Q&A about one company, grounded in the researched pages. Body: { messages: {role, content}[] }.
import { getProfile } from "@/lib/db";
import { aiStreamResponse, type ChatMessage } from "@/lib/ai";
import { askMessages, heuristicAnswer } from "@/lib/ai/company";
import { getCompany } from "@/lib/company";
import { getLocale } from "@/lib/i18n/server";
import { isSameOrigin } from "@/lib/sources/http";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!isSameOrigin(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  const { slug } = await ctx.params;
  const company = /^[a-z0-9-]{1,80}$/.test(slug) ? getCompany(slug) : null;
  if (!company) return Response.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const raw = (body as { messages?: unknown })?.messages;
  const history: ChatMessage[] = (Array.isArray(raw) ? raw : [])
    .filter((m): m is { role: string; content: string } => !!m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string")
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-12)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 4000) }));
  const last = history[history.length - 1];
  if (!last || last.role !== "user" || !last.content.trim()) return Response.json({ error: "question required" }, { status: 400 });

  const locale = await getLocale();
  return aiStreamResponse(getProfile().settings, askMessages(company, locale, history), () => heuristicAnswer(company, last.content, locale));
}
