// Seeds the throwaway E2E database (KHEDMA_DB) with one profile, one offer and one application with documents.
// Refuses to touch the real data folder.
import path from "node:path";
import { rmSync } from "node:fs";

const target = process.env.KHEDMA_DB ?? "";
if (!target || path.resolve(target).startsWith(path.resolve("data"))) {
  console.error("e2e/seed: KHEDMA_DB must point outside ./data");
  process.exit(1);
}
rmSync(path.dirname(target), { recursive: true, force: true });

void (async () => {
  const db = await import("../src/lib/db");
  db.updateProfile({
    name: "Amira Ben Salah",
    email: "amira@example.tn",
    headline: "Élève ingénieure en informatique, ENIT",
    skills: ["React", "Node.js", "Python", "SQL"],
    cv_md: "# Amira Ben Salah\n+216 22 333 444 · amira@example.tn · Tunis\n\n## Expérience\n**Vermeg** · Stagiaire développeuse · juillet 2025 - août 2025\n- Tableau de bord React pour le suivi des transactions.\n\n## Formation\n**ENIT** · Cycle ingénieur en informatique · 2024 - 2027\n",
  });
  const { id: jobId } = db.upsertJob({
    title: "Stage PFE Développeur Full Stack",
    company: "Acme Tunisie",
    location: "Tunis, Tunisie",
    remote: false,
    url: "https://example.com/jobs/1",
    source: "manual",
    type: "pfe",
    description: "Stage PFE de 6 mois. React, Node.js, SQL. Gratification 800 DT par mois.",
    tags: ["React", "Node.js"],
    posted_at: null,
    deadline: null,
  });
  const app = db.ensureApplication(jobId);
  db.updateApplication(app.id, {
    cv_md: "# Amira Ben Salah\n+216 22 333 444 · amira@example.tn · Tunis\n\n## Profil\nÉlève ingénieure ENIT, React et Node.js en production.\n\n## Expérience\n**Vermeg** · Stagiaire développeuse · juillet 2025 - août 2025\n- Tableau de bord React pour le suivi des transactions.\n",
    cover_letter_md: "**Amira Ben Salah**\namira@example.tn\n\n[Date]\n\nAcme Tunisie\nTunis\n\nMadame, Monsieur,\n\nVotre stage PFE en développement full stack correspond au travail que je mène avec React et Node.js.\n\nAmira Ben Salah\n",
  });
  console.log(`e2e/seed: application ${app.id} ready`);
})();
