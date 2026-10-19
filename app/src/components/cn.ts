/** Joins class names, skipping falsy values. Later classes win only by order, so keep overrides last. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
