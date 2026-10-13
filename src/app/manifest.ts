import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Khedma — stages, PFE et premier emploi",
    short_name: "Khedma",
    description: "Compagnon local de recherche de stage et d'emploi pour les élèves ingénieurs en Tunisie. IA locale, données sur ta machine.",
    lang: "fr",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#0b0e13",
    theme_color: "#0b5cad",
    categories: ["productivity", "education", "business"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon1/192", sizes: "192x192", type: "image/png" },
      { src: "/icon1/512", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
