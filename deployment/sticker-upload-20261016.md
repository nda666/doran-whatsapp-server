# Foto menjadi stiker di Jeblast

## Cara pakai

Di **Campaign / Blast → Buat Campaign**, pilih **Kirim sebagai → Stiker**.
Klik **Unggah foto menjadi stiker**, pilih JPG/PNG/WebP statis, lalu tunggu sampai
pratinjau muncul. Hasil otomatis dipilih dan tersimpan di File Manager. Pilih
penerima, perangkat, dan jadwal seperti biasa. Stiker tidak memakai caption.

Alternatif: buka **File Manager**, centang **Ubah foto menjadi stiker WhatsApp**,
unggah foto dan isi label. Pilih hasilnya saat membuat campaign stiker atau dari
fitur Uji Kirim bertipe stiker.

Di **Perangkat → Test Kirim**, pilih tipe **Stiker / foto menjadi stiker** lalu
klik **Unggah foto menjadi stiker**. Hasil otomatis dipilih dan ditampilkan dalam
pratinjau. Setelah konversi selesai, klik **Kirim 1 Pesan Test**. Unggah foto tidak
langsung mengirim pesan. Jika admin menguji perangkat pengguna lain, hasil disimpan
di File Manager pemilik perangkat tersebut.

## Perilaku

- Konversi berjalan di server aplikasi saat unggah. Tidak memakai bot atau API konversi eksternal.
- Foto dirotasi sesuai EXIF, dimuat utuh dalam kanvas 512 × 512 dengan padding transparan, lalu dikompresi menjadi WebP maksimal 100 KB.
- Transparansi yang sudah ada dipertahankan. Tidak menghapus latar belakang foto secara otomatis.
- Batas sumber 25 MB dan 40 megapiksel; GIF, video, serta WebP animasi tidak didukung dalam konversi ini.
- File hasil dipakai ulang untuk semua penerima. Worker hanya membaca dan mengirim WebP yang telah disimpan.
- Unggahan biasa tetap tersimpan dengan format semula.
- Jika konversi salah satu file gagal, semua file batch dibersihkan sebelum pembuatan catatan media. File sementara juga dibersihkan bila penyimpanan database gagal.

## API dan penyimpanan

`POST /api/media` menerima multipart `asSticker=1`, selain `file` dan `labels` yang
sudah ada. Bentuk respons lama tetap berlaku. Hasil konversi tercatat sebagai
`image/webp` dan dapat diambil melalui endpoint media dengan autentikasi.
Test Kirim menyertakan query `phoneId` pada unggahan; endpoint memeriksa akses
perangkat dan menyimpan file atas nama pemilik perangkat.

Pembuatan/edit campaign menerima `messageType: "sticker"`, `mediaId`, serta
`message: ""`. Server memeriksa kepemilikan media, MIME, dan ukuran. Job diberi
payload `{ "kind": "sticker" }` untuk jalur pengiriman stiker yang sudah tersedia.
Jenis campaign disimpan pada JSON `audience.messageType`; tidak memerlukan migrasi
database. Campaign lama tetap memakai jenis `message` dan hash retry yang sama.

Sharp 0.35.5 dijadikan dependensi langsung (sebelumnya sudah terpasang secara
transitif). Instalasi server memakai lockfile terbaru sebelum build dan restart
aplikasi/worker melalui prosedur deployment biasa.

## Verifikasi lokal

```powershell
node deployment/verify-sticker-conversion.cjs
node deployment/verify-sticker-upload.cjs
npm run build
```

Pengujian upload menjalankan handler dengan multipart sesungguhnya dan database
tiruan; tidak mengirim WhatsApp atau menyentuh database produksi. Pengiriman
WhatsApp sungguhan tetap perlu diverifikasi setelah deployment dengan nomor uji.
