// Shared Jest config for the Node workspaces (functions, packages/*). The Expo app uses jest-expo.
const path = require('path');

/** @type {(rootDir: string, overrides?: import('jest').Config) => import('jest').Config} */
module.exports = (rootDir, overrides = {}) => ({
  rootDir,
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.ts$': ['babel-jest', { configFile: path.join(__dirname, 'babel.node.config.js') }],
  },
  // @weloot/shared ships TypeScript source; map it to the source so Jest transforms it.
  moduleNameMapper: { '^@weloot/shared$': path.join(__dirname, 'packages/shared/src/index.ts') },
  ...overrides,
});
