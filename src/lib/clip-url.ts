// Client-safe: builds the bookmarklet URL (no database import).
/** The bookmarklet: loads /khedma-clipper.js from this app with the token attached. */
export function bookmarkletHref(base: string, token: string): string {
  const js = `(function(){window.__khedmaClip={base:${JSON.stringify(base)},token:${JSON.stringify(token)}};var s=document.createElement('script');s.src=${JSON.stringify(base + "/khedma-clipper.js")}+'?v='+Date.now();document.body.appendChild(s);})();`;
  return `javascript:${encodeURIComponent(js)}`;
}
