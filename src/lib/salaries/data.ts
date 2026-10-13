// Indicative Tunisian pay bands for engineering students and juniors.
// Compiled from public job posts, school internship guides and peer reports (2024–2026).
// They are orders of magnitude, not a survey: always check real offers.

export const FAMILIES = ["software", "data", "embedded", "network", "industrial", "civil"] as const;
export type Family = (typeof FAMILIES)[number];

export const LEVELS = ["summer", "pfe", "junior"] as const;
export type Level = (typeof LEVELS)[number];

export const TIERS = ["tunis", "coastal", "other"] as const;
export type Tier = (typeof TIERS)[number];

/** Monthly amounts in TND for Grand Tunis. Internships are a "gratification", not a salary (no CNSS/IRPP). */
export const TUNIS_BANDS: Record<Family, Record<Level, [number, number]>> = {
  software: { summer: [300, 600], pfe: [400, 800], junior: [1600, 2800] },
  data: { summer: [300, 600], pfe: [400, 800], junior: [1700, 3000] },
  embedded: { summer: [300, 500], pfe: [350, 700], junior: [1500, 2600] },
  network: { summer: [300, 500], pfe: [300, 700], junior: [1500, 2600] },
  industrial: { summer: [250, 450], pfe: [300, 600], junior: [1300, 2200] },
  civil: { summer: [200, 400], pfe: [300, 550], junior: [1200, 2000] },
};

/** Share of summer internships that are unpaid, roughly. */
export const SUMMER_UNPAID_SHARE = 0.6;

/** Regional factor applied to Tunis bands (Sfax / Sousse / Monastir vs the rest of the country). */
export const TIER_FACTOR: Record<Tier, number> = { tunis: 1, coastal: 0.9, other: 0.8 };

/** Remote work for a foreign company (junior, monthly, EUR, usually invoiced as a freelancer or via an export company). */
export const REMOTE_EUR: Record<Family, [number, number]> = {
  software: [800, 1800],
  data: [900, 2000],
  embedded: [800, 1600],
  network: [700, 1500],
  industrial: [600, 1200],
  civil: [600, 1100],
};

export const DEFAULT_EUR_TND = 3.4;
