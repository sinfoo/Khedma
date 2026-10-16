import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyReply, extractDate, extractInterviewer, extractRound, extractTime } from "./reply";

const ref = new Date("2026-10-13T10:00:00");

test("FR interview invitation with date, time, link and interviewer", () => {
  const r = classifyReply(
    "Bonjour, suite à votre candidature, nous souhaitons vous convoquer à un entretien technique le mardi 20 octobre à 14h30 avec Mme Sarra Ben Ali. Lien : https://meet.google.com/abc-defg-hij. Merci de confirmer vos disponibilités.",
    ref,
  );
  assert.equal(r.kind, "interview");
  assert.equal(r.suggested_stage, "interview");
  assert.equal(r.extracted.date, "2026-10-20");
  assert.equal(r.extracted.time, "14:30");
  assert.equal(r.extracted.link, "https://meet.google.com/abc-defg-hij");
  assert.equal(r.extracted.interviewer, "Mme Sarra Ben Ali");
  assert.equal(r.extracted.round, "technical");
  assert.ok(r.confidence >= 0.6);
});

test("EN rejection wins over interview vocabulary", () => {
  const r = classifyReply("Thank you for taking the time to interview with us. Unfortunately, we have decided to move forward with other candidates.", ref);
  assert.equal(r.kind, "rejected");
  assert.equal(r.suggested_stage, "rejected");
});

test("FR rejection", () => {
  const r = classifyReply("Nous avons le regret de vous informer que votre candidature n'a pas été retenue.", ref);
  assert.equal(r.kind, "rejected");
});

test("offer", () => {
  const r = classifyReply("We are pleased to offer you the Software Engineering Internship. The start date would be 2027-02-01 with a monthly gratification of 900 DT.", ref);
  assert.equal(r.kind, "offer");
  assert.equal(r.suggested_stage, "offer");
  assert.equal(r.extracted.date, "2027-02-01");
});

test("acknowledgement is responded; job alert is noise", () => {
  assert.equal(classifyReply("Nous avons bien reçu votre candidature et nous reviendrons vers vous prochainement.", ref).kind, "responded");
  assert.equal(classifyReply("Voici vos nouvelles offres recommandées cette semaine. Se désabonner.", ref).kind, "noise");
  assert.equal(classifyReply("", ref).kind, "noise");
});

test("date and time parsing shapes", () => {
  assert.equal(extractDate("on October 5th at 9am", ref), "2026-10-05");
  assert.equal(extractDate("le 3 janvier", ref), "2027-01-03");
  assert.equal(extractDate("le 25/10/2026", ref), "2026-10-25");
  assert.equal(extractDate("no date here", ref), null);
  assert.equal(extractTime("at 2pm"), "14:00");
  assert.equal(extractTime("à 9h"), "09:00");
  assert.equal(extractTime("at 10:15 am"), "10:15");
  assert.equal(extractTime("nothing"), null);
  assert.equal(extractInterviewer("Interview with John Doe from the team"), "John Doe");
  assert.equal(extractInterviewer("un échange avec notre équipe"), null);
  assert.equal(extractRound("a 30-minute phone screen with HR"), "hr");
  assert.equal(extractRound("final round on-site"), "final");
});
