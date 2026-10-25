import { test } from "node:test";
import assert from "node:assert/strict";
import { matchBreakdown } from "./match";
import { evergreenReasons } from "./evergreen";

const job = (title: string, description: string, type: "stage" | "emploi" = "stage") => ({ title, description, type, tags: [] as string[] });

test("CV match explains each check and leaves out the ones it cannot compare", () => {
  const m = matchBreakdown(job("Stage Data Engineer", "Python, SQL, Docker et Kafka requis."), { target_roles: ["Data engineer"] }, "Projets en Python et SQL.", ["intern", "entry"]);
  const skills = m.lines.find((l) => l.kind === "skills");
  assert.ok(skills && skills.kind === "skills");
  assert.deepEqual(skills.found, ["Python", "SQL"]);
  assert.equal(skills.missing.length, 2);
  assert.equal(m.lines.find((l) => l.kind === "title")?.ratio, 1);
  assert.equal(m.lines.find((l) => l.kind === "seniority")?.ratio, 1);
  assert.equal(m.pct, Math.round(((2 / 4 + 1 + 1) / 3) * 100));

  // No skills in the posting, no target role, no level wording: nothing is scored as 0.
  const empty = matchBreakdown(job("Chargé de projet", "Rejoignez-nous.", "emploi"), { target_roles: ["stage"] }, "CV", ["intern"]);
  assert.deepEqual(empty.skipped, ["skills", "title", "seniority"]);
  assert.equal(empty.pct, null);

  const senior = matchBreakdown(job("Senior Backend Developer", "", "emploi"), { target_roles: [] }, "", ["intern", "entry"]);
  assert.equal(senior.lines[0].kind === "seniority" && senior.lines[0].level, "senior");
  assert.equal(senior.pct, 0);
});

test("skills named only as nice to have do not lower the CV match", () => {
  const en = matchBreakdown(
    job("Backend Intern", "Requirements:\n- Python and SQL\n\nNice to have\n- Docker, Kubernetes\n\nWhat we offer\n- Mentoring"),
    { target_roles: [] }, "Python, SQL", ["intern"],
  );
  const s = en.lines[0];
  assert.ok(s.kind === "skills");
  assert.equal(s.ratio, 1);
  assert.deepEqual(s.missing, []);
  assert.deepEqual(s.optional.sort(), ["Docker", "Kubernetes"]);

  // Inline French phrasing; "Profil souhaité" heads the required profile and stays counted.
  const fr = matchBreakdown(job("Stage Data", "Profil souhaité : Python et SQL. Une connaissance de Docker serait un plus."), { target_roles: [] }, "Python", ["intern"]);
  const f = fr.lines[0];
  assert.ok(f.kind === "skills");
  assert.deepEqual(f.missing, ["SQL"]);
  assert.deepEqual(f.optional, ["Docker"]);
  assert.equal(f.ratio, 0.5);
});

test("evergreen hint needs a curated phrase or repeated postings", () => {
  assert.deepEqual(evergreenReasons("Rejoignez notre vivier de talents : candidature spontanée bienvenue.", 1).map((r) => r.kind === "phrase" && r.phrase), ["candidature spontanee", "vivier"]);
  assert.deepEqual(evergreenReasons("We are always hiring great engineers", 3), [{ kind: "phrase", phrase: "always hiring" }, { kind: "reposts", n: 3 }]);
  assert.deepEqual(evergreenReasons("Stage PFE de 6 mois", 2), []);
});
