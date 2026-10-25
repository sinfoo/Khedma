import type { Metadata } from "next";
import { getDict } from "./server";
import type { Dict } from "./dict";

/** `export const generateMetadata = pageTitle("offers")`: the browser tab title in the interface language. */
export const pageTitle = (key: keyof Dict["shell2"]["titles"]) => async (): Promise<Metadata> => ({ title: (await getDict()).t.shell2.titles[key] });
