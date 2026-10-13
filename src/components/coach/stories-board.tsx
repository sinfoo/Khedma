"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/kit/toast";
import { Dialog } from "@/components/kit/dialog";
import { Progress } from "@/components/kit";
import { EngineChip } from "@/components/ui";
import { storyStrength, type StoryInput } from "@/lib/coach/logic";
import { deleteStory, polishStoryDraft, saveStory } from "@/app/actions/coach";

export interface BoardStory extends StoryInput {
  id: number;
}

const PARTS = ["situation", "task", "action", "result"] as const;
type Part = (typeof PARTS)[number];
const EMPTY: StoryInput = { title: "", situation: "", task: "", action: "", result: "", tags: [], skills: [] };
const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Strength({ story }: { story: StoryInput }) {
  const { t } = useT();
  const c = t.coach2.stories;
  const { score } = storyStrength(story);
  const level = score >= 75 ? "strong" : score >= 45 ? "ok" : "weak";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted">{c.strength}</span>
        <span className={`font-semibold ${level === "strong" ? "text-success" : level === "ok" ? "text-accent-text" : "text-saffron"}`}>
          {c.levels[level]} · <span className="mono">{score}</span>
        </span>
      </div>
      <Progress value={score} label={`${c.strength}: ${score}/100`} tone={level === "strong" ? "success" : level === "ok" ? "accent" : "saffron"} />
    </div>
  );
}

