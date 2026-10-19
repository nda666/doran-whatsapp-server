const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
const {createUiTranslator}=require('../src/lib/uiTranslationCore.ts');
const languages=['id','en','es','ar','hi'];
const catalogs=Object.fromEntries(languages.map(l=>[l,JSON.parse(fs.readFileSync(path.join(root,'public/locales',l,'interface.json'),'utf8'))]));
const keys=Object.keys(catalogs.id).sort();
const vars=text=>(text.match(/\{\{\w+\}\}/g)||[]).sort();
for(const language of languages){const catalog=catalogs[language];assert.deepEqual(Object.keys(catalog).sort(),keys,`${language}: catalog parity`);for(const source of keys){assert.equal(typeof catalog[source],'string');assert(catalog[source].trim(),`${language}: empty translation`);assert.deepEqual(vars(catalog[source]),vars(source),`${language}: placeholders in ${source}`);assert(!/ZXQ\d+QXZ|\{\{code\d+\}\}/.test(catalog[source]),`${language}: unreplaced token`);}
  const ui=createUiTranslator(language,catalog);
  assert.equal(ui('Ringkasan operasional'),catalog['Ringkasan operasional']);
  assert.equal(ui('Lihat detail {{v0}}',{v0:'TOKO A'}),catalog['Lihat detail {{v0}}'].replace('{{v0}}','TOKO A'));
  assert.equal(ui('Lihat detail TOKO A'),catalog['Lihat detail {{v0}}'].replace('{{v0}}','TOKO A'));
  assert.equal(ui('Unknown server message'),'Unknown server message');
  const payload={name:'Nama',message:'Ringkasan operasional',token:'test-token'};assert.equal(ui(payload),payload);
  assert.equal(ui(null),null);assert.equal(ui(undefined),undefined);
  assert.equal(ui.date('not-a-date'),'—');assert(ui.date('2026-10-17T00:00:00Z').length>5);
}
// Every explicit UI phrase and page title must be in the catalog.
let uses=0;const unresolved=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.tsx$/.test(f)){const sf=ts.createSourceFile(f,fs.readFileSync(f,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='uiText'&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])){uses++;if(!Object.hasOwn(catalogs.id,n.arguments[0].text))unresolved.push(f+': '+n.arguments[0].text);}if(ts.isCallExpression(n)&&/getFieldValue$/.test(n.expression.getText(sf)))assert(!n.arguments.some(a=>/^uiText\(/.test(a.getText(sf))),'Translated schema field in '+f);if(ts.isBinaryExpression(n)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(n.operatorToken.kind))assert(!/^uiText\(/.test(n.right.getText(sf)),'Translated comparison in '+f);ts.forEachChild(n,visit);}visit(sf);}}}
walk(path.join(root,'src/components'));walk(path.join(root,'src/pages/dashboard'));
assert.deepEqual(unresolved,[]);
for(const namespace of ['common','upgrade']){function flatten(o,p=''){return Object.entries(o).flatMap(([k,v])=>typeof v==='string'?[[p+k,v]]:flatten(v,p+k+'.'));}const baseline=flatten(JSON.parse(fs.readFileSync(path.join(root,'public/locales/id',namespace+'.json'),'utf8')));for(const language of languages){const entries=new Map(flatten(JSON.parse(fs.readFileSync(path.join(root,'public/locales',language,namespace+'.json'),'utf8'))));for(const [key,value]of baseline){assert(entries.has(key),`${language}/${namespace}: ${key}`);assert.deepEqual(vars(entries.get(key)),vars(value),`${language}/${namespace}: ${key} placeholders`);}}}
console.log(`LOCALIZATION_OK: ${keys.length} phrases × ${languages.length} languages; ${uses} UI uses; interpolation, server messages, locale isolation, schema values, and legacy catalogs verified`);
