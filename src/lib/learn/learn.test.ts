import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifyFields, courseHaystack, parseDuration, searchWords } from "./model";
import { mapFunMooc, mapMicrosoft } from "./sources";
import { deslug, edxCourse, mapEdraak, mapMit, mapSkills, parseCoupon, parseSitemap, parseSkillsPage } from "./sources-more";
import type { NewCourse } from "./model";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-learn-")), "test.db");
const fixture = (name: string) => JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8"));

test("fields cover every kind of learning, from languages to game dev", () => {
  assert.deepEqual(classifyFields("Allemand A1 pour débutants"), ["languages"]);
  assert.deepEqual(classifyFields("Unity 3D game development"), ["gamedev"]);
  assert.deepEqual(classifyFields("Adobe Photoshop for graphic design"), ["design"]);
  assert.ok(classifyFields("Deep Learning with PyTorch").includes("ai"));
  assert.ok(classifyFields("Gestion de projet agile").includes("business"));
  assert.ok(classifyFields("SolidWorks pour la mécanique").includes("engineering"));
  assert.ok(!classifyFields("Community management").includes("gamedev"), "\"unity\" is not inside \"community\"");
});

test("durations in English and French", () => {
  assert.equal(parseDuration("1 hour 30 minutes"), 90);
  assert.equal(parseDuration("24 heures"), 1440);
  assert.equal(parseDuration("6 semaines"), 1080);
  assert.equal(parseDuration(""), null);
});

test("search words match word starts only", () => {
  const h = courseHaystack({ title: "Community building", provider: "X", description: "", skills: [] });
  assert.ok(!h.includes(` ${searchWords("unity")[0]}`));
  assert.ok(courseHaystack({ title: "Unity for beginners", provider: "X", description: "", skills: [] }).includes(" unity"));
  assert.deepEqual(searchWords("C++ et Node.js"), ["c++", "et", "node", "js"]);
});

test("the official catalogs map to courses with honest price and certificate", () => {
  const ms = mapMicrosoft(fixture("microsoft.json"));
  assert.equal(ms.length, 4);
  assert.equal(ms[0].price, "free");
  assert.ok(!ms[0].url.includes("WT.mc_id"));
  assert.deepEqual([ms[3].price, ms[3].cert], ["paid", "proctored"], "a certification ends in a proctored exam");
  const fun = mapFunMooc(fixture("funmooc.json"));
  assert.equal(fun.length, 2);
  assert.ok(fun[0].url.startsWith("https://www.fun-mooc.fr/"));
});

test("search, filters and recommendations work on the stored catalog", async () => {
  const { replaceCourses, searchCourses, catalogCounts } = await import("./store");
  const { recommendCourses } = await import("./recommend");
  const c = (title: string, over: Partial<NewCourse> = {}): NewCourse => ({
    source: "test", title, url: `https://e.x/${encodeURIComponent(title)}`, provider: "P", description: "", fields: classifyFields(title), skills: [], level: null,
    duration_min: 600, languages: ["en"], price: "free", cert: "none", image: null, updated_at: null, expires_at: null, ...over,
  });
  replaceCourses("test", [
    c("Docker for beginners", { skills: ["Docker"] }),
    c("Docker certified associate", { skills: ["Docker"], price: "paid", cert: "proctored" }),
    c("Kubernetes en français", { skills: ["Kubernetes"], languages: ["fr"] }),
    c("Community management"),
    c("Old Docker session", { skills: ["Docker"], expires_at: "2000-01-01" }),
  ]);
  assert.deepEqual(searchCourses({ q: "docker" }).courses.map((x) => x.title), ["Docker for beginners", "Docker certified associate"], "expired session hidden, free first");
  assert.equal(searchCourses({ q: "unity" }).total, 0);
  assert.equal(searchCourses({ q: "docker", price: "paid" }).total, 1);
  assert.equal(searchCourses({ lang: "fr" }).courses[0].title, "Kubernetes en français");
  assert.equal(catalogCounts().total, 5);
  const recs = recommendCourses({ gaps: [{ skill: "Docker", demand: 4 }, { skill: "Kubernetes", demand: 2 }], roles: ["DevOps intern"], have: ["Python"], lang: "fr" });
  assert.equal(recs[0].course.title, "Docker for beginners");
  assert.ok(recs.some((r) => r.course.title === "Kubernetes en français"));
  assert.ok(!recs.some((r) => r.course.title === "Community management"));
});

