import { test } from "node:test";
import assert from "node:assert/strict";
import { BANK, TRACKS, type BankQuestion } from "./bank";
import {
  aggregate,
  inferTrack,
  mapStories,
  matchStory,
  parseTranscript,
  mulberry32,
  nextDrillState,
  orderDrill,
  scoreAnswer,
  selectQuestions,
  storyStrength,
  toSessionQuestion,
  type DrillState,
} from "./logic";
import { extractSkills } from "../ai/heuristic";

test("bank: at least 120 bilingual questions with unique ids and hints in both languages", () => {
  assert.ok(BANK.length >= 120);
  assert.equal(new Set(BANK.map((q) => q.id)).size, BANK.length);
  for (const q of BANK) {
    assert.ok(q.fr && q.en, q.id);
    assert.ok(q.hints.fr.length >= 2 && q.hints.fr.length === q.hints.en.length, q.id);
  }
});

test("selection: respects type, track and level, never repeats", () => {
  for (const track of TRACKS) {
    for (const count of [5, 8, 12]) {
      const qs = selectQuestions(BANK, { track, kind: "technical", level: 2, count, rand: mulberry32(count) });
      assert.equal(qs.length, count, `${track} ${count}`);
      assert.equal(new Set(qs.map((q) => q.id)).size, count);
      assert.ok(qs.every((q) => q.type === "technical"));
    }
  }
  const hr = selectQuestions(BANK, { track: "pfe", kind: "hr", level: 1, count: 8, rand: mulberry32(1) });
  assert.equal(hr[0].id, "intro-pitch");
  assert.ok(hr.every((q) => q.type !== "technical"));
  assert.ok(hr.every((q) => q.tracks.includes("pfe")));
  assert.ok(hr.slice(1).every((q) => q.level === 1), "exact level preferred when enough exist");

  const emb = selectQuestions(BANK, { track: "embedded", kind: "technical", level: 1, count: 5, rand: mulberry32(3) });
  assert.ok(emb.every((q) => q.tracks.includes("embedded") && q.level === 1));
});

test("selection: mixed sessions alternate soft and technical and avoid recent ids when possible", () => {
  const first = selectQuestions(BANK, { track: "junior", kind: "mixed", level: 2, count: 8, rand: mulberry32(7) });
  const tech = first.filter((q) => q.type === "technical").length;
  assert.equal(tech, 4);
  assert.equal(first[0].id, "intro-pitch");
  const exclude = new Set(first.map((q) => q.id).filter((id) => id !== "intro-pitch"));
  const second = selectQuestions(BANK, { track: "junior", kind: "mixed", level: 2, count: 8, exclude, rand: mulberry32(8) });
  assert.ok(second.every((q) => !exclude.has(q.id)));
});

test("selection: falls back gracefully when the pool is small", () => {
  const tiny: BankQuestion[] = BANK.filter((q) => q.type === "technical").slice(0, 3);
  const qs = selectQuestions(tiny, { track: "netsec", kind: "technical", level: 3, count: 12 });
  assert.equal(qs.length, 3);
  assert.equal(new Set(qs.map((q) => q.id)).size, 3);
});

const behavioral = toSessionQuestion(BANK.find((q) => q.id === "team-conflict")!, "fr");

test("scorer: a strong STAR answer beats a vague one on every dimension", () => {
  const strong = scoreAnswer({
    question: behavioral,
    skillsIn: extractSkills,
    answer: `Lors de mon projet de fin d'année à l'ENIT, en deuxième année, nous étions 4 sur une application React et Node.js.
Je devais livrer le module de paiement en 3 semaines, mais deux coéquipiers n'étaient pas d'accord sur l'architecture.
J'ai organisé une réunion de 30 minutes, j'ai proposé de comparer les deux solutions avec un petit prototype et j'ai réparti les tâches.
Résultat : nous avons livré à temps, la note finale était de 16/20, et j'ai appris à trancher avec des faits plutôt qu'avec des opinions.`,
  });
  const weak = scoreAnswer({ question: behavioral, skillsIn: extractSkills, answer: "Euh, en fait on a eu un problème, du coup on a parlé et voilà, ça s'est bien passé genre." });
  for (const d of ["structure", "relevance", "specificity", "communication"] as const) assert.ok(strong.scores[d] > weak.scores[d], d);
  assert.ok(strong.overall >= 3.5, `strong overall ${strong.overall}`);
  assert.ok(weak.overall <= 2.5, `weak overall ${weak.overall}`);
  assert.ok(strong.signals.star.s && strong.signals.star.t && strong.signals.star.a && strong.signals.star.r);
  assert.ok(weak.tips.some((t) => t.code === "fillers"));
  assert.ok(weak.tips.some((t) => t.code === "add_result" || t.code === "too_short"));
});

