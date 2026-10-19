// Established Unicode emoji, sent as ordinary message text (never images or shortcodes).
export const chatEmojiGroups: readonly { name: string; items: readonly (readonly [string, string])[] }[] = [
  { name: "Senyum", items: [
    ["😀", "senang senyum grin"], ["😃", "gembira smile"], ["😄", "bahagia tertawa"], ["😁", "senyum lebar"],
    ["😆", "tertawa laugh"], ["😂", "tertawa menangis lucu"], ["😊", "senyum ramah malu"], ["😉", "kedip wink"],
    ["😍", "suka cinta love"], ["😘", "cium kiss"], ["😎", "keren cool"], ["😇", "malaikat baik"],
    ["😋", "enak yummy"], ["😜", "bercanda lidah"], ["😅", "keringat lega"], ["😌", "lega tenang"],
    ["😢", "sedih menangis"], ["😭", "menangis keras"], ["😔", "kecewa maaf"], ["😞", "sedih kecewa"],
    ["😮", "terkejut wow"], ["😱", "kaget takut"], ["😴", "tidur ngantuk"], ["😷", "masker sakit"],
  ] },
  { name: "Gestur", items: [
    ["👍", "jempol setuju bagus oke"], ["👎", "tidak setuju"], ["👌", "oke ok"], ["✌️", "damai peace"],
    ["👋", "halo salam dadah"], ["👏", "tepuk tangan selamat"], ["🙌", "hore berhasil"], ["🙏", "terima kasih mohon maaf doa"],
    ["💪", "semangat kuat"], ["👊", "semangat kepalan"], ["👆", "atas tunjuk"], ["👇", "bawah tunjuk"],
    ["👉", "kanan tunjuk"], ["👈", "kiri tunjuk"], ["✋", "tangan berhenti"], ["🤝", "salaman sepakat"],
  ] },
  { name: "Hati", items: [
    ["❤️", "hati merah cinta love"], ["💛", "hati kuning"], ["💚", "hati hijau"], ["💙", "hati biru"],
    ["💜", "hati ungu"], ["💕", "dua hati cinta"], ["💖", "hati bersinar"], ["💝", "hadiah hati"],
    ["💔", "patah hati"], ["💯", "seratus sempurna"], ["✨", "kilau bintang"], ["🎉", "selamat pesta perayaan"],
    ["🎊", "konfeti pesta"], ["🎁", "hadiah kado"], ["🎂", "ulang tahun kue"], ["🌹", "bunga mawar"],
  ] },
  { name: "Layanan", items: [
    ["📦", "paket pesanan barang"], ["🚚", "kirim pengiriman kurir"], ["🛒", "belanja keranjang"], ["🛍️", "belanja tas"],
    ["💰", "uang harga bayar"], ["💳", "kartu pembayaran"], ["📞", "telepon hubungi"], ["📱", "ponsel hp whatsapp"],
    ["📍", "lokasi alamat"], ["🏠", "rumah alamat"], ["🏪", "toko usaha"], ["🕒", "jam waktu layanan"],
    ["📅", "tanggal jadwal kalender"], ["📝", "catatan tulis"], ["📋", "daftar catatan"], ["📧", "email surat"],
  ] },
  { name: "Lainnya", items: [
    ["✅", "benar selesai berhasil cek"], ["❌", "salah batal gagal"], ["❗", "penting seru"], ["❓", "pertanyaan tanya"],
    ["⚠️", "perhatian peringatan"], ["⭐", "bintang favorit"], ["🔥", "api panas promo"], ["💡", "ide lampu"],
    ["☀️", "matahari pagi"], ["🌙", "bulan malam"], ["🌈", "pelangi warna"], ["🌻", "bunga matahari"],
    ["☕", "kopi minum"], ["🍵", "teh minum"], ["🍔", "burger makan"], ["🍕", "pizza makan"],
  ] },
] as const;

export function insertChatEmoji(text: string, emoji: string, selectionStart: number, selectionEnd: number, maxLength = 10000) {
  let start = Math.max(0, Math.min(text.length, Math.min(selectionStart, selectionEnd)));
  let end = Math.max(start, Math.min(text.length, Math.max(selectionStart, selectionEnd)));
  const insidePair = (position: number) => position > 0 && /[\uD800-\uDBFF]/.test(text[position - 1]) && /[\uDC00-\uDFFF]/.test(text[position] || "");
  if (start === end && insidePair(start)) { start--; end = start; }
  else { if (insidePair(start)) start--; if (insidePair(end)) end++; }
  const result = text.slice(0, start) + emoji + text.slice(end);
  return result.length <= maxLength ? { text: result, caret: start + emoji.length } : null;
}
