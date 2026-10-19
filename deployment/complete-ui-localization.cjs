const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.tsx?$/.test(f))files.push(f);}}
walk(path.join(root,'src/components'));walk(path.join(root,'src/pages'));
for(const file of files){if(file.includes(path.sep+'api'+path.sep))continue;let source=fs.readFileSync(file,'utf8');
  source=source.replaceAll('["common", "upgrade"]','["common", "upgrade", "interface"]');
  // API errors are translated only at presentation boundaries; data and request payloads stay intact.
  const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
  function inBoundScope(n){for(let p=n;p;p=p.parent)if((ts.isFunctionDeclaration(p)||ts.isArrowFunction(p)||ts.isFunctionExpression(p))&&p.body&&/const uiText = useUiTranslation\(\)|uiText: UiTranslator/.test(p.getText(sf)))return true;return false;}
  function wrap(n){if(!n||/^uiText\(/.test(n.getText(sf))||ts.isStringLiteral(n))return;edits.push({start:n.getStart(sf),end:n.end,text:`uiText(${n.getText(sf)})`});}
  function visit(n){if(inBoundScope(n)){
    if(ts.isCallExpression(n)&&/^(message|toast)\.(error|success|warning|info)$/.test(n.expression.getText(sf)))wrap(n.arguments[0]);
    if(ts.isJsxAttribute(n)&&n.name.getText(sf)==='message'&&n.initializer&&ts.isJsxExpression(n.initializer))wrap(n.initializer.expression);
    if(ts.isCallExpression(n)&&/^set(?:Notice|Error|SendError)$/.test(n.expression.getText(sf)))wrap(n.arguments[0]);
  }ts.forEachChild(n,visit);}visit(sf);
  // Nested candidates are covered by the outer presentation boundary.
  const outer=edits.filter(e=>!edits.some(o=>o!==e&&o.start<=e.start&&o.end>=e.end&&(o.start!==e.start||o.end!==e.end)));
  const unique=[...new Map(outer.map(e=>[`${e.start}:${e.end}`,e])).values()];
  source=unique.sort((a,b)=>b.start-a.start).reduce((s,e)=>s.slice(0,e.start)+e.text+s.slice(e.end),source);
  if(source!==fs.readFileSync(file,'utf8'))fs.writeFileSync(file,source);
}

const phrases=new Set();
const decode=s=>s.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"');
// Only constant UI copy enters the translation catalog. Never read env files or live data.
for(const file of files){if(file.includes(path.sep+'api'+path.sep))continue;const sf=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='uiText'&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))phrases.add(decode(n.arguments[0].text));if(ts.isJsxAttribute(n)&&n.name.getText(sf)==='title'&&n.initializer&&ts.isStringLiteral(n.initializer))phrases.add(n.initializer.text);ts.forEachChild(n,visit);}visit(sf);}
const libs=['phoneConnectionStatus','messagingLabels','dispatchPresentation','dashboardColors','phoneFormFields','dispatchSettings','phoneCleanup','phoneConnectionStatus','mediaFilters','testSend','chatEmoji','messageTemplates','apiEndpointNotes','deviceQuota'];
const human=s=>s.trim()&& !/^https?:|^[/#@]|^\s*[\[{]|^[\w.-]+\.[\w.-]+$/.test(s)&&(/[A-Za-z]{2,}\s+[A-Za-z{]/.test(s)||/^[A-Z][a-z]+$/.test(s))&&!/=>|\\[nr]|<\/?[a-z]/.test(s);
function extract(file,all){const src=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true);function visit(n){let s;if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))s=n.text;else if(ts.isTemplateExpression(n))s=n.head.text+n.templateSpans.map((p,i)=>`{{v${i}}}`+p.literal.text).join('');if(s&&human(s)) {let allowed=all;for(let p=n.parent;p&&!allowed;p=p.parent){if(ts.isPropertyAssignment(p)&&/^(message|error|description)$/.test(p.name.getText(sf)))allowed=true;if(ts.isNewExpression(p)&&/Error$/.test(p.expression.getText(sf)))allowed=true;}if(allowed)phrases.add(s);}if(ts.isTemplateExpression(n)){for(const p of n.templateSpans)visit(p.expression);return;}ts.forEachChild(n,visit);}visit(sf);}
for(const name of libs){const f=path.join(root,'src/lib',name+'.ts');if(fs.existsSync(f))extract(f,true);}
const backend=[];function collect(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())collect(f);else if(/\.ts$/.test(f))backend.push(f);}}collect(path.join(root,'src/pages/api'));collect(path.join(root,'src/server'));for(const f of backend)extract(f,false);
const docs=JSON.parse(fs.readFileSync(path.join(root,'src/data/apiDocumentation.json'),'utf8'));
phrases.add(docs.scope);
for(const endpoint of docs.endpoints){for(const field of ['title','group','notes'])if(endpoint[field])phrases.add(endpoint[field]);for(const sentence of endpoint.notes?.match(/[^]*?(?:\.\s+|$)/g)||[])if(sentence.trim())phrases.add(sentence.trim());}
const flat=o=>Object.values(o).flatMap(v=>typeof v==='string'?[v]:flat(v));
for(const ns of ['common','upgrade']){const id=JSON.parse(fs.readFileSync(path.join(root,'public/locales/id',ns+'.json'),'utf8'));for(const p of flat(id))phrases.add(p);}
for(const p of ['Bahasa','Dasbor','PROFIL SAYA','Ganti kata sandi','Lupa password','Reset password','Masuk','Daftar','Indonesia','English','Español','العربية','हिन्दी'])phrases.add(p);
const list=[...phrases].sort();fs.writeFileSync(path.join(root,'tmp/localization/translation-source.json'),JSON.stringify(list,null,2));
const patterns=list.filter(p=>/\{\{v\d+\}\}/.test(p));fs.writeFileSync(path.join(root,'src/data/uiMessagePatterns.json'),JSON.stringify(patterns,null,2));
console.log(`${list.length} static phrases; ${patterns.length} parameterized messages`);
