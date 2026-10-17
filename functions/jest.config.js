/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  transform: { '^.+\\.ts$': ['babel-jest', { configFile: '../babel.node.config.js' }] },
  // @weloot/shared ships TypeScript source; map it to the source so Jest transforms it.
  moduleNameMapper: { '^@weloot/shared$': '<rootDir>/../packages/shared/src/index.ts' },
};
