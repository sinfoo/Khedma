import { CvImportError, MAX_CV_BYTES, getUpload, saveUploadedCv } from "@/lib/cv/source";

const STATUS = { tooLarge: 413, unsupported: 415, empty: 422, corrupt: 422 } as const;

/** Upload the profile CV (multipart field "file"). Keeps cv_md untouched. */
export async function POST(req: Request) {
  let file: FormDataEntryValue | null = null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return Response.json({ ok: false, code: "bad_request", error: "Expected multipart/form-data with a file field." }, { status: 400 });
  }
  if (!(file instanceof File) || !file.size) return Response.json({ ok: false, code: "empty", error: "No file received." }, { status: 400 });
  if (file.size > MAX_CV_BYTES) return Response.json({ ok: false, code: "tooLarge", error: "File is larger than 8 MB." }, { status: 413 });
  try {
    const { text } = await saveUploadedCv(file.name, new Uint8Array(await file.arrayBuffer()));
    const up = getUpload();
    return Response.json({ ok: true, text, fileName: up?.fileName ?? file.name, uploadedAt: up?.uploadedAt ?? new Date().toISOString(), size: up?.size ?? file.size });
  } catch (e) {
    if (e instanceof CvImportError) return Response.json({ ok: false, code: e.code, error: e.message }, { status: STATUS[e.code] });
    return Response.json({ ok: false, code: "corrupt", error: "Could not save this file." }, { status: 500 });
  }
}
