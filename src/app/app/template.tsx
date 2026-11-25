/**
 * Re-mounts on every navigation inside /app, so the page content plays one short fade (CSS only, opacity only;
 * honours prefers-reduced-motion). The cards' own `.rise` does the rest.
 * ponytail: React <ViewTransition> was tried and dropped: it throws "Transition was aborted" on overlapping
 * navigations; revisit when stable.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
