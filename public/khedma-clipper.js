/* Khedma clipper: reads the job cards visible on the current page (your own browser session)
   and sends them to your local Khedma. Runs only when you click the bookmarklet. */
(function () {
  var cfg = window.__khedmaClip || {};
  var base = cfg.base || "http://localhost:3000";
  var token = cfg.token || "";
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
  var badge = document.createElement("div");
  badge.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;background:#0b5cad;color:#fff;font:600 14px system-ui;padding:12px 16px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3)";
  badge.textContent = "Khedma : envoi de " + jobs.length + " offre(s)…";
  document.body.appendChild(badge);
  fetch(base + "/api/offers/clip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: token, site: host, jobs: jobs.slice(0, 60) }) })
    .then(function (r) { return r.json(); })
    .then(function (d) { badge.textContent = "Khedma : " + (d.added || 0) + " nouvelle(s) offre(s) importée(s)" + (d.known ? " · " + d.known + " déjà connue(s)" : ""); badge.style.background = "#17703f"; setTimeout(function () { badge.remove(); }, 5000); })
    .catch(function () { badge.textContent = "Khedma injoignable : lance l'application (npm run dev) puis réessaie."; badge.style.background = "#b3261e"; setTimeout(function () { badge.remove(); }, 6000); });
})();
