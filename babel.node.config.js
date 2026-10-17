// Babel config used only by Jest in the Node workspaces (functions, packages/*).
// Type-checking is done by tsc; Babel just strips types. The Expo app uses babel-preset-expo instead.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'],
};
