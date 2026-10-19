"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Wand2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { extractSkills } from "@/lib/ai/heuristic";
import { sectionizeToMarkdown, wordCount } from "@/lib/cv/sectionize";
import { CvUpload, type UploadMeta } from "./cv-upload";

/**
 * Upload or paste a CV, see the extracted text and detected skills, and optionally
 * convert it to Markdown (reviewed before saving). Used by the wizard and the profile dialog.
 */
export function CvImporter({
  upload,
  uploadText,
  onUploaded,
  skills,
  onAddSkills,
  hasMarkdown,
  onSaveMarkdown,
  startInReview = false,
  showUpload = true,
}: {
  upload: UploadMeta | null;
  uploadText: string;
  onUploaded: (meta: UploadMeta, text: string, markdown?: string, skills?: string[]) => void;
  skills: string[];
  onAddSkills: (skills: string[]) => void;
  hasMarkdown: boolean;
  onSaveMarkdown: (md: string) => Promise<void> | void;
  startInReview?: boolean;
  showUpload?: boolean;
}) {
  const { t } = useT();
  const c = t.profile2.cv;
  const [source, setSource] = useState(uploadText);
  const [paste, setPaste] = useState("");
  const [review, setReview] = useState<string | null>(startInReview && uploadText ? sectionizeToMarkdown(uploadText) : null);
  const [saving, start] = useTransition();

  const have = new Set(skills.map((s) => s.toLowerCase()));
  const found = source ? extractSkills(source).filter((s) => !have.has(s.toLowerCase())) : [];
  const words = wordCount(source);

  return (
    <div className="space-y-4">
      {showUpload && (
        <CvUpload
          upload={upload}
          onUploaded={(m, text, markdown, skills) => {
            setSource(text);
            setReview(null);
            onUploaded(m, text, markdown, skills);
          }}
        />
      )}

      {review === null && (
        <details className="group rounded-xl border border-line px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">{c.pasteTitle}</summary>
          <div className="mt-3 space-y-2">
            <label className="sr-only" htmlFor="cv-paste">
              {c.pasteTitle}
            </label>
            <textarea id="cv-paste" className="input mono !min-h-40 text-sm" value={paste} placeholder={c.pastePh} onChange={(e) => setPaste(e.target.value)} />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!paste.trim()}
              onClick={() => {
                setSource(paste);
                setReview(sectionizeToMarkdown(paste));
              }}
            >
              <Wand2 size={14} aria-hidden="true" /> {c.convertPaste}
            </button>
          </div>
        </details>
      )}

      {source && review === null && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              {c.extracted} <span className="font-normal text-muted tabular">· {fmt(c.words, { n: words })}</span>
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs mono">{source}</pre>
          </details>

          <div>
            <p className="text-sm font-semibold">{c.detected}</p>
            {found.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {found.slice(0, 30).map((s) => (
                  <span key={s} className="chip">
                    {s}
                  </span>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddSkills(found)}>
                  <Plus size={14} aria-hidden="true" /> {fmt(c.addSkills, { n: found.length })}
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted">{c.noNewSkills}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReview(sectionizeToMarkdown(source))}>
              <Wand2 size={14} aria-hidden="true" /> {c.convert}
            </button>
            <span className="chip">{c.optional}</span>
            <p className="hint !mt-0 w-full">{c.convertHint}</p>
          </div>
        </div>
      )}

      {review !== null && (
        <div className="space-y-2 rounded-xl border border-accent/40 bg-accent-soft/30 p-4">
          <label className="font-semibold" htmlFor="cv-review">
            {c.reviewTitle}
          </label>
          <p id="cv-review-hint" className="hint !mt-0">
            {c.reviewHint} {hasMarkdown && <strong className="text-saffron">{c.replaceWarn}</strong>}
          </p>
          <textarea
            id="cv-review"
            aria-describedby="cv-review-hint"
            className="input mono !min-h-72 text-sm"
            value={review}
            spellCheck={false}
            onChange={(e) => setReview(e.target.value)}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReview(null)}>
              {t.common.cancel}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!review.trim() || saving}
              aria-busy={saving}
              onClick={() =>
                start(async () => {
                  await onSaveMarkdown(review);
                  setReview(null);
                })
              }
            >
              <Check size={14} aria-hidden="true" /> {c.useAsCv}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
