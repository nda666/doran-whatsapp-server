const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const files = [];
function walk(dir) { for (const e of fs.readdirSync(dir, {withFileTypes:true})) { const p=path.join(dir,e.name); if(e.isDirectory()) walk(p); else if (/\.tsx?$/.test(p)) files.push(p); } }
walk(path.join(root,'src/components')); walk(path.join(root,'src/pages'));
const humanProps = /^(label|title|description|message|placeholder|extra|tip|tooltip|help|okText|cancelText|allLabel|checkedChildren|unCheckedChildren|addonAfter|addonBefore|searchPlaceholder|emptyText|alt|aria-label|copyLabel|caption|detail|text|confirmTitle|subTitle|content)$/;
const singleWords = new Set('Aktif Nonaktif Online Offline Semua Pilih Salin Unduh Batal Simpan Hapus Ubah Tambah Tutup Buka Cari Muat Perangkat Penerima Pengirim Pesan Lampiran Gambar Video Audio Dokumen Stiker Lokasi Kontak Percakapan Kampanye Kalender Pengaturan Administrasi Pengguna Nama Nomor Grup Berhasil Gagal Menunggu Diproses Terkirim Diterima Dibaca Diblokir Terjadwal Selesai Dijeda Dibatalkan Keterangan Rincian Wajib Opsional Total Jumlah Hari Jam Menit Detik Bahasa Hijau Biru Ungu Oranye Merah Abu-abu'.split(' '));
function human(text) { const s=text.trim(); return s && !/^[/#@]|^https?:|^[\w.-]+\.[\w.-]+$/.test(s) && (singleWords.has(s) || (/[A-Za-z]{2,}\s+[A-Za-z{]/.test(s) && !/=>|\\[nr]|^\s*[\[{]|<\/?[a-z]|\b(?:import|const|return|curl|SELECT|Bearer)\b/.test(s))); }
function blocked(node) {
  for(let p=node.parent;p;p=p.parent) {
    if(ts.isBinaryExpression(p)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true;
    if(ts.isCallExpression(p)&&/\.(?:includes|startsWith|endsWith|indexOf|lastIndexOf|format)$/.test(p.expression.getText())&&p.arguments.includes(node)) return true;
    if(ts.isTypeNode(p)||ts.isImportDeclaration(p)||ts.isExportDeclaration(p)) return true;
    if(ts.isCallExpression(p) && /^(t|ui|uiText|require|fetch|JSON\.stringify|integrationSample)$/.test(p.expression.getText())) return true;
    if(ts.isJsxElement(p) && /^(code|pre)$/.test(p.openingElement.tagName.getText())) return true;
    if(ts.isJsxAttribute(p) && /^(className|style|key|name|id|htmlFor|href|src|type|value|defaultValue|initialValues|selectedKeys|dataIndex|autoComplete|accept|rel|target|direction|align|role)$/.test(p.name.getText())) return true;
    if(ts.isJsxAttribute(p)&&p.name.getText()==='content'&&/^(meta|Meta)$/.test(p.parent.parent.tagName.getText())) return true;
    if(ts.isJsxAttribute(p) && p.initializer===node && !humanProps.test(p.name.getText())) return true;
    if(ts.isPropertyAssignment(p) && /^(initialValues|response|body|headers|defaultValue)$/.test(p.name.getText())) return true;
    if(ts.isPropertyAssignment(p) && /^(key|value|name|dataIndex|href|path|url|src|id|type|status|method|color|background|fontFamily|contentType|timeZone|day|month|year|hour|minute|hourCycle|response|body|headers|initialValues|defaultValue|rules|style)$/.test(p.name.getText()) && p.initializer===node && !human(node.text||'')) return true;
  }
  return false;
}
const catalog=new Map(), tops=[];
for(const file of files) {
  if(file.includes(path.sep+'api'+path.sep)) continue;
  const src=fs.readFileSync(file,'utf8'), sf=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(n) {
    if((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isJsxText(n)||ts.isTemplateExpression(n))&&!blocked(n)) {
      const template=ts.isTemplateExpression(n);
      const text=template ? n.head.text+n.templateSpans.map((s,i)=>`{{v${i}}}`+s.literal.text).join('') : ts.isJsxText(n) ? n.text.replace(/\s+/g,' ').trim() : n.text;
      const prop=ts.isPropertyAssignment(n.parent)&&n.parent.initializer===n&&humanProps.test(n.parent.name.getText());
      let rendered=false;for(let p=n.parent;p;p=p.parent)if(ts.isJsxExpression(p)){rendered=ts.isJsxElement(p.parent)||ts.isJsxFragment(p.parent);break;}
      if(!/^https?:|^\/|^#[\da-f]+$|^DD\/MM\/YYYY|^(?:id-ID|en-GB)$|^\{[\w{} .-]+\}$|^\S+\/\S+$|^\{\{v\d+\}\}(?:\s*\(\{\{v\d+\}\}\))?$/i.test(text) && (human(text)||/^[A-Z][a-z]+[.!…]$/.test(text)||ts.isJsxText(n)&&/[A-Za-z]/.test(text)||(rendered||prop||ts.isStringLiteral(n)&&ts.isJsxAttribute(n.parent)&&humanProps.test(n.parent.name.getText()))&&/[A-Za-z]/.test(text))) {
        const top=sf.statements.find(s=>s.pos<=n.pos&&s.end>=n.end);
        if(!catalog.has(text)) catalog.set(text,[]);
        catalog.get(text).push({file:path.relative(root,file).replace(/\\/g,'/'),start:n.getStart(sf),end:n.end,kind:ts.SyntaxKind[n.kind],line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,top:top&&ts.isVariableStatement(top)?top.declarationList.declarations.map(d=>d.name.getText(sf)).join(','):null});
      }
      if(template) { for(const s of n.templateSpans) visit(s.expression); return; }
    }
    ts.forEachChild(n,visit);
  }
  visit(sf);
}
fs.mkdirSync(path.join(root,'tmp/localization'),{recursive:true});
fs.writeFileSync(path.join(root,'tmp/localization/catalog.json'),JSON.stringify([...catalog].map(([text,uses])=>({text,uses})),null,2));
console.log(JSON.stringify({phrases:catalog.size,occurrences:[...catalog.values()].reduce((n,x)=>n+x.length,0)},null,2));