test("scorer: technical answers reward definition, example and trade-off; empty answers score 1", () => {
  const q = toSessionQuestion(BANK.find((x) => x.id === "sql-joins")!, "en");
  const good = scoreAnswer({
    question: q,
    answer:
      "An INNER JOIN is a join that keeps only the rows that match in both tables. A LEFT JOIN keeps all rows of the left table and fills NULLs otherwise. For example, to list clients without orders I used a LEFT JOIN and filtered on orders.id IS NULL. However, a WHERE condition on the right table silently turns it back into an inner join, so the condition goes in the ON clause.",
  });
  const noTrade = scoreAnswer({ question: q, answer: "INNER JOIN returns matching rows. LEFT JOIN returns all rows from the left table plus the matching rows." });
  assert.ok(good.scores.structure > noTrade.scores.structure);
  assert.ok(noTrade.tips.some((t) => t.code === "add_tradeoff" || t.code === "add_example"));
  const empty = scoreAnswer({ question: q, answer: "  " });
  assert.equal(empty.overall, 1);
  assert.equal(empty.tips[0].code, "empty");
});

test("scorer: flags 'we' over 'I' and links to the posting skills", () => {
  const r = scoreAnswer({
    question: behavioral,
    postingSkills: ["Docker", "Kubernetes"],
    skillsIn: extractSkills,
    answer: "We had a conflict in our team. We discussed it together and we decided as a team, our solution was fine and we delivered our project with our teacher.",
  });
  assert.ok(r.tips.some((t) => t.code === "use_i"));
  assert.ok(r.tips.some((t) => t.code === "link_posting"));
});

test("track inference from postings", () => {
  assert.equal(inferTrack("Stage PFE Développeur embarqué STM32"), "embedded");
  assert.equal(inferTrack("Ingénieur Data Scientist junior"), "data");
  assert.equal(inferTrack("Stagiaire administration réseau"), "netsec");
  assert.equal(inferTrack("Développeur Full Stack", "", "pfe"), "pfe");
  assert.equal(inferTrack("Software engineer"), "junior");
});

test("spaced repetition: grades move boxes and due cards come first", () => {
  const now = new Date("2026-10-13T10:00:00Z");
  const a = nextDrillState(null, "a", "knew", now);
  assert.equal(a.box, 1);
  const a2 = nextDrillState(a, "a", "knew", now);
  assert.equal(a2.box, 2);
  assert.equal(nextDrillState(a2, "a", "no", now).box, 1);
  const states = new Map<string, DrillState>([
    ["due", { question_id: "due", box: 2, due_at: "2026-10-12T00:00:00Z", reviews: 2 }],
    ["later", { question_id: "later", box: 4, due_at: "2026-10-20T00:00:00Z", reviews: 4 }],
  ]);
  const order = orderDrill([{ id: "later" }, { id: "new" }, { id: "due" }], states, now, 3).map((c) => c.id);
  assert.deepEqual(order, ["due", "new", "later"]);
});

test("stories: strength meter and matching", () => {
  const empty = storyStrength({ title: "", situation: "", task: "", action: "", result: "", tags: [], skills: [] });
  assert.ok(empty.score < 10 && empty.gaps.includes("result_number"));
  const story = {
    id: 1,
    title: "Conflit d'architecture en projet d'équipe",
    situation: "Projet de deuxième année à l'ENIT, équipe de quatre étudiants sur une application web.",
    task: "Je devais livrer le module de paiement en trois semaines malgré un désaccord.",
    action: "J'ai organisé une réunion, j'ai proposé un prototype pour comparer les deux options et réparti les tâches.",
    result: "Livraison à temps, note de 16/20, et l'équipe a adopté la méthode pour la suite.",
    tags: ["conflit", "équipe"],
    skills: ["React"],
  };
  const strong = storyStrength(story);
  assert.ok(strong.score >= 85, `score ${strong.score}`);
  assert.equal(matchStory([story], behavioral)?.id, 1);
  assert.equal(matchStory([story], toSessionQuestion(BANK.find((q) => q.id === "sql-joins")!, "fr")), null);
});

