import { randomBytes } from "node:crypto";
import { kvGet, kvSet } from "./db";

/** Per-install secret embedded in the clipper bookmarklet; guards the cross-origin import route. */
export function clipToken(): string {
  let t = kvGet<string>("clip_token", "");
  if (!t) {
    t = randomBytes(12).toString("hex");
    kvSet("clip_token", t);
  }
  return t;
}

/** The bookmarklet: loads /khedma-clipper.js from this app with the token attached. */
export function bookmarkletHref(base: string, token: string): string {
  const js = `(function(){window.__khedmaClip={base:${JSON.stringify(base)},token:${JSON.stringify(token)}};var s=document.createElement('script');s.src=${JSON.stringify(base + "/khedma-clipper.js")}+'?v='+Date.now();document.body.appendChild(s);})();`;
  return `javascript:${encodeURIComponent(js)}`;
}
