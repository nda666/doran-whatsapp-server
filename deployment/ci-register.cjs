'use strict';
// Older isolated fixture loaders can import application modules using TS aliases.
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require.extensions['.css'] = module => { module.exports = new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : String(key) }); };
const compiler = require('ts-node').register({
  project: path.join(root, 'tsconfig.server.json'), transpileOnly: true,
  compilerOptions: { jsx: 'react-jsx', module: 'commonjs' },
});
require('tsconfig-paths').register({ baseUrl: root, paths: compiler.config.options.paths });
