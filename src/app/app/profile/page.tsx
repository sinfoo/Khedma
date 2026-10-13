import type { Metadata } from "next";
import { getDict } from "@/lib/i18n/server";
import { getProfile } from "@/lib/db";
import { JOB_TYPES } from "@/lib/types";
import { saveProfile } from "@/app/actions/profile";
import { SaveButton } from "@/components/save-button";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { t } = await getDict();
  const p = getProfile();
  const lines = (a: string[]) => a.join("\n");

  return (
    <>
      <PageHeader title={t.profile.title} lead={t.profile.cvHint} />
      <form action={saveProfile} className="grid lg:grid-cols-[360px_1fr] gap-8 items-start">
        <div className="space-y-6">
          <fieldset className="card p-5 rise" style={{ ["--i" as string]: 1 }}>
            <legend className="sr-only">{t.profile.identity}</legend>
            <h2 className="text-xl mb-4">{t.profile.identity}</h2>
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="name">{t.profile.name}</label>
                <input id="name" name="name" className="input" defaultValue={p.name} autoComplete="name" />
              </div>
              <div>
                <label className="label" htmlFor="email">{t.profile.email}</label>
                <input id="email" name="email" type="email" className="input" defaultValue={p.email} autoComplete="email" />
              </div>
              <div>
                <label className="label" htmlFor="headline">{t.profile.headline}</label>
                <input id="headline" name="headline" className="input" defaultValue={p.headline} placeholder={t.profile.headlinePh} />
              </div>
              <div>
                <label className="label" htmlFor="languages">{t.profile.languages}</label>
                <input id="languages" name="languages" className="input" defaultValue={p.languages.join(", ")} />
              </div>
            </div>
          </fieldset>

          <fieldset className="card p-5 rise" style={{ ["--i" as string]: 2 }}>
            <legend className="sr-only">{t.profile.targets}</legend>
            <h2 className="text-xl mb-4">{t.profile.targets}</h2>
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="target_roles">{t.profile.roles}</label>
                <textarea id="target_roles" name="target_roles" className="input !min-h-20" defaultValue={lines(p.target_roles)} placeholder={t.profile.rolesPh} />
              </div>
              <div>
                <label className="label" htmlFor="target_locations">{t.profile.locations}</label>
                <textarea id="target_locations" name="target_locations" className="input !min-h-20" defaultValue={lines(p.target_locations)} placeholder={t.profile.locationsPh} />
              </div>
              <fieldset>
                <legend className="label">{t.profile.types}</legend>
                <div className="flex flex-wrap gap-2">
                  {JOB_TYPES.map((ty) => (
                    <label key={ty} className="chip cursor-pointer min-h-6 has-checked:bg-accent-soft has-checked:text-accent-text has-checked:border-transparent">
                      <input type="checkbox" name="target_types" value={ty} defaultChecked={p.target_types.includes(ty)} className="accent-[var(--accent)]" />
                      {t.jobTypes[ty]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </fieldset>

          <fieldset className="card p-5 rise" style={{ ["--i" as string]: 3 }}>
            <legend className="sr-only">{t.profile.skills}</legend>
            <h2 className="text-xl mb-1">{t.profile.skills}</h2>
            <p className="hint mb-3">{t.profile.skillsHint}</p>
            <label className="sr-only" htmlFor="skills">{t.profile.skills}</label>
            <textarea id="skills" name="skills" className="input !min-h-32" defaultValue={lines(p.skills)} placeholder={t.profile.skillsPh} />
          </fieldset>
        </div>

        <div className="card p-5 rise flex flex-col min-h-[70vh]" style={{ ["--i" as string]: 2 }}>
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="text-xl">{t.profile.cv}</h2>
              <p className="hint">{t.profile.importPdfHint}</p>
            </div>
            <SaveButton label={t.common.save} savedLabel={t.common.saved} />
          </div>
          <label className="sr-only" htmlFor="cv_md">{t.profile.cv}</label>
          <textarea
            id="cv_md"
            name="cv_md"
            className="input mono text-sm flex-1 !min-h-[60vh]"
            defaultValue={p.cv_md}
            placeholder={t.profile.cvPh}
            spellCheck={false}
          />
        </div>
      </form>
    </>
  );
}
