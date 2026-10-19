# Respons kasir pada modal webhook

Aktif 12 Oktober 2026 (Asia/Jakarta). Build `HsJVX5NzbDAU4iPjxyZuE`.
Backup `/home/jeblast/backups/doran-dispatch-webhook-response-1791739945`.

Blok hasil pengiriman pada modal menampilkan Event ID, kode HTTP endpoint kasir, dan body respons dalam textarea read-only. JSON diformat agar mudah dibaca; respons non-JSON tampil sebagai teks asli. Respons kosong diberi label, dan kegagalan tanpa respons HTTP ditampilkan eksplisit. Tinggi textarea dibatasi lima baris agar modal tetap ringkas. Detail webhook/Salin lengkap tetap tersedia.

Build Linux dan pemeriksaan API/bundle lulus. Browser diuji melalui satu webhook DELIVERED menggunakan dispatch sintetis terminal FAILED, job_id null, store webhook-ui-test dan recipient dummy. Hasil HTTP 200, result=true, messages_updated=0; Event ID `ea51dd43-b5df-4277-95b7-6bf21fbfe45c`. Respons JSON terlihat langsung pada blok hasil. Dispatch sintetis `ae586318-dd89-4044-b428-b0d1b2bb0ef8` dibersihkan sesudah tes; metadata event audit dipertahankan. Tidak ada pengiriman WhatsApp atau perubahan pesan kasir pelanggan. Screenshot output/dispatch-webhook-response.png. Pengaturan webhook tidak diubah.
