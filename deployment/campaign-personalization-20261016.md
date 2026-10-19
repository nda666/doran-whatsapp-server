# Personalisasi campaign dengan kolom tambahan

Status: berhasil deploy pada 17 Oktober 2026 (WIB), build `dIp0oXfqlqPui51WKIyEO`. Detail tersedia pada `campaign-personalization-deployed-20261017.md`. Tidak ada migrasi database: data per penerima disimpan pada JSON `Campaign.audience.recipients[].data` yang sudah tersedia. Pesan hasil personalisasi disimpan dalam antrean saat campaign dibuat atau diedit.

## Penggunaan

1. Buka Campaign / Blast, buat campaign, dan isi perangkat pengirim.
2. Pada **Data penerima & kolom tambahan**, unduh contoh CSV, impor CSV/Excel `.xlsx`, atau tempel CSV langsung. Impor mengganti seluruh data pada bagian tersebut. Excel memakai sheet pertama.
3. Header wajib `nomor`; `nama` opsional. Tambahkan header sendiri seperti `no_invoice`, `nominal`, `nama_produk`, `tanggal_jatuh_tempo`. Header dinormalisasi ke huruf kecil dan spasi/tanda minus menjadi underscore. Nama kolom harus diawali huruf, hanya memakai huruf kecil/angka/underscore, maksimal 50 karakter. `nama`, `nomor`, serta properti sistem tidak dapat dijadikan kolom tambahan lewat API.
4. Isi pesan, misalnya `Halo {nama}, invoice {no_invoice} sebesar {nominal} untuk {nama_produk} jatuh tempo {tanggal_jatuh_tempo}.`
5. Periksa tabel data dan pratinjau per penerima, lalu simpan campaign. Pengiriman mengikuti jadwal yang dipilih.

Kolom ekstra disimpan per campaign, bukan pada phonebook. Data tersimpan tetap tersedia saat membuka edit campaign. Template Pesan yang dipilih dalam campaign mempertahankan seluruh placeholder agar terisi per penerima.

## Aturan data

- Maksimal 10.000 penerima, 30 kolom tambahan per penerima, 2.000 karakter per nilai, dan file impor 3 MB. Batas request API 3 MB tetap berlaku, termasuk metadata campaign dan JSON penerima.
- CSV memakai pemisah koma; bungkus nilai yang berisi koma/baris baru dengan tanda kutip ganda. Simpan nomor, kode invoice, tanggal, serta nominal berformat khusus sebagai teks di Excel. Nilai numerik dibaca sebagai teks; angka nol tetap `0`. Sel tanggal Excel ditolak dengan petunjuk untuk mengubahnya menjadi teks agar formatnya tidak berubah tanpa sengaja.
- Nilai tidak diberi format mata uang/tanggal otomatis. Tulis `Rp 150.000` atau `20/10/2026` sesuai pesan yang diinginkan. Nol di depan kode harus disimpan sebagai teks pada file sumber.
- Placeholder memakai `{nama_kolom}`. Setiap penerima wajib memiliki nilai nonkosong untuk semua placeholder yang dipakai. Pesan hasil penggantian maksimal 10.000 karakter. Nama kosong memakai nomor penerima.
- Isi nilai diperlakukan secara literal: placeholder di dalam nilai tidak diproses ulang.
- Nomor lokal/internasional dinormalisasi sebelum deteksi duplikat. Impor menolak nomor duplikat agar data transaksi tidak tertimpa. Satu nomor hanya dapat memiliki satu baris personalisasi per campaign; beberapa invoice untuk nomor sama perlu diringkas menjadi satu nilai atau memakai campaign berbeda.
- Kontak dari phonebook/grup dan data tambahan dengan nomor sama menghasilkan satu target, memakai baris data tambahan. Penerima grup yang tidak memiliki data untuk placeholder akan ditolak saat penyimpanan, sebelum antrean berubah. Hindari memasukkan nomor yang sama di input manual dan data tambahan. Perilaku deduplikasi lama tetap berlaku untuk input tanpa kolom tambahan.
- Pratinjau menggunakan baris pada bagian data tambahan; pilihan pratinjau dibatasi 100 penerima pertama, sedangkan tabel dan validasi tetap mencakup semua data. Validasi server juga memeriksa penerima dari grup/phonebook.
- Pratinjau tidak mengirim pesan. Saat impor sedang diproses, tombol simpan dinonaktifkan.

## API

Endpoint create dan edit campaign menerima bentuk penerima berikut. Endpoint dan aturan kepemilikan tetap sama.

```json
{
  "recipients": [
    {
      "number": "6281234567890",
      "name": "Budi",
      "data": {
        "no_invoice": "INV-001",
        "nominal": "Rp 150.000",
        "nama_produk": "Headset",
        "tanggal_jatuh_tempo": "20/10/2026"
      }
    }
  ]
}
```

## Verifikasi lokal

- `node deployment/verify-campaign-personalization.cjs`: lulus. Memeriksa parser baris, CSV quoted/multiline, round-trip data edit, placeholder literal, nilai kosong/nol, batas kolom/panjang pesan, nomor duplikat, kompatibilitas lama dan stiker, stabilitas hash, serta route create/edit dengan database dan auth tiruan. Memastikan validasi gagal sebelum mutasi dan memeriksa rendering komponen lewat SSR.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: lulus.
- Lint file yang diubah: lulus tanpa warning/error.

Tes memakai data sintetis. Tidak mengakses database nyata, tidak mengirim WhatsApp, tidak melakukan deploy. Interaksi browser dan upload `.xlsx` end-to-end belum diuji; parser diuji dengan tipe nilai sel Excel termasuk numerik, teks, dan tanggal.
