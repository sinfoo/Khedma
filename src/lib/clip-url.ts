// Client-safe: builds the bookmarklet URL (no database import).
// The whole clipper lives in the bookmark: sites with a strict content security policy (LinkedIn) block a
// script loaded from this app and any request to it, but not opening a Khedma tab (see /app/clip).

/** Reads the job cards visible on the current page (your own session) and opens Khedma with them. */
const CLIPPER = String.raw`
  var host = location.hostname;
  var jobs = [];
  var seen = {};
  function txt(el) { return el ? (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim() : ""; }
  function abs(href) { try { return new URL(href, location.href).href.split("?")[0]; } catch (e) { return ""; } }
  function push(j) { if (j.url && j.title && !seen[j.url]) { seen[j.url] = 1; jobs.push(j); } }

  if (/linkedin\.com$/.test(host)) {
    document.querySelectorAll(".job-card-container, .base-search-card, li.jobs-search-results__list-item, .job-card-list").forEach(function (c) {
      var a = c.querySelector("a.job-card-list__title, a.job-card-container__link, a.base-card__full-link, a[href*='/jobs/view/']");
      push({
        url: a ? abs(a.getAttribute("href")) : "",
        title: txt(c.querySelector(".job-card-list__title, .base-search-card__title, strong")) || txt(a),
        company: txt(c.querySelector(".job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .base-search-card__subtitle, .job-card-container__company-name")),
        location: txt(c.querySelector(".job-card-container__metadata-item, .job-search-card__location, .artdeco-entity-lockup__caption")),
      });
    });
    var det = document.querySelector(".jobs-description__content, .show-more-less-html__markup");
    var h1 = document.querySelector("h1");
    if (det && h1) push({ url: abs(location.href), title: txt(h1), company: txt(document.querySelector(".job-details-jobs-unified-top-card__company-name, .topcard__org-name-link")), location: txt(document.querySelector(".job-details-jobs-unified-top-card__bullet, .topcard__flavor--bullet")), description: txt(det).slice(0, 12000) });
  } else if (/indeed\./.test(host)) {
    document.querySelectorAll(".job_seen_beacon, .cardOutline, .result").forEach(function (c) {
      var a = c.querySelector("h2 a, a.jcs-JobTitle");
      push({ url: a ? abs(a.getAttribute("href")) : "", title: txt(a), company: txt(c.querySelector("[data-testid='company-name'], .companyName")), location: txt(c.querySelector("[data-testid='text-location'], .companyLocation")) });
    });
  } else if (/glassdoor\./.test(host)) {
    document.querySelectorAll("[data-test='jobListing'], li[class*='JobsList_jobListItem']").forEach(function (c) {
      var a = c.querySelector("a[data-test='job-link'], a[class*='JobCard_jobTitle']");
      push({ url: a ? abs(a.getAttribute("href")) : "", title: txt(a), company: txt(c.querySelector("[class*='EmployerProfile_compactEmployerName'], [data-test='emp-name']")), location: txt(c.querySelector("[data-test='emp-location'], [class*='JobCard_location']")) });
    });
  } else if (/jobteaser\./.test(host)) {
    document.querySelectorAll("[data-testid='job-ad-card'], article").forEach(function (c) {
      var a = c.querySelector("a[href*='/job-offers/'], a");
      push({ url: a ? abs(a.getAttribute("href")) : "", title: txt(c.querySelector("h2, h3")) || txt(a), company: txt(c.querySelector("[data-testid='job-ad-card-company'], p")), location: txt(c.querySelector("[data-testid='job-ad-card-location']")) });
    });
  } else if (/welcometothejungle\./.test(host)) {
    document.querySelectorAll("li[data-testid='search-results-list-item-wrapper'], article").forEach(function (c) {
      var a = c.querySelector("a[href*='/jobs/']");
      push({ url: a ? abs(a.getAttribute("href")) : "", title: txt(c.querySelector("h4, h3")) || txt(a), company: txt(c.querySelector("span[class*='wui-text']")), location: txt(c.querySelector("[name='location']")) });
    });
  }
  // Generic fallback: any JobPosting JSON-LD on the page.
  document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
    try {
      var d = JSON.parse(s.textContent);
      var arr = Array.isArray(d) ? d : d["@graph"] ? d["@graph"] : [d];
      arr.forEach(function (x) {
        if (x && /JobPosting/.test(String(x["@type"]))) {
          var loc = x.jobLocation && (x.jobLocation[0] || x.jobLocation);
          var addr = loc && loc.address;
          push({ url: abs(x.url || location.href), title: x.title || "", company: (x.hiringOrganization && x.hiringOrganization.name) || "", location: addr ? [addr.addressLocality, addr.addressCountry].filter(Boolean).join(", ") : "", description: (x.description || "").replace(/<[^>]+>/g, " ").slice(0, 12000), posted_at: x.datePosted || null, deadline: x.validThrough || null });
        }
      });
    } catch (e) {}
  });

  if (!jobs.length) { alert("Khedma : aucune offre détectée sur cette page. Ouvre une page de résultats ou une annonce, puis réessaie."); return; }
  // Sites like LinkedIn forbid loading scripts from, or sending requests to, other origins (CSP), but not
  // opening a page: hand the offers to Khedma in a new tab, in the URL fragment (never sent over the network).
  var list = jobs.slice(0, 60);
  var json = function () { return JSON.stringify({ token: token, site: host, jobs: list }); };
  // Khedma accepts 1 MB per import: shorten long descriptions first (60 x 3000 characters stays far below).
  if (json().length > 800000) list.forEach(function (j) { if (j.description) j.description = j.description.slice(0, 3000); });
  var url = base + "/app/clip#" + encodeURIComponent(json());
  if (!window.open(url, "_blank")) location.href = url;`;

export function bookmarkletHref(base: string, token: string): string {
  const js = `(function(){var base=${JSON.stringify(base)},token=${JSON.stringify(token)};${CLIPPER}})();`;
  return `javascript:${encodeURIComponent(js)}`;
}
