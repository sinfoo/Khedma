/* Khedma Fill: runs in the form's page when the popup asks. Fills empty text fields only, never submits,
   never touches files, checkboxes, radios, passwords or anything it cannot match with confidence.
   Label lookup and the native value setter follow averatec0773/offeros (Apache-2.0). */
(function () {
  // Order matters: "Nom et prénom" is the full name before it is a first name.
  var RULES = [
    ["name", /full.?name|^\s*(your\s+)?name\s*\*?\s*$|nom complet|nom et pr[ée]nom|pr[ée]nom et nom/i],
    ["first", /first.?name|given.?name|pr[ée]nom/i],
    ["last", /last.?name|family.?name|surname|nom de famille|^\s*nom\s*\*?\s*$/i],
    ["email", /e-?mail|courriel/i],
    ["phone", /phone|t[ée]l[ée]phone|mobile|portable|\btel\b/i],
    ["linkedin", /linkedin/i],
    ["github", /github/i],
    ["portfolio", /portfolio|website|site (web|internet|personnel)|personal (site|url)/i],
    ["city", /^\s*(current\s+)?(city|location|ville|localisation)\b/i],
    ["school", /school|university|universit[ée]|[ée]cole|[ée]tablissement/i],
    ["letter", /cover.?letter|lettre de motivation/i],
  ];
  var AUTOCOMPLETE = { name: "name", "given-name": "first", "family-name": "last", email: "email", tel: "phone", "address-level2": "city" };

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }

  /** The field a label means, or null. */
  function classify(label) {
    for (var i = 0; i < RULES.length; i++) if (RULES[i][1].test(label)) return RULES[i][0];
    return null;
  }

  /** The saved answer whose question is this label (same words, or one containing the other). */
  function answerFor(label, answers) {
    var l = norm(label);
    if (l.length < 12) return null;
    for (var i = 0; i < answers.length; i++) {
      var q = norm(answers[i].question);
      if (q.length >= 12 && (q === l || q.indexOf(l) >= 0 || l.indexOf(q) >= 0)) return answers[i].answer;
    }
    return null;
  }

  function labelOf(el) {
    var t = "";
    if (el.labels && el.labels.length) t = el.labels[0].innerText;
    if (!t && el.getAttribute("aria-labelledby")) {
      var ref = document.getElementById(el.getAttribute("aria-labelledby").split(" ")[0]);
      if (ref) t = ref.innerText;
    }
    return (t || el.getAttribute("aria-label") || el.placeholder || el.name || el.id || "").replace(/\s+/g, " ").trim();
  }

  /** React, Vue and plain forms all see the change: native setter, then input and change events. */
  function setValue(el, v) {
    var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.style.outline = "2px solid #2f5a8a";
    el.style.outlineOffset = "1px";
  }

  function fill(data) {
    var filled = 0;
    var missed = [];
    var fields = document.querySelectorAll("input, textarea");
    for (var i = 0; i < fields.length; i++) {
      var el = fields[i];
      var type = (el.getAttribute("type") || "text").toLowerCase();
      if (el.tagName === "INPUT" && ["text", "email", "tel", "url", "search", ""].indexOf(type) < 0) continue;
      if (el.disabled || el.readOnly || el.value.trim() || el.offsetParent === null) continue;
      var label = labelOf(el);
      var auto = AUTOCOMPLETE[(el.getAttribute("autocomplete") || "").toLowerCase()];
      var key = classify(label) || auto;
      var value = key ? data[key] : null;
      if (!value) value = answerFor(label, data.answers || []);
      if (value) {
        setValue(el, value);
        filled++;
      } else if (el.tagName === "TEXTAREA" || el.required) missed.push(label);
    }
    return { filled: filled, missed: missed.slice(0, 12) };
  }

  globalThis.__khedmaFill = fill;
  // For the unit test (node): the pure parts.
  if (typeof module !== "undefined") module.exports = { classify: classify, answerFor: answerFor, norm: norm };
})();
