export const statusLabels: Record<string, string> = {
  QUEUED: "Menunggu", PROCESSING: "Diproses", SENT: "Terkirim", DELIVERED: "Diterima", READ: "Dibaca", FAILED: "Gagal", UNCERTAIN: "Perlu diperiksa", SUPPRESSED: "Diblokir",
  WAITING: "Terjadwal", COMPLETED: "Selesai", PAUSED: "Dijeda", CLEARED: "Dibatalkan",
};
export const statusLabel = (value: string) => statusLabels[value] || value;
export function failureCategory(code: string | null) {
  if (!code) return "Tidak diketahui";
  if (/OPTED_OUT/.test(code)) return "Penerima berhenti berlangganan";
  if (/463|RESTRICT|RATE_LIMIT/.test(code)) return "Pembatasan WhatsApp";
  if (/OFFLINE|INACTIVE|SENDER_DELETED/.test(code)) return "Perangkat tidak tersedia";
  if (/MEDIA|STICKER/.test(code)) return "Persiapan media";
  if (/EXPIRED|MAX_AGE/.test(code)) return "Masa antrean berakhir";
  if (/CLEARED/.test(code)) return "Dibatalkan pengguna";
  if (/TIMEOUT/.test(code)) return "Batas waktu pengiriman";
  if (/INVALID|NOT_REGISTERED/.test(code)) return "Nomor atau isi tidak valid";
  return "Gangguan pengiriman lainnya";
}
