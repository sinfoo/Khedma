import type { Metadata } from "next";
import { getProfile } from "@/lib/db";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import { getCvSourcePref, getUpload } from "@/lib/cv/source";
import { kvGet } from "@/lib/db";
import type { CvReview } from "@/lib/ai/cv-review";
import { ProfileEditor, type DraftState } from "@/components/profile/profile-editor";

export const metadata: Metadata = { title: "Profile" };

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
  return (
    <ProfileEditor
      initial={initial}
      upload={up ? { fileName: up.fileName, uploadedAt: up.uploadedAt, size: up.size } : null}
      uploadText={up?.text ?? ""}
      initialReview={kvGet<CvReview | null>("cv_review", null)}
      sourcePref={getCvSourcePref()}
    />
  );
}
