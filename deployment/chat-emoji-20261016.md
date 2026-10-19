# Emoji pada Percakapan

Implementasi lokal menambahkan tombol senyum di sebelah tombol +. Panel berisi 88 emoji Unicode umum, kategori, dan pencarian dalam bahasa Indonesia. Pemilihan menyisipkan karakter asli ke posisi kursor atau mengganti seleksi teks, lalu mengembalikan fokus dan kursor ke kolom pesan. Batas 10.000 unit UTF-16 tetap mengikuti validasi pesan aplikasi; emoji tidak dipotong jika batas tidak mencukupi.

Emoji diteruskan sebagai teks biasa melalui alur pengiriman yang sudah ada, tanpa gambar, stiker, shortcode, atau pemuatan layanan emoji eksternal. Bentuk gambar emoji mengikuti perangkat/versi penerima. Referensi format: https://www.unicode.org/reports/tr51/ . Tidak ada perubahan database atau endpoint pengiriman.

Berkas aplikasi:

- `src/lib/chatEmoji.ts`
- `src/components/ChatEmojiPicker.tsx`
- `src/styles/ChatEmojiPicker.module.css`
- `src/pages/dashboard/conversations.tsx`

Validasi lulus: TypeScript; lint; `deployment/verify-chat-emoji.cjs` (grapheme, Unicode, posisi kursor/seleksi, batas UTF-16, JSON); `deployment/verify-conversations.cjs` (emoji disimpan dan diteruskan ke socket WhatsApp tiruan tanpa perubahan); `deployment/verify-chat-emoji-ui.cjs` (pencarian/kategori, penyisipan tengah teks dan penggantian seleksi, pemulihan kursor, batas pesan, request kirim simulasi, layar 390 piksel dengan panel seluruhnya terlihat, serta perangkat offline).

Screenshot: `output/chat-emoji/desktop-picker.png` dan `output/chat-emoji/mobile-picker.png`. Tidak ada pesan WhatsApp nyata yang dikirim dalam pengujian. Penerimaan pada perangkat WhatsApp nyata belum diuji.

Status: telah di-deploy setelah persetujuan pengguna. Lihat `deployment/chat-emoji-deployed-20261016.md` untuk hasil pemeriksaan produksi.
