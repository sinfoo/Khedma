// Popup: reads the data from your local Khedma (allowed by host_permissions), then runs fill.js in the tab.
const $ = (id) => document.getElementById(id);
const out = (s) => ($("out").textContent = s);

chrome.storage.local.get(["base", "token"], (s) => {
  if (s.base) $("base").value = s.base;
  if (s.token) $("token").value = s.token;
  if (!s.token) document.querySelector("details").open = true;
});
for (const id of ["base", "token"]) $(id).addEventListener("change", () => chrome.storage.local.set({ [id]: $(id).value.trim() }));

$("fill").addEventListener("click", async () => {
  const base = $("base").value.trim().replace(/\/$/, "");
  const token = $("token").value.trim();
  if (!token) return out("Colle d'abord le code d'accès (Réglages).");
  $("fill").disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || "")) return out("Ouvre le formulaire de candidature, puis réessaie.");
    let res;
    try {
      res = await fetch(`${base}/api/extension/fill?url=${encodeURIComponent(tab.url)}`, { headers: { "x-khedma-token": token } });
    } catch {
      return out("Khedma injoignable : lance l'application (npm run dev) puis réessaie.");
    }
    if (res.status === 403) return out("Code d'accès refusé : recopie-le depuis Khedma.");
    if (!res.ok) return out(`Erreur Khedma (${res.status}).`);
    const data = await res.json();
    // Every frame (some boards embed the form in an iframe); if a frame is out of reach, the page alone.
    const run = async (allFrames) => {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames }, files: ["fill.js"] });
      return chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames }, func: (d) => globalThis.__khedmaFill(d), args: [data] });
    };
    const results = await run(true).catch(() => run(false));
    const filled = results.reduce((n, r) => n + (r.result?.filled ?? 0), 0);
    const missed = results.flatMap((r) => r.result?.missed ?? []);
    out(
      [
        data.job ? `Candidature : ${data.job.title}, ${data.job.company}` : "Aucune candidature Khedma pour cette page : profil seulement.",
        `${filled} champ(s) rempli(s), encadrés en bleu.`,
        missed.length ? `À remplir toi-même : ${missed.join(" · ")}` : "",
        "Vérifie tout, puis envoie toi-même.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } catch (e) {
    out(`Impossible de remplir cette page (${e.message}).`);
  } finally {
    $("fill").disabled = false;
  }
});
