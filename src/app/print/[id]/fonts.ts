import { Carlito, Source_Serif_4, Tinos } from "next/font/google";

// Document fonts, self-hosted at build time. Carlito and Tinos match Calibri and Times New Roman metrics,
// so a recruiter who opens the DOCX sees the same line breaks as the PDF.
const carlito = Carlito({ weight: ["400", "700"], style: ["normal", "italic"], subsets: ["latin", "latin-ext"], variable: "--font-carlito", display: "swap" });
const tinos = Tinos({ weight: ["400", "700"], style: ["normal", "italic"], subsets: ["latin", "latin-ext"], variable: "--font-tinos", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin", "latin-ext"], variable: "--font-source-serif", display: "swap" });

export const docFontVars = `${carlito.variable} ${tinos.variable} ${sourceSerif.variable}`;
