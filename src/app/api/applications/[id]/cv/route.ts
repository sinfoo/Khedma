import { revalidatePath } from "next/cache";
import { getApplication } from "@/lib/db";
import { CvImportError, MAX_CV_BYTES, extractCvText } from "@/lib/cv/source";
import { setExtras } from "@/lib/repo/apps";

const OK_EXT = /\.(pdf|docx|md|txt)$/i;

async function appId(ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 && getApplication(id) ? id : null;
}

/** Upload a CV used only for this application (multipart field "file"). Errors: { ok: false, code }. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await appId(ctx);
  if (!id) return Response.json({ ok: false, code: "not_found" }, { status: 404 });
  let file: FormDataEntryValue | null = null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return Response.json({ ok: false, code: "bad_request" }, { status: 400 });
  }
  if (!(file instanceof File) || !file.size) return Response.json({ ok: false, code: "empty" }, { status: 400 });
  if (file.size > MAX_CV_BYTES) return Response.json({ ok: false, code: "tooLarge" }, { status: 413 });
  const name = file.name.replace(/[\\/]/g, "_").slice(0, 160);
  if (!OK_EXT.test(name)) return Response.json({ ok: false, code: "unsupported" }, { status: 415 });
  let text = "";
  try {
    text = (await extractCvText(name, new Uint8Array(await file.arrayBuffer()))).trim();
  } catch (e) {
    const code = e instanceof CvImportError ? e.code : "corrupt";
    return Response.json({ ok: false, code }, { status: code === "unsupported" ? 415 : code === "tooLarge" ? 413 : 422 });
  }
  if (text.length < 50) return Response.json({ ok: false, code: "empty" }, { status: 422 });
  setExtras(id, { cv_override_text: text.slice(0, 60_000), cv_override_name: name, cv_override_at: new Date().toISOString() });
  revalidatePath("/app", "layout");
  return Response.json({ ok: true, name, chars: text.length });
}
