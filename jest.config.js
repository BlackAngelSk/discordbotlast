module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // NOTE: tests/*.test.js is written for the project's own runner
  // (node tests/run-all.js) – those files define their own `test()` helper and
  // call process.exit(), so Jest cannot execute them. Jest therefore owns only
  // tests/jest/**, and `npm test` stays the authoritative full suite.
  testMatch: ['<rootDir>/tests/jest/**/*.test.js'],
  collectCoverageFrom: [
    'utils/**/*.js',
    'commands/**/*.js',
    'events/**/*.js',
    'dashboard/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/data/**',
    '!**/logs/**',
    '!**/backups/**',
    '!**/assets/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
  testTimeout: 10000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
};
