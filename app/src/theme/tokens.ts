// Typed access to the design tokens for code that can't use Tailwind classes (e.g. icon colors, navigation themes,
// animated styles). Values live in ./palette.js, shared with tailwind.config.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const palette = require('./palette') as {
  colors: Record<ColorToken, string>;
  radius: Record<'card' | 'button' | 'chip', number>;
  fontFamily: Record<'regular' | 'medium' | 'bold' | 'black', string>;
};

export type ColorToken =
  | 'bg'
  | 'surface'
  | 'surface-raised'
  | 'text-primary'
  | 'text-secondary'
  | 'text-muted'
  | 'border'
  | 'primary'
  | 'primary-pressed'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'on-primary'
  | 'on-accent'
  | 'ps'
  | 'xbox'
  | 'nintendo';

export const colors = palette.colors;
export const radius = palette.radius;
export const fontFamily = palette.fontFamily;

/** Console platforms we support, with their accent color token (PRD §3.1). */
export type Platform = 'ps' | 'xbox' | 'nintendo';
