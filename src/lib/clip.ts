import { randomBytes } from "node:crypto";
import { kvGet, kvSet } from "./db";

/** Per-install secret embedded in the clipper bookmarklet; guards the cross-origin import route. */
export function clipToken(): string {
  let t = kvGet<string>("clip_token", "");
  if (!t) {
    t = randomBytes(12).toString("hex");
    kvSet("clip_token", t);
  }
  return t;
}
