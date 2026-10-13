/**
 * Re-mounts on every navigation inside /app, so the page content plays a
 * short enter animation (CSS only; honours prefers-reduced-motion).
 * ponytail: React <ViewTransition> was tried and dropped — it throws
 * "Transition was aborted" on overlapping navigations; revisit when stable.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
