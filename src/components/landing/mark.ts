// The Khedma mark as a raw SVG data URI, for generated images (icons, Open Graph).
// Same geometry as <Logo /> in src/components/logo.tsx and src/app/icon.svg.
export const BRAND = { blue: "#0b5cad", saffron: "#f5b14c", ink: "#080b11", lime: "#f6f5f1" } as const;

export function markDataUri(radius = 16) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="${radius}" fill="${BRAND.blue}"/><path d="M19 52V30a13 13 0 0 1 26 0v22" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><path d="M32 17v35" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.55"/><circle cx="38" cy="38" r="3.6" fill="${BRAND.saffron}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
