"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Loader2, Monitor, Moon, RefreshCw, Sun, WifiOff, Wand2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { setLocale, setTheme } from "@/app/actions/prefs";
import { aiStatus, finishOnboarding, saveProfileDraft, setOnboardingStep } from "@/app/actions/profile";
import { ROLE_SUGGESTIONS, mergeSkills, suggestHeadline } from "@/lib/cv/model";
import { ChipInput } from "./chip-input";
import { CountryPicker } from "@/components/country-picker";
import { placesToLocations } from "@/lib/geo";
import { CvImporter } from "./cv-importer";
import type { UploadMeta } from "./cv-upload";
import { AvailabilityField, TypesField, type DraftState } from "./profile-editor";

const STEPS = ["prefs", "you", "cv", "targets", "ai"] as const;
const LEVELS = {
  fr: ["Cycle préparatoire", "1re année ingénieur", "2e année ingénieur", "3e année ingénieur (PFE)", "Mastère"],
  en: ["Preparatory cycle", "1st year engineering", "2nd year engineering", "3rd year engineering (PFE)", "Master's"],
};
const SPECIALTIES = [
  "Génie informatique",
  "Génie électrique",
  "Génie industriel",
  "Génie mécanique",
  "Génie civil",
  "Génie hydraulique et environnement",
  "Télécommunications (TIC)",
];

type Theme = "system" | "light" | "dark";

