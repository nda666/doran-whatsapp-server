// One-time, syntax-aware migration. Source snapshots are kept in tmp/localization/source-before.
const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'tmp/localization/catalog.json'),'utf8'));
const byFile=new Map();
for(const entry of catalog) for(const use of entry.uses) { if(!byFile.has(use.file))byFile.set(use.file,[]);byFile.get(use.file).push({...use,text:entry.text}); }
const program=ts.createProgram([...byFile.keys()].map(f=>path.join(root,f)),{jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.Latest,skipLibCheck:true});
const checker=program.getTypeChecker();
const modified=[];
for(const [file,uses] of byFile) {
  const full=path.join(root,file),source=fs.readFileSync(full,'utf8'),sf=program.getSourceFile(full),nodes=new Map(),declarations=new Map(),owners=new Map(),edits=[];
  const add=(start,end,text)=>edits.push({start,end,text});
  function scan(n){nodes.set(`${n.getStart(sf)}:${n.end}:${ts.SyntaxKind[n.kind]}`,n);ts.forEachChild(n,scan);}scan(sf);
  function register(n,name,kind,fn){const symbol=checker.getSymbolAtLocation(name);const d={n,name:name.text,symbol,kind,fn,needed:false};declarations.set(symbol,d);return d;}
  for(const s of sf.statements) {
    if(ts.isFunctionDeclaration(s)&&s.name&&s.body)register(s,s.name,/^[A-Z]|^use[A-Z]/.test(s.name.text)?'component':'helper',s);
    if(ts.isVariableStatement(s))for(const d of s.declarationList.declarations)if(ts.isIdentifier(d.name)&&d.initializer){let fn=ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer)?d.initializer:null;if(!fn&&/^[A-Z]/.test(d.name.text)){function find(n){if(!fn&&(ts.isArrowFunction(n)||ts.isFunctionExpression(n)))fn=n;else if(!fn)ts.forEachChild(n,find);}find(d.initializer);}register(d,d.name,fn?(/^[A-Z]|^use[A-Z]/.test(d.name.text)?'component':'helper'):'factory',fn);}
  }
  function owner(n) { for(let p=n;p;p=p.parent){const d=[...declarations.values()].find(d=>d.n===p);if(d)return d;}return null; }
  const selections=[];
  for(const u of uses){const n=nodes.get(`${u.start}:${u.end}:${u.kind}`);if(!n||n.end!==u.end)throw Error('Node mismatch '+file+':'+u.line);const d=owner(n);if(!d)continue;d.needed=true;selections.push({...u,n,d});}
  for(const n of nodes.values())if(ts.isStringLiteral(n)&&['id-ID','en-GB'].includes(n.text)&&(ts.isCallExpression(n.parent)||ts.isNewExpression(n.parent))){const d=owner(n);if(d){d.needed=true;add(n.getStart(sf),n.end,'uiText.locale');}}
  // Dependencies retain the caller's translator instead of global mutable locale state.
  let changed=true;while(changed){changed=false;function check(n){if(ts.isIdentifier(n)){const target=declarations.get(checker.getSymbolAtLocation(n)),caller=owner(n);if(target?.needed&&target.kind!=='component'&&caller&&caller!==target&&!caller.needed){caller.needed=true;changed=true;}}ts.forEachChild(n,check);}check(sf);}
  function replacements(start,end){return edits.filter(e=>e.start>=start&&e.end<=end).sort((a,b)=>b.start-a.start||b.end-a.end).reduce((text,e)=>text.slice(0,e.start-start)+e.text+text.slice(e.end-start),source.slice(start,end));}
  const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi,x=>({ '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':'\u00a0' }[x]||String.fromCodePoint(x[2].toLowerCase()==='x'?parseInt(x.slice(3,-1),16):parseInt(x.slice(2,-1),10))));
  // References must be rewritten before enclosing template literals consume their edits.
  function refs(n){if(ts.isIdentifier(n)){const d=declarations.get(checker.getSymbolAtLocation(n));if(d?.needed&&d.kind!=='component'&&n!==d.n.name&&!ts.isTypeNode(n.parent)){
      const p=n.parent;
      if(ts.isCallExpression(p)&&p.expression===n)add(p.arguments.pos,p.arguments.pos,'uiText'+(p.arguments.length?', ':''));
      else if(!ts.isPropertyAccessExpression(p)||p.expression===n){if(d.kind==='factory')add(n.getStart(sf),n.end,`${d.name}(uiText)`);else if(!(ts.isPropertyAssignment(p)&&p.name===n))add(n.getStart(sf),n.end,`((...args: Parameters<typeof ${d.name}> extends [UiTranslator, ...infer A] ? A : never) => ${d.name}(uiText, ...args))`);}
    }}ts.forEachChild(n,refs);}refs(sf);
  for(const u of selections.sort((a,b)=>(a.end-a.start)-(b.end-b.start))){const n=u.n;let phrase=u.text,values='';
    if(ts.isTemplateExpression(n)){values=', { '+n.templateSpans.map((s,i)=>`v${i}: ${replacements(s.expression.getStart(sf),s.expression.end)}`).join(', ')+' }';edits.splice(0,edits.length,...edits.filter(e=>!(e.start>=u.start&&e.end<=u.end)));}
    if(ts.isJsxText(n)){phrase=decode(phrase);const raw=n.text;let prefix=/^[ \t]/.test(raw)?' ':'';let suffix=/[ \t]$/.test(raw)?' ':'';if(raw.includes('\n')){prefix='';suffix='';}const replacement=`{uiText(${JSON.stringify(phrase)}${values})}`;add(u.start,u.end,prefix+replacement+suffix);}
    else {let replacement=`uiText(${JSON.stringify(phrase)}${values})`;if(ts.isJsxAttribute(n.parent))replacement='{'+replacement+'}';add(u.start,u.end,replacement);}
  }
  // Calls and references to local helper functions or static UI definitions get a translator.
  function unusedRefs(n){if(ts.isIdentifier(n)){const d=declarations.get(checker.getSymbolAtLocation(n));if(d?.needed&&d.kind!=='component'&&n!==d.n.name&&!ts.isTypeNode(n.parent)){
      const p=n.parent;
      if(ts.isCallExpression(p)&&p.expression===n)add(p.arguments.pos,p.arguments.pos,'uiText'+(p.arguments.length?', ':''));
      else if(!ts.isPropertyAccessExpression(p)||p.expression===n){if(d.kind==='factory')add(n.getStart(sf),n.end,`${d.name}(uiText)`);else if(!(ts.isPropertyAssignment(p)&&p.name===n))add(n.getStart(sf),n.end,`((...args: Parameters<typeof ${d.name}> extends [UiTranslator, ...infer A] ? A : never) => ${d.name}(uiText, ...args))`);}
    }}ts.forEachChild(n,unusedRefs);}
  let hooks=false,types=false;
  for(const d of declarations.values())if(d.needed){
    if(d.kind==='factory'){types=true;const init=d.n.initializer;const type=d.n.type?`: ${d.n.type.getText(sf)}`:'';add(d.n.name.end,init.getStart(sf),` = (uiText: UiTranslator)${type} => (`);add(init.end,init.end,')');}
    else if(d.kind==='helper'){types=true;const fn=d.fn;if(ts.isArrowFunction(fn)&&fn.parameters.length===1&&source.slice(fn.getStart(sf),fn.parameters[0].getStart(sf)).indexOf('(')<0){const p=fn.parameters[0];add(p.getStart(sf),p.getStart(sf),'(uiText: UiTranslator, ');add(p.end,p.end,')');}else add(fn.parameters.pos,fn.parameters.pos,'uiText: UiTranslator'+(fn.parameters.length?', ':''));}
    else {hooks=true;const body=d.fn.body;if(ts.isBlock(body))add(body.getStart(sf)+1,body.getStart(sf)+1,'\n  const uiText = useUiTranslation();');else {add(body.getStart(sf),body.getStart(sf),'{ const uiText = useUiTranslation(); return (');add(body.end,body.end,'); }');}}
  }
  if(!edits.length)continue;
  const imports=[hooks?'useUiTranslation':null,types?'type UiTranslator':null].filter(Boolean).join(', ');
  add(0,0,`import { ${imports} } from "@/lib/uiTranslation";\n`);
  const backup=path.join(root,'tmp/localization/source-before',file);fs.mkdirSync(path.dirname(backup),{recursive:true});if(!fs.existsSync(backup))fs.writeFileSync(backup,source);
  const out=edits.sort((a,b)=>b.start-a.start||b.end-a.end).reduce((s,e)=>s.slice(0,e.start)+e.text+s.slice(e.end),source);
  fs.writeFileSync(full,out);modified.push(file);
}
fs.writeFileSync(path.join(root,'tmp/localization/modified.json'),JSON.stringify(modified,null,2));console.log('Localized '+modified.length+' source files');

