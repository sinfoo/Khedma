"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Columns2, Eye, FileDown, FileText, Import, PencilLine, Plus, ScanSearch, Sparkles, Stethoscope, Target, Trash2, UserRound, Wand2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { Dialog } from "@/components/kit/dialog";
import { Markdown } from "@/components/markdown";
import { JOB_TYPES } from "@/lib/types";
import { extractSkills } from "@/lib/ai/heuristic";
import { saveProfileDraft, chooseCvSource } from "@/app/actions/profile";
import {
  CEFR_LEVELS,
  LANGUAGE_SUGGESTIONS,
  ROLE_SUGGESTIONS,
  SKILL_LEVELS,
  SKILL_SUGGESTIONS,
  mergeSkills,
  suggestHeadline,
  type Cefr,
  type ProfileDraft,
  type ProfileExtra,
  type SkillLevel,
} from "@/lib/cv/model";
import { profileStrength } from "@/lib/cv/completeness";
import { wordCount } from "@/lib/cv/sectionize";
import { SaveIndicator, useAutosave } from "./autosave";
import { ChipInput } from "./chip-input";
import { CountryPicker } from "@/components/country-picker";
import { placesToLocations } from "@/lib/geo";
import { CvUpload, type UploadMeta } from "./cv-upload";
import { CvImporter } from "./cv-importer";
import { HealthPanel, MarkdownEditor, ReviewPanel, StrengthMeter } from "./cv-panels";
import type { CvReview } from "@/lib/ai/cv-review";

export type DraftState = Omit<ProfileDraft, "extra"> & { extra: Omit<ProfileExtra, "onboarding"> };

export function jumpTo(href: string) {
  const el = document.querySelector<HTMLElement>(href);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const target = el.matches("input,textarea,select,button") ? el : el.querySelector<HTMLElement>("input,textarea,select,button");
  (target ?? el).focus({ preventScroll: true });
}

export function skeletonCv(locale: "fr" | "en", d: DraftState): string {
  const contact = [d.email, d.extra.phone, d.extra.city, d.extra.links.linkedin, d.extra.links.github].filter(Boolean).join(" · ");
  const fr = locale === "fr";
  return `# ${d.name || (fr ? "Prénom Nom" : "First Last")}

${contact || (fr ? "e-mail · téléphone · ville · LinkedIn · GitHub" : "email · phone · city · LinkedIn · GitHub")}

**${d.headline || (fr ? "Élève ingénieur en …, à la recherche d'un stage" : "Engineering student in …, looking for an internship")}**

## ${fr ? "Formation" : "Education"}

### ${d.extra.school || "ENIT"} · ${d.extra.specialty || (fr ? "Spécialité" : "Specialty")} · 20XX – 20XX

## ${fr ? "Expérience" : "Experience"}

### ${fr ? "Stage · Entreprise, Ville · MM/AAAA – MM/AAAA" : "Internship · Company, City · MM/YYYY – MM/YYYY"}
- ${fr ? "Verbe d'action + ce que vous avez fait + résultat chiffré" : "Action verb + what you did + measurable result"}

## ${fr ? "Projets" : "Projects"}

### ${fr ? "Nom du projet (technologies)" : "Project name (technologies)"}
- ${fr ? "Développé … utilisé par N utilisateurs" : "Built … used by N users"}

## ${fr ? "Compétences" : "Skills"}

- ${d.skills.join(", ") || (fr ? "Langages, frameworks, outils" : "Languages, frameworks, tools")}

## ${fr ? "Langues" : "Languages"}

- ${d.extra.langs.map((l) => `${l.name} (${l.level === "native" ? (fr ? "natif" : "native") : l.level})`).join(", ") || (fr ? "Arabe (natif), Français (C1), Anglais (B2)" : "Arabic (native), French (C1), English (B2)")}
`;
}

type Mode = "write" | "split" | "preview" | "health" | "review";
type Tab = "cv" | "about" | "targets" | "skills";

