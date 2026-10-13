import { test } from "node:test";
import assert from "node:assert/strict";
import { countryOf, fitsPlaces, placesToLocations, REMOTE_CODE } from "./geo";

test("countryOf maps Tunisian cities, countries and remote", () => {
  assert.equal(countryOf("Lac 2, Tunis"), "TN");
  assert.equal(countryOf("Technopole El Ghazala, Ariana"), "TN");
  assert.equal(countryOf("Paris, Île-de-France"), "FR");
  assert.equal(countryOf("Berlin, Germany"), "DE");
  assert.equal(countryOf("Montréal, QC"), "CA");
  assert.equal(countryOf("Remote - Europe"), REMOTE_CODE);
  assert.equal(countryOf("Somewhere unknown"), null);
  assert.equal(countryOf(""), null);
});

test("fitsPlaces keeps chosen countries, remote per preference, unknown locations", () => {
  const places = { countries: ["TN", "FR"], remote: "yes" as const };
  assert.ok(fitsPlaces({ location: "Sfax", remote: false }, places));
  assert.ok(fitsPlaces({ location: "Lyon", remote: false }, places));
  assert.ok(!fitsPlaces({ location: "Berlin", remote: false }, places));
  assert.ok(fitsPlaces({ location: "Berlin", remote: true }, places));
  assert.ok(fitsPlaces({ location: "", remote: false }, places));
  assert.ok(!fitsPlaces({ location: "Berlin", remote: true }, { countries: ["TN"], remote: "no" }));
  assert.ok(!fitsPlaces({ location: "Tunis", remote: false }, { countries: ["TN"], remote: "only" }));
  assert.ok(fitsPlaces({ location: "Tunis", remote: true }, { countries: ["TN"], remote: "only" }));
  assert.ok(fitsPlaces({ location: "Berlin", remote: false }, { countries: [], remote: "yes" }));
});

test("placesToLocations gives readable free-text locations", () => {
  assert.deepEqual(placesToLocations({ countries: ["TN", "FR"], cities: ["Sfax"], remote: "yes" }), ["Sfax", "France", "Remote"]);
  assert.deepEqual(placesToLocations({ countries: ["DE"], cities: [], remote: "no" }), ["Allemagne"]);
});