function Editor({ initial, id, onDone }: { initial: StoryInput; id: number | null; onDone: () => void }) {
  const { t } = useT();
  const c = t.coach2.stories;
  const toast = useToast();
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [skills, setSkills] = useState(initial.skills.join(", "));
  const [polished, setPolished] = useState<(Record<Part, string> & { engine: string }) | null>(null);
  const [saving, startSave] = useTransition();
  const [polishing, startPolish] = useTransition();
  const current: StoryInput = { ...s, tags: splitList(tags), skills: splitList(skills) };
  const { gaps } = storyStrength(current);

  const save = () =>
    startSave(async () => {
      const r = await saveStory(id, current);
      if (r.error) {
        toast.error(c.invalid);
        return;
      }
      toast.success(c.saved);
      router.refresh();
      onDone();
    });

  return (
    <form
      id="story-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="st-title" className="label">{c.fields.title}</label>
        <input id="st-title" className="input mt-1.5" required maxLength={120} value={s.title} placeholder={c.placeholders.title} onChange={(e) => setS({ ...s, title: e.target.value })} />
      </div>
      {PARTS.map((p) => (
        <div key={p}>
          <label htmlFor={`st-${p}`} className="label flex items-center gap-2">
            <span aria-hidden="true" className="mono grid size-5 place-items-center rounded bg-accent-soft text-[0.7rem] font-bold text-accent-text">{p[0].toUpperCase()}</span>
            {c.fields[p]}
          </label>
          <textarea id={`st-${p}`} className="input mt-1.5 min-h-[4.5rem] resize-y" rows={p === "action" ? 4 : 2} maxLength={p === "action" ? 3000 : 2000} value={s[p]} placeholder={c.placeholders[p]} onChange={(e) => setS({ ...s, [p]: e.target.value })} />
        </div>
      ))}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="st-tags" className="label">{c.fields.tags}</label>
          <input id="st-tags" className="input mt-1.5" value={tags} onChange={(e) => setTags(e.target.value)} aria-describedby="st-comma" />
        </div>
        <div>
          <label htmlFor="st-skills" className="label">{c.fields.skills}</label>
          <input id="st-skills" className="input mt-1.5" value={skills} onChange={(e) => setSkills(e.target.value)} aria-describedby="st-comma" />
        </div>
        <p id="st-comma" className="hint !mt-0 sm:col-span-2">{c.commaHint}</p>
      </div>

      <div className="rounded-xl border border-line bg-surface-2 p-3.5" aria-live="polite">
        <Strength story={current} />
        {gaps.length > 0 && (
          <ul className="mt-2.5 space-y-1 text-xs text-ink-2">
            {gaps.slice(0, 4).map((g) => (
              <li key={g} className="flex gap-1.5">
                <span aria-hidden="true" className="text-saffron">→</span>
                {c.gaps[g]}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-line-strong p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={polishing || !(s.situation || s.task || s.action || s.result)}
            onClick={() =>
              startPolish(async () => {
                try {
                  setPolished(await polishStoryDraft(current));
                } catch {
                  toast.error(t.common.error);
                }
              })
            }
          >
            {polishing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
            {polishing ? c.polishing : c.polish}
          </button>
          {polished && <EngineChip engine={polished.engine} t={t} />}
        </div>
        {polished && (
          <div className="mt-3 space-y-2.5" aria-live="polite">
            <p className="text-sm font-semibold">{c.polishTitle}</p>
            <p className="text-xs text-muted">{c.polishNote}</p>
            <dl className="space-y-2 text-sm">
              {PARTS.map((p) => (
                <div key={p}>
                  <dt className="text-xs font-semibold text-accent-text">{c.fields[p]}</dt>
                  <dd className="text-ink-2">{polished[p]}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setS({ ...s, situation: polished.situation, task: polished.task, action: polished.action, result: polished.result });
                  setPolished(null);
                }}
              >
                {c.accept}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPolished(null)}>
                {c.discard}
              </button>
            </div>
          </div>
        )}
      </div>
      {saving && <span className="sr-only" role="status">{t.common.loading}</span>}
    </form>
  );
}

export function StoriesBoard({ stories }: { stories: BoardStory[] }) {
  const { t } = useT();
  const c = t.coach2.stories;
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: number | null; story: StoryInput } | null>(null);
  const [removing, startRemove] = useTransition();

  const remove = (id: number) => {
    if (!window.confirm(c.deleteConfirm)) return;
    startRemove(async () => {
      await deleteStory(id);
      toast.success(c.deleted);
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{c.lead}</p>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ id: null, story: EMPTY })}>
          <Plus size={16} aria-hidden="true" /> {c.add}
        </button>
      </div>

      {stories.length === 0 ? (
        <div className="card relative overflow-hidden px-6 py-14 text-center rise">
          <div className="pattern pattern-fade" aria-hidden="true" />
          <div className="relative mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-text">
            <BookOpen size={22} aria-hidden="true" />
          </div>
          <p className="relative display text-xl">{c.empty}</p>
          <p className="relative mx-auto mt-2 max-w-md text-muted">{c.emptyHint}</p>
          <button type="button" className="btn btn-primary relative mt-6" onClick={() => setEditing({ id: null, story: EMPTY })}>
            <Plus size={16} aria-hidden="true" /> {c.add}
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {stories.map((s, i) => (
            <li key={s.id} id={`story-${s.id}`} className="card flex scroll-mt-24 flex-col gap-3 p-5 rise target:ring-2 target:ring-accent" style={{ ["--i" as string]: i }}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold leading-snug" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{s.title}</h2>
                <div className="-mr-2 -mt-1 flex shrink-0">
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`${c.edit}: ${s.title}`} onClick={() => setEditing({ id: s.id, story: s })}>
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm text-danger" aria-label={`${t.common.delete}: ${s.title}`} onClick={() => remove(s.id)} disabled={removing}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <Strength story={s} />
              <dl className="grid gap-1.5 text-sm">
                {PARTS.map((p) => (
                  <div key={p} className="grid grid-cols-[1.25rem_1fr] gap-2">
                    <dt className="mono grid size-5 place-items-center rounded bg-surface-2 text-[0.7rem] font-bold text-muted" title={c.fields[p]}>
                      <span aria-hidden="true">{p[0].toUpperCase()}</span>
                      <span className="sr-only">{c.fields[p]}</span>
                    </dt>
                    <dd className={`line-clamp-2 ${s[p] ? "text-ink-2" : "italic text-muted"}`}>{s[p] || "—"}</dd>
                  </div>
                ))}
              </dl>
              {(s.tags.length > 0 || s.skills.length > 0) && (
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {s.tags.map((x) => <span key={`t-${x}`} className="chip">{x}</span>)}
                  {s.skills.map((x) => <span key={`s-${x}`} className="chip chip-accent">{x}</span>)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? c.edit : c.add}
        variant="drawer"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>{t.common.cancel}</button>
            <button type="submit" form="story-form" className="btn btn-primary">{c.save}</button>
          </>
        }
      >
        {editing && <Editor key={editing.id ?? "new"} initial={editing.story} id={editing.id} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}