export function OnboardingWizard({
  initial,
  initialStep,
  upload: initialUpload,
  uploadText: initialUploadText,
  theme: initialTheme,
}: {
  initial: DraftState;
  initialStep: number;
  upload: UploadMeta | null;
  uploadText: string;
  theme: Theme;
}) {
  const { t, locale } = useT();
  const o = t.profile2.onb;
  const p2 = t.profile2;
  const toast = useToast();
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [step, setStep] = useState(Math.min(STEPS.length, Math.max(1, initialStep)));
  const [upload, setUpload] = useState(initialUpload);
  const [uploadText, setUploadText] = useState(initialUploadText);
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  const key = STEPS[step - 1];
  const update = (patch: Partial<DraftState>) => setD((x) => ({ ...x, ...patch }));
  const updateExtra = (patch: Partial<DraftState["extra"]>) => setD((x) => ({ ...x, extra: { ...x.extra, ...patch } }));

  const go = (n: number, persist: boolean) =>
    start(async () => {
      if (persist) await saveProfileDraft(d);
      await setOnboardingStep(n);
      setStep(n);
    });

  const finish = (persist: boolean) =>
    start(async () => {
      if (persist) await saveProfileDraft(d);
      await finishOnboarding();
      if (persist) toast.success(o.toast, o.toastBody);
      router.push("/app");
    });

  const suggestion = suggestHeadline(locale, d.extra, d.target_types.includes("pfe"));

  const STEP_HINTS: Record<(typeof STEPS)[number], string> = { prefs: o.prefs.hint, you: o.you.hint, cv: o.cv.hint, targets: o.targets.hint, ai: o.ai.hint };

  return (
    <div className="mx-auto grid max-w-[980px] gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10">
      <aside className="lg:sticky lg:top-[84px] lg:self-start">
        <p className="eyebrow mb-1.5 text-accent-text">{o.welcome}</p>
        <h1 className="text-[1.6rem] leading-[1.15] tracking-[-0.02em]">{o.title}</h1>
        <ol aria-label={o.progress} className="mt-[22px] flex flex-col gap-1">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "current" : "todo";
            return (
              <li key={s}>
                <button
                  type="button"
                  disabled={n > step || pending}
                  aria-current={state === "current" ? "step" : undefined}
                  onClick={() => go(n, false)}
                  className={`flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left disabled:cursor-default ${state === "current" ? "bg-accent-soft" : "enabled:hover:bg-surface-2"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`mono grid size-[26px] shrink-0 place-items-center rounded-full text-[0.72rem] font-semibold transition-colors ${
                      state === "done" ? "bg-success text-white" : state === "current" ? "bg-accent text-accent-ink" : "bg-surface-3 text-ink-2"
                    }`}
                  >
                    {state === "done" ? <Check size={13} /> : n}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm ${state === "current" ? "font-semibold text-ink" : state === "done" ? "font-medium text-ink-2" : "font-medium text-muted"}`}>{o.steps[s]}</span>
                    <span className="block truncate text-[0.72rem] text-muted">{STEP_HINTS[s]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="bar mt-[18px] !h-1" role="progressbar" aria-label={o.progress} aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step}>
          <span style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }} />
        </div>
        <button type="button" className="mt-3.5 text-[0.8rem] text-muted hover:text-ink" disabled={pending} onClick={() => finish(false)}>
          {o.skipAll}
        </button>
      </aside>

      <form
        className="card flex min-h-[460px] flex-col p-5 sm:p-[30px]"
        style={{ animation: "pop .3s cubic-bezier(.2,.7,.2,1) both" }}
        aria-labelledby="step-h"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length) go(step + 1, true);
          else finish(true);
        }}
      >
        <p className="text-[0.75rem] font-semibold text-muted">{step} / {STEPS.length}</p>
        <h2 id="step-h" ref={heading} tabIndex={-1} className="mt-1.5 text-[1.5rem] leading-tight tracking-[-0.02em] outline-none">
          {o.steps[key]}
        </h2>
        <p className="mt-1.5 mb-5 text-muted">{key === "prefs" ? o.prefs.intro : key === "you" ? o.you.intro : key === "cv" ? o.cv.intro : key === "targets" ? o.targets.intro : o.ai.intro}</p>

        {key === "prefs" && (
          <div className="space-y-6">
            <fieldset>
              <legend className="label">{t.common.language}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["fr", "Français", "Interface en français"],
                    ["en", "English", "Interface in English"],
                  ] as const
                ).map(([v, name, sub]) => (
                  <label key={v} className="card flex cursor-pointer items-center gap-3 p-3.5 has-checked:!border-accent has-checked:!bg-accent-soft">
                    <input type="radio" name="lang" className="accent-[var(--accent)]" checked={locale === v} onChange={() => start(() => setLocale(v))} />
                    <span lang={v}>
                      <span className="block font-semibold">{name}</span>
                      <span className="block text-sm text-muted">{sub}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">{t.common.theme}</legend>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["system", Monitor],
                    ["light", Sun],
                    ["dark", Moon],
                  ] as const
                ).map(([v, Icon]) => (
                  <label key={v} className="card flex cursor-pointer flex-col items-center gap-1.5 p-3.5 has-checked:!border-accent has-checked:!bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-[var(--ring)]">
                    <input
                      type="radio"
                      name="theme"
                      className="sr-only"
                      checked={theme === v}
                      onChange={() => {
                        setThemeState(v);
                        start(() => setTheme(v));
                      }}
                    />
                    <Icon size={20} aria-hidden="true" />
                    <span className="text-sm font-medium">{t.common[v]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {key === "you" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <F id="w-name" label={p2.f.name}>
              <input id="w-name" className="input" autoComplete="name" value={d.name} onChange={(e) => update({ name: e.target.value })} />
            </F>
            <F id="w-email" label={p2.f.email}>
              <input id="w-email" type="email" className="input" autoComplete="email" value={d.email} onChange={(e) => update({ email: e.target.value })} />
            </F>
            <F id="w-school" label={p2.f.school}>
              <input id="w-school" className="input" value={d.extra.school} onChange={(e) => updateExtra({ school: e.target.value })} />
            </F>
            <F id="w-level" label={p2.f.level}>
              <input id="w-level" list="w-level-list" className="input" placeholder={p2.f.levelPh} value={d.extra.level} onChange={(e) => updateExtra({ level: e.target.value })} />
              <datalist id="w-level-list">
                {LEVELS[locale].map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </F>
            <div className="sm:col-span-2">
              <F id="w-spec" label={p2.f.specialty}>
                <input id="w-spec" list="w-spec-list" className="input" placeholder={p2.f.specialtyPh} value={d.extra.specialty} onChange={(e) => updateExtra({ specialty: e.target.value })} />
                <datalist id="w-spec-list">
                  {SPECIALTIES.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </F>
            </div>
            <div className="sm:col-span-2">
              <F id="w-headline" label={p2.f.headline}>
                <textarea id="w-headline" className="input !min-h-20" placeholder={p2.f.headlinePh} value={d.headline} onChange={(e) => update({ headline: e.target.value })} />
              </F>
              {suggestion && suggestion !== d.headline && (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-surface-2 p-2.5 text-sm" aria-live="polite">
                  <Wand2 size={14} className="mt-1 shrink-0 text-accent-text" aria-hidden="true" />
                  <p className="flex-1 text-ink-2">
                    <span className="chip mr-1.5">{p2.f.suggestion}</span>
                    {suggestion}
                  </p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => update({ headline: suggestion })}>
                    {p2.f.useSuggestion}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {key === "cv" && (
          <CvImporter
            upload={upload}
            uploadText={uploadText}
            onUploaded={(m, text, markdown, skills) => {
              setUpload(m);
              setUploadText(text);
              // The server already saved the converted CV and skills; keep them in the draft so "Continue" does not overwrite them.
              if (markdown && markdown.trim().length > 40) update({ cv_md: markdown, ...(skills ? { skills } : {}) });
            }}
            skills={d.skills}
            onAddSkills={(found) => {
              const skills = mergeSkills(d.skills, found);
              update({ skills });
              start(async () => {
                await saveProfileDraft({ skills });
              });
              toast.success(fmt(p2.cv.skillsAdded, { n: skills.length - d.skills.length }));
            }}
            hasMarkdown={!!d.cv_md.trim()}
            onSaveMarkdown={async (md) => {
              update({ cv_md: md });
              await saveProfileDraft({ cv_md: md });
              toast.success(p2.cv.savedMd);
            }}
          />
        )}

        {key === "targets" && (
          <div className="space-y-5">
            <ChipInput
              id="w-roles"
              label={p2.f.roles}
              hint={o.targets.rolesHint}
              values={d.target_roles}
              onChange={(v) => update({ target_roles: v })}
              suggestions={ROLE_SUGGESTIONS}
              showSuggestions
              placeholder={p2.f.rolesPh}
            />
<div>
              <p className="label">{p2.f.places}</p>
              <CountryPicker
                value={d.extra.places}
                onChange={(v) => {
                  update({ extra: { ...d.extra, places: v }, target_locations: placesToLocations(v) });
                }}
              />
              <p className="hint">{p2.places.hint}</p>
            </div>
            <TypesField value={d.target_types} onChange={(v) => update({ target_types: v })} />
            <AvailabilityField value={d.extra.availability} onChange={(v) => updateExtra({ availability: v })} />
          </div>
        )}

        {key === "ai" && <AiStep />}

        <p className="mt-auto pt-5 text-xs text-muted">{o.resume}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {step > 1 ? (
            <button type="button" className="btn btn-outline !h-10" disabled={pending} onClick={() => go(step - 1, false)}>
              <ArrowLeft size={15} aria-hidden="true" /> {o.back}
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2">
            {step < STEPS.length && (
              <button type="button" className="btn btn-ghost !h-10 text-muted" disabled={pending} onClick={() => go(step + 1, false)}>
                {o.skip}
              </button>
            )}
            <button type="submit" className={`btn !h-10 !px-[18px] ${step < STEPS.length ? "btn-primary" : "btn-saffron"}`} disabled={pending} aria-busy={pending}>
              {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {step < STEPS.length ? o.next : o.finish}
              {!pending && <ArrowRight size={15} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function F({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function AiStep() {
  const { t } = useT();
  const a = t.profile2.onb.ai;
  const toast = useToast();
  const [s, setS] = useState<Awaited<ReturnType<typeof aiStatus>> | null>(null);
  const [checking, start] = useTransition();
  const check = () =>
    start(async () => {
      setS(await aiStatus());
    });
  useEffect(() => {
    let live = true;
    aiStatus().then((r) => live && setS(r));
    return () => {
      live = false;
    };
  }, []);

  const keyLine = "ANTHROPIC_API_KEY=...";
  const copy = (c: string) => navigator.clipboard?.writeText(c).then(() => toast.success(a.copied, c));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-4" aria-live="polite">
        {!s || checking ? (
          <>
            <Loader2 size={18} className="animate-spin text-muted" aria-hidden="true" /> <span>{a.checking}</span>
          </>
        ) : s.online ? (
          <>
            <CheckCircle2 size={18} className="text-success" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">{a.online}</p>
              <p className="text-sm text-muted mono">{s.engine.replace("claude:", "")}</p>
            </div>
          </>
        ) : (
          <>
            <WifiOff size={18} className="text-saffron" aria-hidden="true" />
            <p className="flex-1 font-semibold">{a.offline}</p>
          </>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={check} disabled={checking}>
          <RefreshCw size={14} aria-hidden="true" /> {a.recheck}
        </button>
      </div>

      {s && !s.online && (
        <div className="rounded-xl bg-surface-2 p-4">
          <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
            {a.installTitle}
          </h3>
          <ol className="mt-3 space-y-3 text-sm">
            <li>
              <span className="mr-1.5 tabular font-semibold">1.</span>
              {a.s1}
            </li>
            <li>
              <p className="mb-1.5">
                <span className="mr-1.5 tabular font-semibold">2.</span>
                {a.s2}
              </p>
              <div className="flex items-center gap-2">
                <code className="mono flex-1 overflow-x-auto rounded-lg border border-line bg-surface px-3 py-2 text-[0.82rem]">{keyLine}</code>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`${a.copy}: ${keyLine}`} onClick={() => copy(keyLine)}>
                  <Copy size={14} aria-hidden="true" />
                </button>
              </div>
            </li>
            <li>
              <span className="mr-1.5 tabular font-semibold">3.</span>
              {a.s3}
            </li>
          </ol>
        </div>
      )}
      {s && !s.online && (
        <button type="submit" className="btn btn-secondary">
          <WifiOff size={16} aria-hidden="true" /> {a.offlineMode}
        </button>
      )}
      <p className="text-sm text-muted">{a.offlineNote}</p>
    </div>
  );
}
