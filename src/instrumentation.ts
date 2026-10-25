declare global {
  var __khedmaAutoTimer: ReturnType<typeof setInterval> | undefined;
}

/**
 * Scheduled scans run even when no Khedma page is open: every 15 minutes the server asks its own scan route for
 * an automatic scan. The route answers 204 unless auto-scan is on (Sources, off by default) and due, so this costs
 * nothing otherwise; going through the route keeps one scan at a time and lets an open radar follow it live.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || globalThis.__khedmaAutoTimer) return;
  const tick = () =>
    fetch(`http://127.0.0.1:${process.env.PORT ?? "3000"}/api/sources/scan`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"trigger":"auto"}' })
      .then((r) => r.body?.cancel())
      .catch(() => {}); // server still starting, or stopped
  globalThis.__khedmaAutoTimer = setInterval(tick, 15 * 60_000);
  globalThis.__khedmaAutoTimer.unref?.();
}
