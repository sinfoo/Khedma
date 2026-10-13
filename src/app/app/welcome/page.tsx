import type { Metadata } from "next";
import { getProfile } from "@/lib/db";
import { getTheme } from "@/lib/i18n/server";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { getUpload } from "@/lib/cv/source";
import { OnboardingWizard } from "@/components/profile/onboarding-wizard";

export const metadata: Metadata = { title: "Bienvenue" };

export default async function WelcomePage() {
  const p = getProfile();
  const { onboarding, ...extra } = getProfileExtra();
  const up = getUpload();
  const theme = await getTheme();
  return (
    <OnboardingWizard
      initial={{
        name: p.name,
        email: p.email,
        headline: p.headline,
        cv_md: p.cv_md,
        skills: p.skills,
        target_roles: p.target_roles,
        target_locations: p.target_locations,
        target_types: p.target_types,
        extra,
      }}
      initialStep={onboarding.done ? 1 : onboarding.step}
      upload={up ? { fileName: up.fileName, uploadedAt: up.uploadedAt, size: up.size } : null}
      uploadText={up?.text ?? ""}
      theme={theme}
    />
  );
}
