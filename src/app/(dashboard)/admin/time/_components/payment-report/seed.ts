/** What the editors were last filled for: a selection key, or `loading:<key>`
 *  when they were blanked for a selection whose saved values hadn't arrived. */
export type SeedKey = string | null;

/**
 * Decides when the rate/bonus inputs are (re)filled from saved values.
 *
 * They are filled once per selection (employee, or employee + period) — when
 * the saved values first arrive — and never again for that selection. A
 * refetch of the same selection (after Save, or any invalidation) used to
 * re-fill them and overwrite whatever the admin had typed since.
 *
 * Returns null when the inputs should be left alone; otherwise the new key
 * and the values to fill from (undefined = blank them).
 */
export function nextSeed<T>(
  prev: SeedKey,
  key: string,
  data: T | undefined,
): { key: string; from: T | undefined } | null {
  if (prev === key) return null;
  if (data === undefined) {
    return prev === `loading:${key}` ? null : { key: `loading:${key}`, from: undefined };
  }
  return { key, from: data };
}
