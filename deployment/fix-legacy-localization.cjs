const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const added=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(f.endsWith('.tsx')){let s=fs.readFileSync(f,'utf8'),before=s;
  s=s.replace(/import \{ useTranslation \} from ["'](?:next-i18next|react-i18next)["'];/g,'import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";');
  s=s.replace(/import \{ i18n, useTranslation \} from "next-i18next";/g,'import { useLocalizedTranslation as useTranslation } from "@/lib/uiTranslation";');
  const titles={'phone.tsx':'Perangkat WhatsApp','log.tsx':'Riwayat aktivitas','auto-reply.tsx':'Balasan Otomatis'};
  if(titles[path.basename(f)])s=s.replace(/  const title = \(\) => i18n\?\.t\("\w+"\) \|\| "";\r?\n  return <Layout title=\{title\(\)\.toUpperCase\(\)\}>/,`  return <Layout title=${JSON.stringify(titles[path.basename(f)])}>`);
  if(s!==before){const relative=path.relative(root,f).replace(/\\/g,'/');const backup=path.join(root,'tmp/localization/source-before',relative);if(!fs.existsSync(backup)){fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,before);}fs.writeFileSync(f,s);added.push(relative);}
}}}
walk(path.join(root,'src/components'));walk(path.join(root,'src/pages'));
const listPath=path.join(root,'tmp/localization/modified.json');const files=JSON.parse(fs.readFileSync(listPath,'utf8'));fs.writeFileSync(listPath,JSON.stringify([...new Set([...files,...added])],null,2));
console.log('Legacy translations bound to route locale:',added.length);
