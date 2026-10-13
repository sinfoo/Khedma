import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { getDict, getTheme } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { ToastProvider } from "@/components/kit/toast";

const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], display: "swap" });
const sans = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Khedma", template: "%s · Khedma" },
  description: "Khedma — local-first, AI-assisted internship and job search companion for engineering students.",
  icons: { icon: "/icon.svg" },
  applicationName: "Khedma",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e13" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ locale, t }, theme] = await Promise.all([getDict(), getTheme()]);
  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      data-theme={theme === "system" ? undefined : theme}
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <a href="#main" className="skip-link btn btn-primary">
          {t.nav.skipToContent}
        </a>
        <I18nProvider locale={locale} t={t}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
