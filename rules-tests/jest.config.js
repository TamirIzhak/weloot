// Emulator-backed tests share one emulator instance, so run test files serially.
module.exports = require('../jest.node.config')(__dirname, { maxWorkers: 1, testTimeout: 20000 });