test("report aggregation: averages, best/worst and top improvements", () => {
  const s = (v: number) => ({ structure: v, relevance: v, specificity: v, communication: v, credibility: v, differentiation: v });
  const agg = aggregate([
    { idx: 0, skipped: false, scores: s(4), overall: 4, tips: [{ code: "add_numbers" }] },
    { idx: 1, skipped: false, scores: s(2), overall: 2, tips: [{ code: "add_numbers" }, { code: "fillers", detail: "euh" }] },
    { idx: 2, skipped: true, scores: null, overall: null, tips: [] },
  ]);
  assert.equal(agg.overall, 3);
  assert.equal(agg.best?.idx, 0);
  assert.equal(agg.worst?.idx, 1);
  assert.equal(agg.skipped, 1);
  assert.equal(agg.improvements[0].code, "add_numbers");
});

test("credibility and differentiation: own CV facts beat clichés and \"we\"", () => {
  const q = { text: "Tell me about a project you are proud of", type: "behavioral" as const, hints: [] };
  const cliche = scoreAnswer({
    question: q,
    cvTerms: ["SmartFarm", "Sagemcom"],
    answer: "We are a passionate and motivated team. We worked hard on things and we were dynamic, maybe it went well I think, our team was detail-oriented.",
  });
  const own = scoreAnswer({
    question: q,
    cvTerms: ["SmartFarm", "Sagemcom"],
    answer:
      "During my internship at Sagemcom I had to cut the SmartFarm sensor gateway latency. I profiled the MQTT pipeline, I rewrote the batching in C and I tested it on 40 devices. As a result latency dropped from 900 ms to 120 ms and the team adopted it.",
  });
  assert.ok(own.scores.differentiation >= 3.5, `own diff ${own.scores.differentiation}`);
  assert.ok(cliche.scores.differentiation <= 2, `cliche diff ${cliche.scores.differentiation}`);
  assert.ok(own.scores.credibility > cliche.scores.credibility);
  assert.ok(cliche.tips.some((t) => t.code === "be_distinct"));
  assert.deepEqual(own.signals.cvHits.sort(), ["Sagemcom", "SmartFarm"]);
});

test("story map: one story per question, reuse flagged, gaps listed", () => {
  const mk = (id: number, title: string, tags: string[]) => ({ id, title, situation: title, task: "", action: "", result: "", tags, skills: [] });
  const conflict = mk(1, "Désaccord sur l'architecture du projet", ["conflit", "équipe"]);
  const deadline = mk(2, "Livraison sous délai serré", ["délai", "pression"]);
  const m = mapStories([conflict, deadline], [
    "Parlez d'un conflit dans une équipe",
    "Un délai serré sous pression ?",
    "Un autre conflit en équipe ?",
    "Pourquoi notre entreprise ?",
  ]);
  assert.equal(m.rows[0].story?.id, 1);
  assert.equal(m.rows[1].story?.id, 2);
  assert.equal(m.rows[2].story?.id, 1);
  assert.equal(m.rows[2].reused, true);
  assert.deepEqual(m.gaps, ["Pourquoi notre entreprise ?"]);
  assert.equal(m.unused.length, 0);
});

test("transcript: labelled, Q/A and named speakers", () => {
  const a = parseTranscript("Interviewer: Tell me about yourself.\nMe: I am a final-year student.\nI built a robot.\nInterviewer: Why us?\nMe: Your product.");
  assert.deepEqual(a, [
    { question: "Tell me about yourself.", answer: "I am a final-year student. I built a robot." },
    { question: "Why us?", answer: "Your product." },
  ]);
  const b = parseTranscript("[00:01] Sarra (RH): Présentez-vous.\n[00:05] Amine: Je suis élève ingénieur.\nSarra (RH): Disponibilités ?\nAmine: Dès juin.");
  assert.equal(b.length, 2);
  assert.equal(b[1].answer, "Dès juin.");
  assert.equal(parseTranscript("Q: unanswered").length, 0);
});
