// Development-only catalog generation. The deployed application makes no translation requests.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'tmp/localization');
// Pin external requests to the exact 2,427 phrases approved by the user.
// Any subsequently discovered copy is handled locally, never sent by this script.
const sources=JSON.parse(fs.readFileSync(path.join(dir,'approved-source-2427.json'),'utf8'));
if(sources.length!==2427)throw Error('Approved payload must contain exactly 2,427 phrases');
const original=Object.keys(JSON.parse(fs.readFileSync(path.join(root,'public/locales/id/interface.json'),'utf8')));
if(JSON.stringify(sources)!==JSON.stringify(original))throw Error('External payload differs from the approved original catalog');
const languages=['en','es','ar','hi'];
const technical=/\{\{[^{}]+\}\}|\{[\w.-]+\}|\b[A-Za-z]\w*_\w+\b|\/api\/[\w/.[\]-]+|\b(?:JeBlast|Doran WA|WhatsApp|OpenAI|Gemini|Claude|Postman|BullMQ|CSV|JSON|PDF|API|JavaScript|Python|cURL|PHP|Node\.js)\b/g;
const identity=new Set(['OpenAI Platform','Google AI Studio','Claude Console','Doran WA','JeBlast','Email','URL','API','HTTP','QR','WIB','cURL','PHP cURL','JavaScript / Node.js','Python','Go','OpenAI','Gemini AI','Claude AI','Español','العربية','हिन्दी','Indonesia','English']);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function preserved(source,value){return [...source.matchAll(technical)].every(([token])=>value.includes(token));}
async function translateBatch(batch,language){const tokens=[];const protectedText=batch.map(s=>s.replace(technical,v=>{if(v.startsWith('{{'))return v;const i=tokens.push(v)-1;return `{{code${i}}}`;})).join('\n');
  for(let attempt=0;attempt<5;attempt++){try{
    const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=id&tl='+language+'&dt=t&q='+encodeURIComponent(protectedText);
    const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Translation HTTP '+r.status);
    const data=await r.json();let result=data[0].map(s=>s[0]||'').join('').replace(/\{\{\s*code\s*(\d+)\s*\}\}/gi,(_,i)=>tokens[Number(i)]||'');
    const rows=result.split('\n');if(rows.length!==batch.length)throw Error('Line count mismatch');
    for(let i=0;i<rows.length;i++){if(!rows[i].trim())throw Error('Empty translation');const placeholders=s=>(s.match(/\{\{[^{}]+\}\}/g)||[]).sort().join('|');if(placeholders(rows[i])!==placeholders(batch[i]))throw Error('Placeholder mismatch');if(!preserved(batch[i],rows[i]))throw Error('Technical identifier mismatch');}
    return rows;
  }catch(e){if(attempt===4){if(batch.length>1){const middle=Math.ceil(batch.length/2);return [...await translateBatch(batch.slice(0,middle),language),...await translateBatch(batch.slice(middle),language)];}throw Error(language+': '+batch[0]+': '+e.message);}await wait(500*(attempt+1));}}
}
async function language(language){const cachePath=path.join(dir,language+'-cache.json');const cache=fs.existsSync(cachePath)?JSON.parse(fs.readFileSync(cachePath,'utf8')):{};for(const s of sources)if(identity.has(s))cache[s]=s;
  for(const s of sources)if(cache[s]&&!preserved(s,cache[s]))delete cache[s];
  const pending=sources.filter(s=>!cache[s]);const batches=[];let batch=[],length=0;for(const s of pending){if(length+s.length>2400&&batch.length){batches.push(batch);batch=[];length=0;}batch.push(s);length+=s.length+1;}if(batch.length)batches.push(batch);
  let done=0;for(const batch of batches){const values=await translateBatch(batch,language);batch.forEach((s,i)=>cache[s]=values[i]);fs.writeFileSync(cachePath,JSON.stringify(cache,null,2));done++;if(done%10===0||done===batches.length)console.log(`${language}: ${done}/${batches.length} batches`);}
  const result=Object.fromEntries(sources.map(s=>[s,cache[s]]));fs.writeFileSync(path.join(root,'public/locales',language,'interface.json'),JSON.stringify(result,null,2)+'\n');
}
fs.writeFileSync(path.join(root,'public/locales/id/interface.json'),JSON.stringify(Object.fromEntries(sources.map(s=>[s,s])),null,2)+'\n');
Promise.all(languages.map(language)).then(()=>console.log('All translation catalogs generated.')).catch(e=>{console.error(e.message);process.exitCode=1;});
