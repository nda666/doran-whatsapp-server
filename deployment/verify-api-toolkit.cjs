const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ts = require('typescript'), Ajv = require('ajv');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function load(relative, stubs = {}) {
  const file = path.join(root, relative), module = { exports: {} }, realRequire = createRequire(file);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(stubs, name) ? stubs[name] : realRequire(name), module, module.exports);
  return module.exports;
}
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'src/data/apiDocumentation.json')));
const collection = JSON.parse(fs.readFileSync(path.join(root, 'public/downloads/jeblast-api.postman_collection.json')));
const environment = JSON.parse(fs.readFileSync(path.join(root, 'public/downloads/jeblast-api.postman_environment.json')));
const ajv = new Ajv({ schemaId: 'auto', allErrors: true, strict: false });
ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-04.json'));
const validate = ajv.compile(JSON.parse(fs.readFileSync(path.join(root, 'deployment/postman-collection-schema.json'))));
assert(validate(collection), JSON.stringify(validate.errors));
const variables = Object.fromEntries(environment.values.map(item => [item.key, item.value]));
assert.equal(variables.device_token, ''); assert.equal(variables.user_token, '');
assert.equal(variables.allow_write_requests, 'false');
assert.notEqual(variables.job_id, variables.dispatch_id);
const queuedKeys = ['send-message','send-media','send-sticker','send-poll','send-button','send-list','send-location','send-vcard','legacy-send','v2-send'];
for (const endpoint of catalogue.endpoints.filter(entry => queuedKeys.includes(entry.key))) {
  assert.equal(endpoint.body.job_id, '{{job_id}}');
  assert.equal(endpoint.response.existing, false);
  assert(endpoint.variants.some(variant => variant.body.existing === true));
}
assert.equal(catalogue.endpoints.find(entry => entry.key === 'send-status-job').body.id, '{{dispatch_id}}');
assert.equal(catalogue.endpoints.find(entry => entry.key === 'send-status-request').body.job_id, '{{job_id}}');
const requests = collection.item.flatMap(group => group.item);
assert.equal(requests.length, catalogue.postmanRequests);
for (const item of requests) {
  assert(item.response.length > 0);
  assert(!item.request.url.raw.includes('%7B%7B'));
  const text = JSON.stringify(item.request);
  for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) assert(match[1] in variables, 'Unknown variable ' + match[1]);
  if (item.request.body?.mode === 'raw') JSON.parse(item.request.body.raw);
  for (const event of item.event || []) new Function(event.script.exec.join('\n'));
  const scripts = (item.event || []).flatMap(event => event.script.exec).join('\n');
  assert(!scripts.includes("set('job_id', result.data"), 'Client job_id must never become a recipient UUID');
  assert(item.request.auth.type === 'noauth' || item.request.auth.type === 'bearer');
  if (item.request.body?.mode === 'formdata') assert(!item.request.header.some(header => header.key.toLowerCase() === 'content-type'));
}
const samples = load('src/lib/apiIntegrationSamples.ts', { '@/data/apiDocumentation.json': catalogue });
const generated = [];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const publicSource = fs.readFileSync(path.join(root, 'src/pages/api/public/[action].ts'), 'utf8');
for (const endpoint of catalogue.endpoints) {
  assert(endpoint.path.startsWith('/api/'));
  if (endpoint.path.startsWith('/api/public/')) assert(publicSource.includes(endpoint.key) || /^send-(message|media|poll|sticker|button|list|location|vcard)$/.test(endpoint.key));
  for (const language of samples.apiLanguages) {
    const sample = samples.integrationSample(endpoint, language.key);
    assert(sample.length > 20); assert(!sample.includes('{{'));
    if (language.key === 'javascript') new AsyncFunction(sample);
    generated.push({ endpoint: endpoint.key, language: language.key, sample });
  }
}
fs.mkdirSync(path.join(root, 'tmp/api-toolkit'), { recursive: true });
fs.writeFileSync(path.join(root, 'tmp/api-toolkit/language-samples.json'), JSON.stringify(generated));
const phpFile = path.join(root, 'tmp/api-toolkit/sample.php');
for (const sample of generated.filter(item => item.language === 'php')) {
  fs.writeFileSync(phpFile, sample.sample);
  const result = spawnSync('php', ['-l', phpFile], { encoding: 'utf8' });
  assert.equal(result.status, 0, sample.endpoint + ': ' + result.stdout + result.stderr);
}
const content = load('src/server/campaigns/content.ts');
const normal = load('src/utils/normalizePhoneRecipient.ts');
const queue = load('src/server/dispatch/queue.ts', { '../../lib/prisma': {}, '../dispatchWebhook/events': {} });
for (const endpoint of catalogue.endpoints.filter(entry => /^send-(message|media|poll|sticker|button|list|location|vcard)$/.test(entry.key))) {
  const body = JSON.parse(JSON.stringify(endpoint.body).replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key]));
  normal.normalizePhoneRecipient(body.number);
  if (body.payload) content.payloadContent({ ...body.payload, kind: endpoint.key.slice(5) });
  queue.prepareDispatch('fake-device', 'fake-owner', { ...body, message: body.message || body.payload?.text || `[${endpoint.key}]` });
}
console.log('API_TOOLKIT_OK: official Postman schema,', requests.length, 'requests, variables/auth, multipart headers, JS/PHP syntax, typed payload and dispatch contracts');
