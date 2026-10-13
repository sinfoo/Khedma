import { ViewTransition } from "react";

/**
 * Re-mounts on every navigation inside /app, so the page content plays an
 * enter animation; <ViewTransition> adds a cross-fade between the old and new
 * page in browsers that support the View Transitions API.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition default="vt-page">
      <div className="page-enter">{children}</div>
    </ViewTransition>
  );
}