export function ProfileEditor({ initial, upload: initialUpload, uploadText: initialUploadText, initialReview = null, sourcePref = "markdown" }: { initial: DraftState; upload: UploadMeta | null; uploadText: string; initialReview?: CvReview | null; sourcePref?: "upload" | "markdown" }) {
  const [pref, setPref] = useState<"upload" | "markdown">(sourcePref);
  const { t, locale } = useT();
  const p2 = t.profile2;
  const toast = useToast();
  const [d, setD] = useState<DraftState>(initial);
  const [upload, setUpload] = useState(initialUpload);
  const [uploadText, setUploadText] = useState(initialUploadText);
  const [mode, setMode] = useState<Mode>("split");
  const [tab, setTab] = useState<Tab>("cv");
  const [dialog, setDialog] = useState<null | "import" | "convert">(null);

  const save = useCallback((v: DraftState) => saveProfileDraft(v), []);
  const auto = useAutosave(save);

  const update = (patch: Partial<DraftState>) => {
    const n = { ...d, ...patch };
    setD(n);
    auto.schedule(n);
  };
  const updateExtra = (patch: Partial<DraftState["extra"]>) => update({ extra: { ...d.extra, ...patch } });

  const cvText = d.cv_md.trim() ? d.cv_md : uploadText;
  const strength = useMemo(() => profileStrength({ ...d, ...d.extra, cvText }), [d, cvText]);
  const words = wordCount(cvText);
  const suggestion = suggestHeadline(locale, d.extra, d.target_types.includes("pfe"));
  const initials = (d.name || "?").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

  const addSkills = (found: string[]) => {
    const next = mergeSkills(d.skills, found);
    const n = next.length - d.skills.length;
    if (n > 0) update({ skills: next });
    if (n > 0) toast.success(fmt(p2.cv.skillsAdded, { n }));
    else toast.info(p2.cv.noNewSkills);
  };

  const saveMarkdown = async (md: string) => {
    const n = { ...d, cv_md: md };
    setD(n);
    auto.schedule(n);
    await auto.flush();
    setDialog(null);
    setMode("split");
    toast.success(p2.cv.savedMd);
  };

  const tabs: { key: Tab; label: string; Icon: typeof Eye; hint: string }[] = [
    { key: "cv", label: p2.tabs.cv, Icon: FileText, hint: fmt(p2.cv.words, { n: words }) },
    { key: "about", label: p2.tabs.about, Icon: UserRound, hint: d.name || p2.tabs.aboutHint },
    { key: "targets", label: p2.tabs.targets, Icon: Target, hint: fmt(p2.tabs.targetsHint, { n: d.target_roles.length, c: d.extra.places.countries.length }) },
    { key: "skills", label: p2.tabs.skills, Icon: Sparkles, hint: fmt(p2.tabs.skillsHint, { n: d.skills.length, l: d.extra.langs.length }) },
  ];
  const modes: { key: Mode; label: string; Icon: typeof Eye }[] = [
    { key: "split", label: p2.cv.split, Icon: Columns2 },
    { key: "write", label: p2.cv.write, Icon: PencilLine },
    { key: "preview", label: p2.cv.preview, Icon: Eye },
    { key: "health", label: p2.cv.health, Icon: Stethoscope },
    { key: "review", label: p2.review.tab, Icon: Wand2 },
  ];
  const sectionTitle = (id: string, label: string) => (
    <h2 id={id} className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
      {label}
    </h2>
  );

  return (
    <>
      {/* Identity hero */}
      <header className="card relative mb-5 overflow-hidden p-5 rise sm:p-6">
        <div className="pattern pattern-fade" aria-hidden="true" />
        <div className="relative grid gap-5 md:grid-cols-[auto_1fr_auto] md:items-center">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="display grid size-16 shrink-0 place-items-center rounded-2xl bg-accent text-2xl text-accent-ink">
              {initials}
            </span>
            <div className="min-w-0 md:hidden">
              <h1 className="truncate text-2xl">{d.name || p2.title}</h1>
              <p className="truncate text-sm text-muted">{d.headline || p2.lead}</p>
            </div>
          </div>
          <div className="hidden min-w-0 md:block">
            <h1 className="truncate text-[1.75rem] leading-tight">{d.name || p2.title}</h1>
            <p className="mt-0.5 truncate text-muted">{d.headline || p2.lead}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-xs" aria-label={p2.hero.facts}>
              {d.extra.school && <li className="chip">{d.extra.school}</li>}
              {d.extra.level && <li className="chip">{d.extra.level}</li>}
              {d.extra.specialty && <li className="chip">{d.extra.specialty}</li>}
              {upload && <li className="chip chip-accent">{upload.fileName}</li>}
              {initialReview && <li className="chip chip-success">{fmt(p2.review.score, { n: initialReview.score })}</li>}
            </ul>
          </div>
          <div className="flex items-center gap-4 md:flex-col md:items-end">
            <StrengthRing score={strength.score} label={p2.strength.title} />
            <div className="flex flex-wrap items-center gap-2">
              <SaveIndicator status={auto.status} at={auto.at} onRetry={() => void auto.flush()} />
              <Link href="/app/profile/cv" className="btn btn-secondary btn-sm">
                <FileDown size={14} aria-hidden="true" /> {p2.openTemplates}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav aria-label={p2.title} className="mb-5 rise" style={{ ["--i" as string]: 1 }}>
        <ul role="tablist" className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {tabs.map(({ key, label, Icon, hint }) => {
            const on = tab === key;
            return (
              <li key={key} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls={`panel-${key}`}
                  id={`tab-${key}`}
                  onClick={() => setTab(key)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all ${
                    on ? "border-accent bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]" : "border-line bg-surface hover:-translate-y-px hover:border-line-strong"
                  }`}
                >
                  <Icon size={18} aria-hidden="true" className={on ? "text-accent-text" : "text-muted"} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block truncate text-xs text-muted">{hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* CV */}
      <section id="panel-cv" role="tabpanel" aria-labelledby="tab-cv" hidden={tab !== "cv"} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="card space-y-4 p-4 sm:p-5 rise">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label={p2.cv.title} className="inline-flex flex-wrap rounded-xl border border-line bg-surface-2 p-0.5">
                {modes.map(({ key, label, Icon }) => (
                  <button key={key} type="button" aria-pressed={mode === key} className={`btn btn-sm !border-0 ${mode === key ? "!bg-accent-soft !text-accent-text" : "btn-ghost text-muted"}`} onClick={() => setMode(key)}>
                    <Icon size={14} aria-hidden="true" /> <span className={key === "split" ? "hidden lg:inline" : ""}>{label}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => addSkills(extractSkills(cvText))} disabled={!cvText.trim()}>
                  <ScanSearch size={14} aria-hidden="true" /> {p2.cv.extract}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog("import")}>
                  <Import size={14} aria-hidden="true" /> {p2.cv.importBtn}
                </button>
              </div>
            </div>

            {(mode === "write" || mode === "split") && !d.cv_md.trim() && (
              <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/60 p-4">
                <p className="font-semibold">{p2.cv.emptyTitle}</p>
                <p className="mt-1 text-sm text-muted">{upload ? p2.cv.emptyHint : p2.cv.emptyHintNoFile}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {upload && uploadText && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialog("convert")}>
                      <Wand2 size={14} aria-hidden="true" /> {p2.cv.convert}
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => update({ cv_md: skeletonCv(locale, d) })}>
                    <Plus size={14} aria-hidden="true" /> {p2.cv.skeleton}
                  </button>
                </div>
              </div>
            )}
            {mode === "split" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <MarkdownEditor id="cv-md" label={p2.cv.editorLabel} value={d.cv_md} onChange={(v) => update({ cv_md: v })} describedBy="cv-meta" />
                <div className="hidden max-h-[70vh] overflow-auto rounded-xl border border-line p-5 lg:block" aria-label={p2.cv.preview}>
                  {d.cv_md.trim() ? <Markdown>{d.cv_md}</Markdown> : <p className="text-sm text-muted">{p2.cv.previewEmpty}</p>}
                </div>
              </div>
            )}
            {mode === "write" && <MarkdownEditor id="cv-md" label={p2.cv.editorLabel} value={d.cv_md} onChange={(v) => update({ cv_md: v })} describedBy="cv-meta" />}
            {mode === "preview" &&
              (d.cv_md.trim() ? (
                <div className="min-h-[55vh] rounded-xl border border-line p-5">
                  <Markdown>{d.cv_md}</Markdown>
                </div>
              ) : (
                <pre className="min-h-[40vh] whitespace-pre-wrap rounded-xl border border-line bg-surface-2 p-4 text-xs mono">{uploadText || p2.cv.emptyHintNoFile}</pre>
              ))}
            {mode === "health" && <HealthPanel text={cvText} />}
            {mode === "review" && (
              <ReviewPanel
                initial={initialReview}
                cvMd={d.cv_md}
                onApplyRewrite={(before, after) => {
                  if (!d.cv_md.includes(before)) return false;
                  update({ cv_md: d.cv_md.replace(before, after) });
                  return true;
                }}
                onReplaceCv={(md) => {
                  const previous = d.cv_md;
                  update({ cv_md: md });
                  setMode("split");
                  toast.success(p2.review.acceptedToast, undefined, {
                    label: p2.review.undo,
                    onClick: () => {
                      update({ cv_md: previous });
                      toast.info(p2.review.restored);
                    },
                  });
                }}
              />
            )}
            <p id="cv-meta" className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted tabular">
              <span>
                {fmt(p2.cv.words, { n: words })} · {fmt(p2.cv.pages, { n: Math.max(1, Math.ceil(words / 450)) })}
              </span>
              {upload && d.cv_md.trim() ? (
                <span className="inline-flex items-center gap-2">
                  <span>{p2.cv.sourceLabel}:</span>
                  <span role="group" aria-label={p2.cv.sourceLabel} className="inline-flex overflow-hidden rounded-lg border border-line-strong">
                    {(["markdown", "upload"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={pref === k}
                        className={`px-2 py-0.5 text-xs font-semibold ${pref === k ? "bg-accent-soft text-accent-text" : "text-muted hover:text-ink"}`}
                        onClick={() => {
                          setPref(k);
                          void chooseCvSource(k).then(() => toast.success(fmt(p2.cv.sourceChanged, { src: k === "upload" ? p2.cv.sourceUpload : p2.cv.sourceMarkdown })));
                        }}
                      >
                        {k === "upload" ? p2.cv.sourceUpload : p2.cv.sourceMarkdown}
                      </button>
                    ))}
                  </span>
                </span>
              ) : (
                <span>{fmt(p2.cv.tailorNote, { src: d.cv_md.trim() ? p2.cv.srcMarkdown : upload ? p2.cv.srcFile : "—" })}</span>
              )}
            </p>
          </div>

          <aside className="space-y-4">
            <div className="card p-4 rise" style={{ ["--i" as string]: 2 }}>
              {sectionTitle("sec-file", p2.cv.fileTitle)}
              <p className="mb-3 mt-1 text-xs text-muted">{p2.cv.fileLead}</p>
              <CvUpload
                upload={upload}
                onUploaded={(m, text, markdown, skills) => {
                  setUpload(m);
                  setUploadText(text);
                  if (markdown) {
                    update({ cv_md: markdown, ...(skills && skills.length > d.skills.length ? { skills } : {}) });
                    if (skills && skills.length > d.skills.length) toast.success(fmt(p2.cv.skillsAdded, { n: skills.length - d.skills.length }));
                    setPref("markdown");
                    setMode("split");
                    toast.success(p2.cv.autoConverted, p2.cv.autoConvertedBody);
                  } else setPref("upload");
                }}
              />
            </div>
            <StrengthMeter
              score={strength.score}
              items={strength.items}
              onJump={(href) => {
                const map: Record<string, Tab> = { "#cv": "cv", "#cv-md": "cv", "#f-name": "about", "#f-email": "about", "#f-github": "about", "#f-linkedin": "about", "#f-roles": "targets", "#f-types": "targets", "#f-skills": "skills", "#f-langs": "skills" };
                const target = map[href] ?? (href.startsWith("#f-") ? "about" : "cv");
                setTab(target);
                if (target === "cv") setMode("split");
                requestAnimationFrame(() => jumpTo(href === "#cv" ? "#cv-md" : href));
              }}
            />
          </aside>
        </div>
      </section>

      {/* About */}
      <section id="panel-about" role="tabpanel" aria-labelledby="tab-about" hidden={tab !== "about"} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card space-y-4 p-5 rise" aria-labelledby="sec-identity">
          {sectionTitle("sec-identity", p2.sections.identity)}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="f-name" label={p2.f.name}>
              <input id="f-name" className="input" autoComplete="name" value={d.name} onChange={(e) => update({ name: e.target.value })} />
            </Field>
            <Field id="f-email" label={p2.f.email}>
              <input id="f-email" type="email" className="input" autoComplete="email" value={d.email} onChange={(e) => update({ email: e.target.value })} />
            </Field>
            <Field id="f-phone" label={p2.f.phone}>
              <input id="f-phone" type="tel" className="input" autoComplete="tel" placeholder="+216 …" value={d.extra.phone} onChange={(e) => updateExtra({ phone: e.target.value })} />
            </Field>
            <Field id="f-city" label={p2.f.city}>
              <input id="f-city" className="input" autoComplete="address-level2" value={d.extra.city} onChange={(e) => updateExtra({ city: e.target.value })} />
            </Field>
            <Field id="f-school" label={p2.f.school}>
              <input id="f-school" className="input" value={d.extra.school} onChange={(e) => updateExtra({ school: e.target.value })} />
            </Field>
            <Field id="f-level" label={p2.f.level}>
              <input id="f-level" className="input" placeholder={p2.f.levelPh} value={d.extra.level} onChange={(e) => updateExtra({ level: e.target.value })} />
            </Field>
            <Field id="f-specialty" label={p2.f.specialty}>
              <input id="f-specialty" className="input" placeholder={p2.f.specialtyPh} value={d.extra.specialty} onChange={(e) => updateExtra({ specialty: e.target.value })} />
            </Field>
          </div>
          <Field id="f-headline" label={p2.f.headline}>
            <textarea id="f-headline" className="input !min-h-20" placeholder={p2.f.headlinePh} value={d.headline} onChange={(e) => update({ headline: e.target.value })} />
          </Field>
          {suggestion && suggestion !== d.headline && (
            <div className="-mt-2 flex items-start gap-2 rounded-lg bg-surface-2 p-2.5 text-sm">
              <Wand2 size={14} className="mt-1 shrink-0 text-accent-text" aria-hidden="true" />
              <p className="flex-1 text-ink-2">
                <span className="sr-only">{p2.f.suggestion}: </span>
                {suggestion}
              </p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ headline: suggestion })}>
                {p2.f.useSuggestion}
              </button>
            </div>
          )}
        </div>
        <div className="card space-y-4 p-5 rise" aria-labelledby="sec-links" style={{ ["--i" as string]: 1 }}>
          {sectionTitle("sec-links", p2.sections.links)}
          {(["github", "linkedin", "portfolio"] as const).map((k) => (
            <Field key={k} id={`f-${k}`} label={p2.f[k]}>
              <input id={`f-${k}`} type="url" inputMode="url" className="input" placeholder={k === "github" ? "https://github.com/…" : k === "linkedin" ? "https://linkedin.com/in/…" : "https://…"} value={d.extra.links[k]} onChange={(e) => updateExtra({ links: { ...d.extra.links, [k]: e.target.value } })} />
            </Field>
          ))}
          <p className="hint !mt-0">{p2.f.linkHint}</p>
        </div>
        <div className="card space-y-4 p-5 rise lg:col-span-2" aria-labelledby="sec-style" style={{ ["--i" as string]: 2 }}>
          {sectionTitle("sec-style", p2.sections.style)}
          <div className="grid gap-4 lg:grid-cols-2">
            <Field id="f-writing-sample" label={p2.f.writingSample}>
              <textarea id="f-writing-sample" className="input !min-h-36 leading-relaxed" maxLength={4000} placeholder={p2.f.writingSamplePh} aria-describedby="f-writing-sample-hint" value={d.extra.writing_sample} onChange={(e) => updateExtra({ writing_sample: e.target.value })} />
              <p id="f-writing-sample-hint" className="hint">{p2.f.writingSampleHint}</p>
            </Field>
            <Field id="f-house-rules" label={p2.f.houseRules}>
              <textarea id="f-house-rules" className="input !min-h-36 leading-relaxed" maxLength={1500} placeholder={p2.f.houseRulesPh} aria-describedby="f-house-rules-hint" value={d.extra.house_rules} onChange={(e) => updateExtra({ house_rules: e.target.value })} />
              <p id="f-house-rules-hint" className="hint">{p2.f.houseRulesHint}</p>
            </Field>
          </div>
        </div>
      </section>

      {/* Targets */}
      <section id="panel-targets" role="tabpanel" aria-labelledby="tab-targets" hidden={tab !== "targets"} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card space-y-4 p-5 rise" aria-labelledby="sec-places">
          {sectionTitle("sec-places", p2.f.places)}
          <CountryPicker
            value={d.extra.places}
            onChange={(v) => update({ extra: { ...d.extra, places: v }, target_locations: placesToLocations(v) })}
          />
          <p className="hint">{p2.places.hint}</p>
        </div>
        <div className="card space-y-4 p-5 rise" aria-labelledby="sec-targets" style={{ ["--i" as string]: 1 }}>
          {sectionTitle("sec-targets", p2.sections.targets)}
          <ChipInput id="f-roles" label={p2.f.roles} values={d.target_roles} onChange={(v) => update({ target_roles: v })} suggestions={ROLE_SUGGESTIONS} showSuggestions placeholder={p2.f.rolesPh} />
          <TypesField value={d.target_types} onChange={(v) => update({ target_types: v })} />
          <AvailabilityField value={d.extra.availability} onChange={(v) => updateExtra({ availability: v })} />
        </div>
      </section>

      {/* Skills & languages */}
      <section id="panel-skills" role="tabpanel" aria-labelledby="tab-skills" hidden={tab !== "skills"} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card space-y-3 p-5 rise" aria-labelledby="sec-skills">
          <div className="flex items-baseline justify-between gap-2">
            {sectionTitle("sec-skills", p2.sections.skills)}
            <span className="text-xs text-muted tabular">{fmt(p2.skills.count, { n: d.skills.length })}</span>
          </div>
          <ChipInput
            id="f-skills"
            label={p2.sections.skills}
            hint={p2.skills.hint}
            values={d.skills}
            onChange={(v) => update({ skills: v })}
            suggestions={SKILL_SUGGESTIONS}
            showSuggestions
            placeholder={p2.skills.ph}
            max={200}
            renderChip={(s) => (
              <select
                aria-label={fmt(p2.skills.levelOf, { s })}
                className="ml-0.5 rounded bg-transparent text-[0.7rem] font-medium text-accent-text outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                value={d.extra.skill_levels[s] ?? ""}
                onChange={(e) => {
                  const lv = { ...d.extra.skill_levels };
                  if (e.target.value) lv[s] = e.target.value as SkillLevel;
                  else delete lv[s];
                  updateExtra({ skill_levels: lv });
                }}
              >
                <option value="">–</option>
                {SKILL_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {p2.skills.levels[l]}
                  </option>
                ))}
              </select>
            )}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => addSkills(extractSkills(cvText))} disabled={!cvText.trim()}>
            <ScanSearch size={14} aria-hidden="true" /> {p2.cv.extract}
          </button>
        </div>
        <div className="card space-y-3 p-5 rise" aria-labelledby="sec-langs" style={{ ["--i" as string]: 1 }}>
          {sectionTitle("sec-langs", p2.sections.languages)}
          <LangsField value={d.extra.langs} onChange={(v) => updateExtra({ langs: v })} />
        </div>
      </section>

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "convert" ? p2.cv.reviewTitle : p2.cv.importTitle}
        description={dialog === "convert" ? p2.cv.reviewHint : p2.cv.importDesc}
        wide
      >
        {dialog && (
          <CvImporter
            key={dialog}
            upload={upload}
            uploadText={uploadText}
            onUploaded={(m, text) => {
              setUpload(m);
              setUploadText(text);
            }}
            skills={d.skills}
            onAddSkills={addSkills}
            hasMarkdown={!!d.cv_md.trim()}
            onSaveMarkdown={saveMarkdown}
            startInReview={dialog === "convert"}
            showUpload={dialog === "import"}
          />
        )}
      </Dialog>
    </>
  );
}

/** Compact completeness ring for the hero. */
function StrengthRing({ score, label }: { score: number; label: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const tone = score >= 75 ? "var(--success)" : score >= 50 ? "var(--accent)" : "var(--saffron)";
  return (
    <span role="img" aria-label={`${label}: ${score}/100`} className="relative grid size-16 place-items-center">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(c * score) / 100} ${c}`} transform="rotate(-90 32 32)" style={{ transition: "stroke-dasharray .6s cubic-bezier(.2,.7,.2,1)" }} />
      </svg>
      <span className="absolute mono text-sm font-semibold" style={{ color: tone }}>{score}</span>
    </span>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function TypesField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useT();
  return (
    <fieldset id="f-types">
      <legend className="label">{t.profile2.f.types}</legend>
      <div className="flex flex-wrap gap-2">
        {JOB_TYPES.map((ty) => (
          <label key={ty} className="chip min-h-8 cursor-pointer !px-3 has-checked:!border-transparent has-checked:!bg-accent-soft has-checked:!text-accent-text">
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              checked={value.includes(ty)}
              onChange={(e) => onChange(e.target.checked ? [...value, ty] : value.filter((x) => x !== ty))}
            />
            {t.jobTypes[ty]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AvailabilityField({ value, onChange }: { value: { from: string; to: string }; onChange: (v: { from: string; to: string }) => void }) {
  const { t } = useT();
  const f = t.profile2.f;
  return (
    <fieldset>
      <legend className="label">{f.availability}</legend>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted" htmlFor="f-av-from">
            {f.availFrom}
          </label>
          <input id="f-av-from" type="date" className="input" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted" htmlFor="f-av-to">
            {f.availTo}
          </label>
          <input id="f-av-to" type="date" className="input" min={value.from || undefined} value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </div>
      </div>
    </fieldset>
  );
}

export function LangsField({ value, onChange }: { value: { name: string; level: Cefr }[]; onChange: (v: { name: string; level: Cefr }[]) => void }) {
  const { t } = useT();
  const l = t.profile2.langs;
  const set = (i: number, patch: Partial<{ name: string; level: Cefr }>) => onChange(value.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <div id="f-langs" className="space-y-2">
      <datalist id="lang-list">
        {LANGUAGE_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {value.length === 0 && <p className="text-sm text-muted">{t.profile2.chips.empty}</p>}
      {value.map((x, i) => (
        <div key={i} className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`lang-${i}`}>
            {l.name}
          </label>
          <input id={`lang-${i}`} list="lang-list" className="input flex-1" value={x.name} onChange={(e) => set(i, { name: e.target.value })} />
          <label className="sr-only" htmlFor={`lang-lv-${i}`}>
            {`${l.level} ${x.name}`}
          </label>
          <select id={`lang-lv-${i}`} className="input !w-auto" value={x.level} onChange={(e) => set(i, { level: e.target.value as Cefr })}>
            {CEFR_LEVELS.map((c) => (
              <option key={c} value={c}>
                {c === "native" ? l.native : c}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={fmt(l.remove, { x: x.name || l.name })} onClick={() => onChange(value.filter((_, k) => k !== i))}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => {
          const next = LANGUAGE_SUGGESTIONS.find((s) => !value.some((v) => v.name.toLowerCase() === s.toLowerCase())) ?? "";
          onChange([...value, { name: next, level: "B2" }]);
          requestAnimationFrame(() => document.getElementById(`lang-${value.length}`)?.focus());
        }}
      >
        <Plus size={14} aria-hidden="true" /> {l.add}
      </button>
      <p className="hint">{l.hint}</p>
    </div>
  );
}
