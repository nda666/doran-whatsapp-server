# Panduan API key untuk pengguna awam

Implementasi lokal: `src/components/AiProviderGuide.tsx` dan integrasi pada `src/pages/dashboard/ai-plugins.tsx`.

Panduan mengikuti provider yang sedang dipilih. Bagian pertama terbuka otomatis dan berisi arti API key, tombol menuju portal resmi, langkah membuat/menyalin key, dan informasi kuota/penagihan. Bagian berikutnya menjelaskan ID model, instruksi bisnis, token, batas permintaan, cara uji, aktivasi Auto Reply, dan kendala umum. Tautan bantuan juga tersedia di bawah kolom API key. Panduan membedakan kuota gratis Gemini dengan pengaturan penagihan provider lain tanpa menjanjikan nominal harga atau akses model tertentu.

Sumber resmi diperiksa pada 16 Oktober 2026:

- OpenAI: https://developers.openai.com/api/docs/quickstart dan https://developers.openai.com/api/docs/guides/production-best-practices
- Google: https://ai.google.dev/gemini-api/docs/api-key dan https://ai.google.dev/gemini-api/docs/billing
- Claude: https://platform.claude.com/docs/en/get-api-key dan https://platform.claude.com/docs/en/about-claude/pricing
- Katalog model ditautkan langsung ke dokumentasi resmi masing-masing penyedia.

Validasi: TypeScript lulus; lint kedua berkas tanpa warning/error; uji browser ketiga provider lulus pada desktop dan lebar ponsel 390 piksel. Pengujian memakai fixture API baca-saja, tidak menyimpan pengaturan, tidak membuka akun penyedia, dan tidak memanggil AI. Screenshot tersedia di `output/ai-key-guide`.

Status: telah di-deploy bersama perbaikan menu composer setelah persetujuan deployment gabungan dari pengguna. Lihat `deployment/composer-ai-guide-deployed-20261016.md`.
