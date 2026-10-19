# Diagnosis antrean pengiriman 18 Oktober 2026 WIB

Diperiksa 19 Oktober 2026 WIB secara baca-saja setelah deploy UI.

## Temuan utama

- Ada 5.430 pesan dibuat tanggal 18, bukan total nol.
- 4.768 pesan tanggal 18 masih QUEUED; seluruhnya mempunyai lastError DEVICE_OFFLINE.
- Seluruh backlog tanggal 18 itu terikat ke 20 perangkat pengirim. Kedua puluhnya aktif secara administratif, tetapi status koneksi CLOSE dan isOnline=false.
- Kredensial sesi creds.json untuk semua 20 perangkat tidak ditemukan pada direktori sesi yang benar dari proses PM2 produksi.
- Worker aktif, polling dan recovery berjalan; WHATSAPP_ENABLED=true dan DISPATCH_QUEUE_ENABLED=true.
- Health dispatch mengeluarkan BACKLOG_AGE_EXCEEDED dan SENDER_OFFLINE_WITH_BACKLOG. Ada 42 socket perangkat lain terhubung, tetapi 20 perangkat yang mempunyai backlog tidak ada yang terhubung. Total backlog yang masih dalam batas usia dari semua tanggal: 8.018 pesan saat pemeriksaan.
- Kebijakan 20 perangkat tidak paused. Bukan daily quota/safety pause yang tercatat sebagai alasan antrean saat ini.

## Pengiriman nyata tanggal 18

Agregasi berdasarkan sentAt pada 18/10/2026 00:00–23:59:59 WIB menunjukkan 704 pesan. Aktivitas ada pada jam 06 sampai 22 WIB. Waktu terkirim terakhir yang tercatat adalah 18/10/2026 22:46:54 WIB.

Dari pesan yang dibuat tanggal 18, 662 mempunyai status SENT/DELIVERED/READ; perbedaan dengan 704 disebabkan waktu pembuatan dan waktu terkirim tidak selalu pada tanggal yang sama.

## Kesimpulan dan tindak lanjut

Antrean yang tertahan belum dapat dikirim karena perangkat pengirimnya offline dan sesi login tidak tersedia. Perangkat tersebut memerlukan penautan ulang melalui QR agar dapat mengirim. Setelah terhubung, worker akan memproses pesan yang masih memenuhi batas usia data (pengaturan saat ini 3 hari) dan aturan pengiriman lain.

Penyebab historis hilangnya sesi (logout, pencabutan perangkat tertaut atau tindakan lain) belum dapat dipastikan dari log yang tersedia. Tidak dilakukan reset, pengiriman ulang, pemindahan pengirim, penghapusan sesi atau perubahan batas pengiriman dalam pemeriksaan ini.

Filter Sumber=Web juga menghasilkan nol pada tanggal 18 karena semua data tanggal itu bersumber API, tetapi hal ini berbeda dari penyebab antrean tidak terkirim. Jawaban filter saja belum menjelaskan hambatan proses pengiriman.
