// Israeli mobile numbers. Firebase Auth stores E.164 (+9725XXXXXXXX); people type local (05X-XXXXXXX).
// Only mobiles (05X) are accepted: phone sign-in needs SMS (PRD W1).

const E164_IL_MOBILE = /^\+9725\d{8}$/;
const LOCAL_IL_MOBILE = /^05\d{8}$/;

/** Strips spaces, dashes, dots and parentheses that people type into phone numbers. */
function compact(input: string): string {
  return input.replace(/[\s\-.()]/g, '');
}

/** True for an Israeli mobile in either local (`054-1234567`) or E.164 (`+972541234567`) form. */
export function isIsraeliMobile(input: string): boolean {
  const n = compact(input);
  return LOCAL_IL_MOBILE.test(n) || E164_IL_MOBILE.test(n) || /^9725\d{8}$/.test(n);
}

/** `054-123 4567` / `+972 54 123 4567` / `972541234567` → `+972541234567`. Throws for anything else. */
export function toE164IL(input: string): string {
  const n = compact(input);
  if (E164_IL_MOBILE.test(n)) return n;
  if (/^9725\d{8}$/.test(n)) return `+${n}`;
  if (LOCAL_IL_MOBILE.test(n)) return `+972${n.slice(1)}`;
  throw new RangeError(`Not an Israeli mobile number: ${input}`);
}

/** `+972541234567` → `0541234567` (the 10-digit local form). Throws for anything else. */
export function toLocalIL(input: string): string {
  return `0${toE164IL(input).slice(4)}`;
}
