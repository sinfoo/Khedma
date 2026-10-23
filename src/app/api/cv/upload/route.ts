import { CvImportError, MAX_CV_BYTES, getUpload, saveUploadedCv, sectionizeToMarkdown, setCvSourcePref } from "@/lib/cv/source";
import { getProfile, updateProfile } from "@/lib/db";
import { extractSkills } from "@/lib/ai/heuristic";
import { mergeSkills } from "@/lib/cv/model";

const STATUS = { tooLarge: 413, unsupported: 415, empty: 422, corrupt: 422 } as const;

/** Upload the profile CV (multipart field "file"). The text is converted to Markdown and becomes the editable CV. */
export async function POST(req: Request) {
  let file: FormDataEntryValue | null = null;
  let ocr: FormDataEntryValue | null = null;
  try {
    const form = await req.formData();
    file = form.get("file");
    ocr = form.get("ocr");
  } catch {
    return Response.json({ ok: false, code: "bad_request", error: "Expected multipart/form-data with a file field." }, { status: 400 });
  }
  if (!(file instanceof File) || !file.size) return Response.json({ ok: false, code: "empty", error: "No file received." }, { status: 400 });
  if (file.size > MAX_CV_BYTES) return Response.json({ ok: false, code: "tooLarge", error: "File is larger than 8 MB." }, { status: 413 });
  try {
    const { text } = await saveUploadedCv(file.name, new Uint8Array(await file.arrayBuffer()), typeof ocr === "string" ? ocr : undefined);
    const up = getUpload();
    // Automatic conversion: the Markdown becomes the editable, AI-readable CV; the original file stays downloadable.
    const markdown = sectionizeToMarkdown(text);
    let skillsAdded = 0;
    let skills = getProfile().skills;
    if (markdown.trim().length > 40) {
      const merged = mergeSkills(skills, extractSkills(text));
      skillsAdded = merged.length - skills.length;
      skills = merged;
      updateProfile({ cv_md: markdown, skills });
      setCvSourcePref("markdown");
    }
    return Response.json({ ok: true, text, markdown, skills, skillsAdded, fileName: up?.fileName ?? file.name, uploadedAt: up?.uploadedAt ?? new Date().toISOString(), size: up?.size ?? file.size });
  } catch (e) {
    if (e instanceof CvImportError) return Response.json({ ok: false, code: e.code, error: e.message }, { status: STATUS[e.code] });
    return Response.json({ ok: false, code: "corrupt", error: "Could not save this file." }, { status: 500 });
  }
}
