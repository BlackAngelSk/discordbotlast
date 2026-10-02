// Proxy – re-exports the ESM helper module (converted in Phase 3).
// CJS consumers keep their existing import path and destructure named exports.
module.exports = require('./core/helpers.mjs');
