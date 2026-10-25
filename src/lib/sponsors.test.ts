import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNlRegister, parseUkRegister, sponsorKey } from "./sponsors";

test("sponsor names match across legal suffixes and quoting", () => {
  assert.equal(sponsorKey("ACME LIMITED"), sponsorKey("Acme Ltd"));
  assert.equal(sponsorKey("Acme Holding B.V."), "acme");
  assert.equal(sponsorKey("Branos Oxford Ltd T/A Lilo"), "branos oxford");
  assert.deepEqual(parseUkRegister('Organisation Name,Town/City\n AaruvikA Limited,Edinburgh\n"Smith, Jones & Co",London\n'), ["AaruvikA Limited", "Smith, Jones & Co"]);
  assert.deepEqual(parseNlRegister('<tr><th scope="row">10X Genomics B.V.</th><td>1</td></tr><tr><th scope="row">A &amp; B</th></tr>'), ["10X Genomics B.V.", "A & B"]);
});
