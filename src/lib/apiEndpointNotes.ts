// Group the existing documentation without rewriting or omitting API contracts.
export function endpointNoteSections(notes: string) {
  const sections = [
    { title: "Penggunaan & respons", items: [] as string[] },
    { title: "Autentikasi & akses", items: [] as string[] },
    { title: "Parameter & batas", items: [] as string[] },
    { title: "ID request & retry", items: [] as string[] },
    { title: "Status & webhook", items: [] as string[] },
    { title: "Dry run", items: [] as string[] },
    { title: "URL & penanganan error", items: [] as string[] },
  ];
  const sentences = notes.match(/[^]*?(?:\.\s+|$)/g)?.map(item => item.trim()).filter(Boolean) || [];
  for (const sentence of sentences) {
    let index = 0;
    if (/dry_run|dry run/i.test(sentence)) index = 5;
    else if (/curl_error|error cURL|URL dengan dan tanpa/i.test(sentence)) index = 6;
    else if (/^(Simpan data\[\]|Untuk cek|Webhook memakai|Status pengiriman|ID Pengiriman|Untuk cek satu penerima|Postman menyimpan data\[0\])/i.test(sentence)) index = 4;
    else if (/^(job_id|Cakupan satu device|Retry|Gunakan ID|FAILED\/UNCERTAIN|Perlindungan berlaku|Tanpa job_id|store_id default|Prioritas lookup)/i.test(sentence)) index = 3;
    else if (/^(Token|Header Bearer|Bearer atau|Memerlukan token|Admin|Hanya device|Hasil dibatasi|Gunakan token|Upload memakai|Password\/token|Ini bukan endpoint anonim|Respons token|Respons dashboard)/i.test(sentence)) index = 1;
    else if (/^(Maksimal|Teks maksimal|image opsional|media_id|Sticker|2-12|number wajib|Format 08|Bila ada beberapa device|Tanpa pagination|page dan limit|Omit message_key|Alternatif parameter|id_group|multipart\/form-data|Pilih berkas|Jangan isi header|Gambar, video|labels|Contoh memakai|name adalah|qr adalah|timeout dalam|Content-Type|Content-Disposition|Pada cURL|Tidak memuat)/i.test(sentence)) index = 2;
    sections[index].items.push(sentence);
  }
  return sections.filter(section => section.items.length > 0);
}
