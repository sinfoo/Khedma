import { pageTitle } from "@/lib/i18n/title";
import Link from "next/link";
import { getDict } from "@/lib/i18n/server";
import { getProfile } from "@/lib/db";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { getCvSourcePref, getUpload } from "@/lib/cv/source";
import { kvGet } from "@/lib/db";
import type { CvReview } from "@/lib/ai/cv-review";
import { ProfileEditor, type DraftState } from "@/components/profile/profile-editor";
import { CopyButton } from "@/components/offers/offer-actions";
import { linkedinDrafts } from "@/lib/cv/linkedin";
import { cvSkills } from "@/lib/repo/sources";
import { EVERYDAY_TOOLS } from "@/lib/search/cv-keywords";

export const generateMetadata = pageTitle("profile");

export default async function ProfilePage() {
  const p = getProfile();
  const { onboarding, ...extra } = getProfileExtra();
  void onboarding;
  const up = getUpload();
  const initial: DraftState = {
    name: p.name,
    email: p.email,
    headline: p.headline,
    cv_md: p.cv_md,
    skills: p.skills,
    target_roles: p.target_roles,
    target_locations: p.target_locations,
    target_types: p.target_types,
    extra,
  };
  const { t, locale } = await getDict();
  // Spoken languages and soft skills stay off the headline: the profile lists them as skills too.
  const li = linkedinDrafts({ ...p, skills: cvSkills(p, "").filter((s) => !EVERYDAY_TOOLS.has(s.toLowerCase())) }, extra, locale === "fr" ? "fr" : "en");
  const L = t.profile2.linkedin;
  return (
    <>
      <ProfileEditor
        initial={initial}
        upload={up ? { fileName: up.fileName, uploadedAt: up.uploadedAt, size: up.size } : null}
        uploadText={up?.text ?? ""}
        initialReview={kvGet<CvReview | null>("cv_review", null)}
        sourcePref={getCvSourcePref()}
      />
      <section className="card mt-6 p-5" aria-labelledby="li-h">
        <h2 id="li-h" className="card-title">{L.title}</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-muted">{L.lead}</p>
        {p.skills.length || p.target_roles.length ? (
          <dl className="mt-4 grid gap-4">
            {([["headline", li.headline], ["about", li.about]] as const).map(([k, text]) => (
              <div key={k}>
                <dt className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{L[k]}</span>
                  <CopyButton text={text} label={L.copy} done={L.copied} />
                </dt>
                <dd className="mt-1.5 rounded-xl bg-surface-2 p-3 text-sm leading-relaxed text-ink-2">{text}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted">{L.empty}</p>
        )}
      </section>
      {/* "Skip setup" is never a dead end: the wizard stays one click away. */}
      <p className="mt-6 text-center text-sm">
        <Link href="/app/welcome" className="text-muted hover:text-ink">{t.profile2.onb.again}</Link>
      </p>
    </>
  );
}
