import { cookies } from "next/headers";
import { dicts, type Dict } from "./dict";
import type { Locale } from "../types";

export const LOCALE_COOKIE = "enitjobs_locale";
export const THEME_COOKIE = "enitjobs_theme";

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return c === "en" ? "en" : "fr";
}

export async function getDict(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: dicts[locale] };
}

export async function getTheme(): Promise<"light" | "dark" | "system"> {
  const c = (await cookies()).get(THEME_COOKIE)?.value;
  return c === "light" || c === "dark" ? c : "system";
}

export async function getMotion(): Promise<"auto" | "reduce"> {
  return (await cookies()).get("khedma_motion")?.value === "reduce" ? "reduce" : "auto";
}
