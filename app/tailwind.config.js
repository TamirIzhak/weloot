const { colors, radius, fontFamily } = require('./src/theme/palette');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      borderRadius: {
        card: `${radius.card}px`,
        button: `${radius.button}px`,
        chip: `${radius.chip}px`,
      },
      fontFamily: {
        sans: [fontFamily.regular],
        medium: [fontFamily.medium],
        bold: [fontFamily.bold],
        black: [fontFamily.black],
      },
    },
  },
  plugins: [],
};
