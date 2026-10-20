## Node.js

Gunakan Node.js **24.21.0** untuk pengembangan, pengujian, CI, dan produksi.
Versi proyek dicatat pada `.nvmrc` dan `.node-version`; GitHub Actions membaca
`.nvmrc`. `npm install`/`npm ci` menolak versi Node.js yang berbeda melalui
`engines.node` dan `.npmrc`.

Setelah memasang versi tersebut, buka terminal baru dan periksa `node --version`.
Jika memakai nvm, jalankan `nvm install 24.21.0` lalu `nvm use 24.21.0`.
Jalankan `npm ci` sebelum build atau pengujian. Launcher Windows
`Jalankan Lokal.cmd` memakai runtime tersendiri pada `storage/local/runtime`;
runtime tersebut juga harus menggunakan 24.21.0.
Build Windows menggunakan satu worker untuk menghindari batas file terbuka (`EMFILE`).

VsCode i18n Ally setting:

```json
{
  "i18n-ally.localesPaths": ["public/locales"],
  "i18n-ally.keystyle": "nested",
  "i18n-ally.dirStructure": "dir",
  "i18n-ally.enabledFrameworks": ["i18next", "react-i18next"],
  "i18n-ally.namespace": true
}
```
