/** A public, machine-readable feed of scholarship calls that its publisher allows programs to read. */
export interface Feed {
  /** Stable slug, e.g. "euraxess-funding". */
  id: string;
  label: string;
  url: string;
  format: "rss" | "atom" | "json";
  /** Main language of the items, ISO 639-1. */
  lang: string;
  /** What the feed covers, in a few words. */
  scope: string;
  /** Date the feed last answered with items, YYYY-MM-DD. */
  checked: string;
}

export const FEEDS: Feed[] = [];
