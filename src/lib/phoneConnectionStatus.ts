export type PhoneConnectionInfo = {
  state: "online" | "inactive" | "maintenance" | "disabled" | "scan_qr" | "pairing" | "reconnecting" | "waiting" | "conflict" | "rejected" | "session_error" | "unknown";
  label: string;
  description: string;
  qrRequired: boolean | null;
  action: "none" | "scan_qr" | "wait" | "activate" | "contact_admin";
  checkedAt: string;
};

export function describePhoneConnection(input: {
  active: boolean; maintenance: boolean; enabled: boolean; online: boolean;
  pairing: boolean; linked: boolean | null; retrying: boolean; blockedCode?: number;
}): PhoneConnectionInfo {
  const checkedAt = new Date().toISOString();
  const result = (state: PhoneConnectionInfo["state"], label: string, description: string,
    qrRequired: boolean | null, action: PhoneConnectionInfo["action"]): PhoneConnectionInfo => ({ state, label, description, qrRequired, action, checkedAt });
  if (input.maintenance) return result("maintenance", "Sedang dibersihkan", "Tunggu pembersihan perangkat selesai. Status sesi akan diperiksa kembali setelahnya.", null, "wait");
  if (!input.active) return result("inactive", "Perangkat nonaktif", "Aktifkan perangkat terlebih dahulu. Setelah aktif, sistem akan memeriksa apakah sesi masih tertaut atau perlu scan QR.", null, "activate");
  if (!input.enabled) return result("disabled", "Koneksi server dinonaktifkan", "Koneksi WhatsApp dinonaktifkan di server. Hubungi admin untuk mengaktifkannya; kebutuhan scan QR belum dapat dipastikan.", null, "contact_admin");
  if (input.online) return result("online", "Online", "WhatsApp tersambung dan siap mengirim. Tidak perlu scan QR.", false, "none");
  if (input.pairing) return result("pairing", "Menyelesaikan penautan", "QR sudah dipindai. Tunggu WhatsApp menyelesaikan penautan; jangan scan ulang selama proses ini.", false, "wait");
  if (input.blockedCode === 401) return result("scan_qr", "Perlu scan QR ulang", "Sesi login WhatsApp berakhir. Klik Scan QR lalu tautkan kembali melalui Perangkat tertaut di HP.", true, "scan_qr");
  if (input.blockedCode === 403) return result("rejected", "Koneksi ditolak WhatsApp", "Periksa pemberitahuan WhatsApp di HP lalu hubungi admin. Scan QR belum tentu menyelesaikan masalah ini.", null, "contact_admin");
  if (input.blockedCode === 440) return result("conflict", "Koneksi digantikan", "Sesi ini digantikan koneksi lain. Minta admin menutup koneksi ganda lalu menyambungkan kembali. Belum perlu scan QR.", false, "contact_admin");
  if (input.blockedCode === 500 || input.blockedCode === 411) return result("session_error", "Sesi perlu diperiksa", "WhatsApp melaporkan masalah sesi. Hubungi admin untuk memeriksa sesi sebelum melakukan scan QR ulang.", null, "contact_admin");
  if (input.linked === null) return result("unknown", "Status sesi belum terverifikasi", "Sesi belum berhasil diperiksa. Muat ulang atau hubungi admin jika berlanjut; kebutuhan scan QR belum dapat dipastikan.", null, "contact_admin");
  if (!input.linked) return result("scan_qr", "Perlu scan QR", "Sesi login WhatsApp berakhir. Klik Scan QR lalu tautkan kembali melalui Perangkat tertaut di HP.", true, "scan_qr");
  if (input.retrying) return result("reconnecting", "Menyambungkan ulang otomatis", "Sesi masih tertaut. Sistem sedang mencoba menyambungkan kembali. Tidak perlu scan QR; tunggu status Online.", false, "wait");
  return result("waiting", "Menunggu pemulihan otomatis", "Sesi masih tertaut. Sistem memeriksa koneksi setiap 30 detik dan akan mencoba menyambungkan kembali. Tidak perlu scan QR.", false, "wait");
}
