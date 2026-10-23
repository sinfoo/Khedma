import { test } from "node:test";
import assert from "node:assert/strict";
import { emailText, parseEml, parseMbox, splitMbox } from "./mail";

const EML = [
  "From: =?UTF-8?Q?Sarra_B=C3=A9n_Ali?= <sarra@vermeg.com>",
  "To: safwen@example.tn",
  "Subject: =?UTF-8?B?Q29udm9jYXRpb24gw6AgdW4gZW50cmV0aWVu?=",
  "Date: Thu, 22 Oct 2026 10:15:00 +0100",
  "MIME-Version: 1.0",
  'Content-Type: multipart/alternative; boundary="b1"',
  "",
  "--b1",
  "Content-Type: text/plain; charset=UTF-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Bonjour Safwen,",
  "Nous souhaitons vous rencontrer pour un entretien le 29/10 =C3=A0 14h.",
  "--b1",
  "Content-Type: text/html; charset=UTF-8",
  "",
  "<p>Bonjour Safwen</p>",
  "--b1--",
  "",
].join("\r\n");

test("a saved recruiter e-mail becomes headers + body text", async () => {
  const e = await parseEml(new TextEncoder().encode(EML).buffer as ArrayBuffer);
  const text = emailText(e, "fr");
  assert.match(text, /^De : Sarra Bén Ali <sarra@vermeg\.com>\nObjet : Convocation à un entretien\nDate : /);
  assert.match(text, /entretien le 29\/10 à 14h\./);
  assert.equal(emailText({ html: "<p>Hello <b>there</b></p>" }, "en"), "\nHello there");
});

test("an mbox export splits into its messages, newest first, each in its own charset", async () => {
  const enc = new TextEncoder();
  const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
  const parts = [
    enc.encode("From sarra@vermeg.com Mon Oct 19 09:00:00 2026\nFrom: Sarra <sarra@vermeg.com>\nSubject: Accuse de reception\nDate: Mon, 19 Oct 2026 09:00:00 +0100\n\nBien recu.\n>From the team\n\n"),
    latin1("From rh@acme.tn Thu Oct 22 10:00:00 2026\nFrom: RH Acme <rh@acme.tn>\nSubject: Entretien\nDate: Thu, 22 Oct 2026 10:00:00 +0100\nContent-Type: text/plain; charset=iso-8859-1\n\nNous souhaitons vous rencontrer pour un entretien le 29/10 \u00e0 14h.\n"),
  ];
  const box = new Uint8Array(parts[0].length + parts[1].length);
  box.set(parts[0]);
  box.set(parts[1], parts[0].length);
  assert.equal(splitMbox(box).length, 2, '">From" inside a body does not split');
  const msgs = await parseMbox(box.buffer);
  assert.deepEqual(msgs.map((m) => m.subject), ["Entretien", "Accuse de reception"]);
  assert.match(msgs[0].text ?? "", /entretien le 29\/10 à 14h/);
  assert.match(msgs[1].text ?? "", />From the team/);
});
