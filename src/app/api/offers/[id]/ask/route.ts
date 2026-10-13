import { getJob, getProfile } from "@/lib/db";
import { aiStreamResponse, type ChatMessage } from "@/lib/ai";
import { askMessages, heuristicAnswer } from "@/lib/ai/offers";
import { cvForMatching } from "@/lib/repo/offers";
import { getLocale } from "@/lib/i18n/server";

/** Streaming Q&A about one offer. Body: { messages: {role, content}[] } ending with the user's question. */
export async function POST(req: Request, ctx: RouteContext<"/api/offers/[id]/ask">) {
  const { id } = await ctx.params;
  const job = /^\d+$/.test(id) ? getJob(Number(id)) : null;
  if (!job) return Response.json({ error: "not found" }, { status: 404 });

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
  const cv = cvForMatching().text;
  return aiStreamResponse(getProfile().settings, askMessages(job, cv, locale, history), () => heuristicAnswer(job, cv, last.content, locale));
}
