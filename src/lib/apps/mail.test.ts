import { test } from "node:test";
import assert from "node:assert/strict";
import { emailText, parseEml } from "./mail";

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
