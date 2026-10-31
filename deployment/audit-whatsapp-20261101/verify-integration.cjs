'use strict';
// Compile the optional integration in memory without modifying live source files.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const diff = require('diff');
const normalize = text => text.replaceAll(String.fromCharCode(13), '');
const root = path.resolve(__dirname, '../..');
const overlays = new Map();
for (const patch of diff.parsePatch(normalize(fs.readFileSync(path.join(__dirname, 'integration.patch'), 'utf8')))) {
  const file = path.resolve(root, patch.newFileName.slice(2));
  const next = diff.applyPatch(normalize(fs.readFileSync(file, 'utf8')), patch);
  if (next === false) throw Error('Patch no longer applies: ' + file);
  overlays.set(file.toLowerCase(), next);
}
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, { noEmit: true, incremental: false });
const host = ts.createCompilerHost(parsed.options);
const original = host.getSourceFile.bind(host);
host.getSourceFile = (file, version, onError, fresh) => {
  const value = overlays.get(path.resolve(file).toLowerCase());
  return value === undefined ? original(file, version, onError, fresh) : ts.createSourceFile(file, value, version, true);
};
const program = ts.createProgram(parsed.fileNames, parsed.options, host);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  process.exitCode = 1;
} else console.log('OPTIONAL_PATCH_TYPECHECK_PASSED', overlays.size, 'files');
