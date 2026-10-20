// Single source of design-token values (PRD §3.1). Plain CommonJS so tailwind.config.js can read it;
// TypeScript code imports the typed re-export from ./tokens instead. Provisional until branding (OPEN-10).
const colors = {
  bg: '#121212',
  surface: '#1E1E1E',
  'surface-raised': '#2A2A2A',
  'text-primary': '#FFFFFF',
  'text-secondary': '#B3B3B3',
  'text-muted': '#8A8A8A',
  border: '#333333',
  primary: '#7C4DFF',
  'primary-pressed': '#6A3DE8',
  accent: '#00E5FF',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  'on-primary': '#FFFFFF',
  'on-accent': '#003A40',
  ps: '#0070D1',
  xbox: '#107C10',
  nintendo: '#E60012',
};

const radius = { card: 16, button: 12, chip: 999 };

const fontFamily = {
  regular: 'Rubik_400Regular',
  medium: 'Rubik_500Medium',
  bold: 'Rubik_700Bold',
  black: 'Rubik_800ExtraBold',
};

module.exports = { colors, radius, fontFamily };
