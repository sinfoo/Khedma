import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type Evaluation, type Job, type Profile } from "../types";
import { likelyConcerns } from "./concerns";

const job: Job = {
  id: 1, title: "Backend developer", company: "Acme", location: "Sfax", remote: false, url: "", source: "manual", type: "emploi",
  description: "We need 3 years of experience with Kubernetes. Fluent German required.", tags: [], posted_at: null, deadline: null,
  created_at: "", archived: false, starred: false,
} as Job;
const profile: Profile = {
  id: 1, name: "", email: "", headline: "", skills: ["Python"], target_roles: [], target_locations: ["Tunis"], target_types: ["emploi"],
  languages: ["Français", "English"], settings: DEFAULT_SETTINGS,
  cv_md: "## Projects\n- Deployed a Flask API with Docker on a university server for 200 students",
};

test("concerns: requirement gaps rank first, then experience, language, location", () => {
  const ev = { requirements: [{ text: "Kubernetes", importance: "critical", evidence: "stated", met: "no", proof: "" }] } as unknown as Evaluation;
  const c = likelyConcerns(job, profile, ev, "en");
  assert.equal(c[0].severity, "dealbreaker");
  assert.match(c[0].concern, /Kubernetes/);
  assert.ok(c.some((x) => /3\+ years/.test(x.concern)));
  assert.ok(c.some((x) => /German/.test(x.concern)));
  assert.ok(!c.some((x) => /English/.test(x.concern)));
  assert.equal(c[c.length - 1].severity, "minor");
  assert.match(c[c.length - 1].concern, /Sfax/);
});

test("concerns: without an evaluation, missing posting skills become concerns", () => {
  const c = likelyConcerns(job, profile, null, "fr");
  assert.ok(c.some((x) => /Kubernetes/.test(x.concern)));
});