test("sitemaps, MIT Learn, Edraak, Skills Boost and Udemy coupons map to courses", () => {
  assert.equal(deslug("intro-to-machine-learning-with-aws"), "Intro to Machine Learning with AWS");
  const sm = parseSitemap(`<urlset><url><loc>https://alison.com/course/japanese-language</loc><lastmod>2026-10-01T00:00:00Z</lastmod><image:image><image:caption>Japanese Language &amp; Scripts</image:caption></image:image></url><url><loc>https://www.edx.org/learn/python/harvard-university-cs50-s-introduction-to-programming-with-python</loc></url></urlset>`);
  assert.deepEqual(sm[0], { loc: "https://alison.com/course/japanese-language", lastmod: "2026-10-01", caption: "Japanese Language & Scripts" });
  const ex = edxCourse(sm[1])!;
  assert.equal(ex.source, "edx");
  assert.ok(ex.fields.includes("programming"));

  const mit = mapMit([{ title: "Linear Algebra", url: "https://ocw.mit.edu/courses/18-06", description: "Matrices", offered_by: { name: "OCW" }, free: true, certification: false, topics: [{ name: "Mathematics" }], runs: [{ duration: "14 weeks" }] }]);
  assert.deepEqual([mit[0].price, mit[0].cert, mit[0].provider], ["free", "none", "MIT · OCW"]);
  assert.ok(mit[0].fields.includes("science"));

  const ed = mapEdraak([{ name_ar: "حقوق المرأة", name_en: "Women's Rights", course_url: "https://www.edraak.org/courses/x/info", level: "entry", effort: 2, category: { name_en: "Humanities" } }]);
  assert.deepEqual([ed[0].languages, ed[0].level, ed[0].duration_min], [["ar"], "beginner", 120]);

  const page = parseSkillsPage(`<x pagedSearchResults='{&quot;searchResults&quot;:[{&quot;type&quot;:&quot;course&quot;,&quot;title&quot;:&quot;Manage Kubernetes&quot;,&quot;path&quot;:&quot;/course_templates/783?rank=1&quot;,&quot;duration&quot;:&quot;30 minutes&quot;,&quot;level&quot;:&quot;intermediate&quot;,&quot;credentialType&quot;:&quot;skill_badge&quot;}],&quot;resultsCount&quot;:1330}'>`);
  assert.equal(page.total, 1330);
  const sk = mapSkills(page.items);
  assert.deepEqual([sk[0].url, sk[0].duration_min, sk[0].cert], ["https://www.skills.google/course_templates/783", 30, "completion"]);

  const html = String.raw`x\"language\":\"English\",\"duration\":\"1h 24m\",\"couponUrl\":\"https://www.udemy.com/course/rise-360/?couponCode=FREE\",\"is100PercentOff\":true,\"isExpired\":false,\"lastVerifiedAt\":\"$D2026-10-26T16:01:29.307Z\"}`;
  const c = parseCoupon(html, "rise-360")!;
  assert.deepEqual([c.url, c.verified, c.language], ["https://www.udemy.com/course/rise-360/?couponCode=FREE", "2026-10-26T16:01:29.307Z", "English"]);
  assert.equal(parseCoupon(html.replace('"isExpired\\":false', '"isExpired\\":true').replace("false", "true"), "rise-360"), null, "an expired coupon is dropped");
  assert.equal(parseCoupon(html, "other-course"), null);
});

test("recommendations draw from every catalog, and short words match whole words", async () => {
  const { replaceCourses, searchCourses } = await import("./store");
  const { recommendCourses } = await import("./recommend");
  const c = (source: string, title: string, i: number): NewCourse => ({
    source, title, url: `https://${source}.x/${i}`, provider: source, description: "Python mentioned in passing", fields: [], skills: [], level: null,
    duration_min: null, languages: ["en"], price: "free", cert: "none", image: null, updated_at: null, expires_at: null,
  });
  replaceCourses("first", Array.from({ length: 500 }, (_, i) => c("first", `Course ${i}`, i)));
  replaceCourses("second", [c("second", "Python for data analysis", 1)]);
  const recs = recommendCourses({ gaps: [{ skill: "Python", demand: 5 }], roles: [], have: [], lang: "en" });
  assert.equal(recs[0].course.source, "second", "a strong title match from a later catalog wins");
  replaceCourses("third", [c("third", "AI for everyone", 1), c("third", "First aid at work", 2)]);
  assert.deepEqual(searchCourses({ q: "ai", source: "third" }).courses.map((x) => x.title), ["AI for everyone"]);
});
