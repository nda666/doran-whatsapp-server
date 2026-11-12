# Audit selisih status online dan koneksi worker

Tanggal: 12 November 2026, WIB. Audit baca-saja produksi dan reproduksi terisolasi memakai modul build produksi dengan database tiruan. Tidak ada deployment, restart, penghapusan auth, perubahan database, atau pengiriman pesan. Script dijalankan lewat stdin; tidak membuat artefak sementara lokal/server.

## Hasil

Ada dua bug lifecycle yang saling memperkuat:

1. Kegagalan pelepasan lease auth dapat meninggalkan owner di memori dengan Promise `close()` yang sudah rejected. Pembuatan auth berikutnya menunggu Promise yang sama dan gagal sebelum mencoba memperoleh lease baru. Kesalahan sementara dapat membuat recovery macet selama proses tetap hidup.
2. Callback kehilangan auth menandai socket retired, mengakhirinya, dan menghapusnya dari map sesi, tetapi tidak menyimpan status offline. Handler `connection.update` kemudian melewati socket retired melalui `activeOwner()`. Database dapat terus menyimpan `isOnline=true` dan `status=OPEN` meskipun worker tidak mempunyai koneksi.

Ini didukung log produksi dan reproduksi mekanisme pertama pada build produksi. State owner di memori proses aktif tidak dibaca langsung; hubungan error per perangkat dengan owner rejected adalah diagnosis yang sangat kuat, bukan dump langsung memori produksi. Penyebab awal gangguan database belum dapat ditetapkan.

## Bukti produksi

Pada sekitar 15.17, database menandai 49 perangkat online, sedangkan `/health/dispatch` melihat 44 koneksi aktif. Lima perangkat yang hilang:

| Perangkat | Log `WA_AUTH_CLOSE_FAILED` | Recovery gagal pertama yang ditemukan hari ini |
| --- | --- | --- |
| Doran - JETE Nota 2 | 06.00.54 | 06.01.12 |
| Doran - JETE Nota 22 | 06.01.51 | 06.02.13 |
| Store DG Bandung | 06.15.27 | 06.15.42 |
| Store DG TSM Makassar | 08.24.41 | 08.24.41 |
| JETE Official Store - JETE Transicon | 10.27.03 | 10.27.12 |

Empat perangkat pertama selain TSM Makassar berulang kali memunculkan error `prisma.waAuthSession.updateMany(): Server has closed the connection.` TSM Makassar mengulang MySQL 1205, `Lock wait timeout exceeded; try restarting transaction`. Pengulangan recovery berlangsung sekitar setiap 30 detik, sampai lebih dari seribu kali untuk beberapa perangkat, dengan pesan error yang sama.

Snapshot 15.46.58 menunjukkan 47 online di database dan 43 koneksi aktif. Nota 22, Bandung, Transicon, dan TSM Makassar masih memiliki selisih. Nota 2 sudah tidak masuk himpunan online palsu; ini tidak membuktikan koneksinya pulih. Semua lease auth keempat perangkat tersebut sudah kedaluwarsa beberapa jam sebelumnya, sehingga bukti tidak mendukung penjelasan bahwa mereka hanya menunggu lease aktif berakhir.

Worker tetap polling dan menerima ACK untuk perangkat lain. Tidak ditemukan alasan untuk menyimpulkan semua koneksi terpisah antara Next.js dan custom server: map sesi memang memakai `globalThis`. Empat source inti produksi sama dengan lokal setelah normalisasi CRLF/LF.

Pembacaan metadata transaksi InnoDB ditolak dengan kode database 1227; tabel lock waits yang dicoba tidak tersedia (1109). Tidak dilakukan perubahan privilege atau penghentian transaksi. Karena itu pemilik lock dan penyebab awal putusnya koneksi database belum terbukti.

## Reproduksi terisolasi

Memuat `dist/src/server/libs/waAuthState.js` ke VM dengan Prisma tiruan, tanpa database asli, WhatsApp, atau penulisan file. Skenario: buat auth, gagalkan satu pelepasan lease, kemudian coba buat auth lagi setelah mock database sudah sehat.

Hasil assertion:

```json
{"closeFailed":true,"reconnectFailed":true,"replayedOriginalError":true,"acquireCalls":1,"releaseCalls":1,"staleOwnerRetained":true}
```

`acquireCalls=1` membuktikan percobaan kedua berhenti sebelum memperoleh lease baru; `releaseCalls=1` membuktikan pelepasan tidak dicoba ulang. Error lama dikembalikan lagi dari Promise yang tersimpan.

## Lokasi kode dan arah perbaikan

- `src/server/libs/waAuthState.ts:73`: pembuatan auth menunggu penutupan owner lama.
- `src/server/libs/waAuthState.ts:114`: Promise penutupan dimemoisasi; penghapusan owner ada sesudah update lease. Jika update gagal, owner tertinggal dengan Promise rejected.
- `src/server/libs/makeWASocket.ts:90`: callback kehilangan auth menghentikan socket tanpa persist status offline.
- `src/server/libs/makeWASocket.ts:228`: `activeOwner()` melewati event socket retired sehingga jalur penyimpanan offline normal tidak tercapai.
- `src/server/waRecovery.ts`: loop recovery mencoba lagi, tetapi tidak dapat melewati owner gagal tersebut.

Perbaikan perlu memisahkan penutupan owner lokal dari pelepasan lease database: owner yang sudah retired tidak boleh memblokir recovery selamanya, tetapi akuisisi lease baru tetap wajib menolak owner lain yang masih sah. Tambahkan rekonsiliasi status koneksi dengan perlindungan terhadap event socket lama yang datang setelah socket pengganti aktif. Uji gangguan write/heartbeat, gagal release, lease belum/sudah kedaluwarsa, serta reconnect lintas bundle.

Belum menerapkan patch atau restart. Audit ini membuktikan bug dan dampaknya; keberhasilan pemulihan produksi belum diuji. Tidak ada file sementara yang perlu dibersihkan; laporan ini disimpan sebagai hasil audit.

Tindak lanjut: patch telah diterapkan dan diverifikasi pada hari yang sama. Lihat [hasil perbaikan, verifikasi produksi, dan cleanup](online-reconnect-fix-20261112.md).
