// Look of the sent CV and letter (print page, PDF, preview). Pure and client-safe.
// Designs, presets and tokens follow Reactive Resume (MIT) — persian, scizor, kakuna, smeargle and its
// density / margin / size / accent presets — redone as CSS variables over our markdown sheet.

export const DOC_TEMPLATES = ["classic", "persian", "scizor", "kakuna", "smeargle"] as const;
export type DocTemplate = (typeof DOC_TEMPLATES)[number];
export const DOC_FONTS = ["sans", "carlito", "tinos", "serif"] as const;
export type DocFont = (typeof DOC_FONTS)[number];
export const DOC_DENSITIES = ["compact", "normal", "roomy"] as const;
export type DocDensity = (typeof DOC_DENSITIES)[number];
export const DOC_MARGINS = ["narrow", "normal", "wide"] as const;
export type DocMargins = (typeof DOC_MARGINS)[number];
/** Moss, ink blue, teal, plum, rust, burgundy, ochre, graphite: all dark enough on white. */
export const DOC_ACCENTS = ["#3E6B4F", "#2F5A8A", "#1F6E73", "#6B3E6E", "#A0442A", "#8A2C3F", "#7A5A12", "#3B3F45"] as const;

export interface DocStyle {
  template: DocTemplate;
  accent: string;
  font: DocFont;
  density: DocDensity;
  /** Body size in pt, 9-12.5 by 0.5. */
  size: number;
  margins: DocMargins;
  /** Shrink spacing, then margins, then size (never under 9pt) so a slightly long CV fits one page. */
  fit: boolean;
}

export const DEFAULT_DOC_STYLE: DocStyle = { template: "classic", accent: "#2F5A8A", font: "sans", density: "normal", size: 10.5, margins: "normal", fit: true };

const DENSITY = { compact: { lh: 1.35, gap: 4 }, normal: { lh: 1.5, gap: 6 }, roomy: { lh: 1.65, gap: 8 } } as const;
/** Page margins in mm (x, y). */
export const MARGIN_MM = { narrow: [12, 10], normal: [16, 14], wide: [21, 18] } as const;

const pick = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);

export function normalizeDocStyle(raw: unknown): DocStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const size = Math.round(Number(r.size) * 2) / 2;
  return {
    template: pick(r.template, DOC_TEMPLATES, DEFAULT_DOC_STYLE.template),
    accent: (DOC_ACCENTS as readonly string[]).includes(String(r.accent)) ? String(r.accent) : DEFAULT_DOC_STYLE.accent,
    font: pick(r.font, DOC_FONTS, DEFAULT_DOC_STYLE.font),
    density: pick(r.density, DOC_DENSITIES, DEFAULT_DOC_STYLE.density),
    size: size >= 9 && size <= 12.5 ? size : DEFAULT_DOC_STYLE.size,
    margins: pick(r.margins, DOC_MARGINS, DEFAULT_DOC_STYLE.margins),
    fit: r.fit === undefined ? DEFAULT_DOC_STYLE.fit : r.fit === true,
  };
}

/** CSS custom properties for `.doc-sheet`. Fonts point at variables set by the print page's next/font loaders. */
export function docStyleVars(s: DocStyle): Record<string, string> {
  const d = DENSITY[s.density];
  const font = { sans: "var(--font-sans)", carlito: "var(--font-carlito), Calibri, sans-serif", tinos: "var(--font-tinos), 'Times New Roman', serif", serif: "var(--font-source-serif), Georgia, serif" }[s.font];
  return { "--doc-accent": s.accent, "--doc-fs": `${s.size}pt`, "--doc-lh": String(d.lh), "--doc-gap": `${d.gap}pt`, "--doc-font": font };
}

/** Shrink steps for "fit": denser lines, then narrow margins, then the text 0.5pt at a time down to 9pt. */
export function fitSteps(s: DocStyle): Record<string, string>[] {
  const steps: Record<string, string>[] = [];
  if (s.density !== "compact") steps.push({ "--doc-lh": String(DENSITY.compact.lh), "--doc-gap": `${DENSITY.compact.gap}pt` });
  if (s.margins !== "narrow") steps.push({ "--doc-mx": `${MARGIN_MM.narrow[0]}mm`, "--doc-my": `${MARGIN_MM.narrow[1]}mm` });
  for (let z = s.size - 0.5; z >= 9; z -= 0.5) steps.push({ "--doc-fs": `${z}pt` });
  return steps;
}
