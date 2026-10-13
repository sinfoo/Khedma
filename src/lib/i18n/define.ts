/** Same shape as T, with string literals widened to string (so FR can differ from EN). */
export type DeepString<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? string[]
      : T[K] extends readonly (infer U)[]
        ? DeepString<U>[]
        : T[K] extends object
          ? DeepString<T[K]>
          : T[K];
};

/**
 * Declare a feature's messages. EN is the source shape; FR must match it key for key.
 * Usage: export default defineMessages({ en: { title: "Offers" }, fr: { title: "Offres" } });
 */
export function defineMessages<T extends object>(m: { en: T; fr: DeepString<T> }) {
  return m;
}
