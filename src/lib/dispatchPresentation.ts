export const dispatchStatusInfo: Record<string, { label: string; color: string; description: string }> = {
  QUEUED: { label: "Menunggu pengiriman", color: "gold", description: "Pesan berada dalam antrean pengiriman atau menunggu percobaan ulang. Lihat keterangan untuk rinciannya." },
  PROCESSING: { label: "Mengirim", color: "blue", description: "Pesan sedang dikirim dan belum dikonfirmasi terkirim oleh server WhatsApp." },
  SENT: { label: "Terkirim ke server WA", color: "green", description: "Server WhatsApp telah menerima pesan. Penerimaan oleh tujuan belum dikonfirmasi." },
  DELIVERED: { label: "Diterima tujuan", color: "cyan", description: "WhatsApp telah mengonfirmasi bahwa pesan diterima oleh tujuan." },
  READ: { label: "Dibaca", color: "purple", description: "WhatsApp telah mengonfirmasi bahwa pesan dibaca oleh penerima." },
  FAILED: { label: "Gagal", color: "red", description: "Pengiriman pesan gagal. Lihat kolom Keterangan pada tabel untuk mengetahui penyebabnya." },
  SUPPRESSED: { label: "Diblokir", color: "default", description: "Penerima berada dalam daftar blokir akun dan tidak akan dikirimi pesan." },
  UNCERTAIN: { label: "Perlu diperiksa", color: "orange", description: "Hasil pengiriman belum pasti. Periksa penerima sebelum mengirim ulang." },
};

type QueueJob = { status: string; lastError: string | null; nextAttemptAt: Date; campaign?: { status: string; scheduledAt: Date } | null };
export function dispatchWaitingReason(job: QueueJob, phone?: { active: number; status: string | null } | null, now = new Date()) {
  if (job.status !== "QUEUED") return null;
  if (job.campaign) {
    if (job.campaign.status === "PAUSED") return "Menunggu campaign dilanjutkan.";
    if (job.campaign.status === "CANCELLED") return "Campaign dibatalkan; pesan tidak akan diproses.";
    if (job.campaign.scheduledAt > now) return "Menunggu jadwal campaign.";
  }
  if (!phone) return "Perangkat pengirim tidak ditemukan; menunggu pemeriksaan sistem.";
  if (phone.active !== 1) return "Menunggu perangkat pengirim diaktifkan.";
  if (phone.status !== "OPEN" || job.lastError === "DEVICE_OFFLINE") return "Menunggu perangkat pengirim terhubung ke WhatsApp.";
  if (job.lastError?.startsWith("DEVICE_") && dispatchErrorLabels[job.lastError]) return dispatchErrorLabels[job.lastError];
  if (job.lastError === "MEDIA_PREPARATION_FAILED") return "Menunggu percobaan ulang persiapan lampiran.";
  if (job.lastError === "ACK_TIMEOUT_RETRY") return "Konfirmasi WhatsApp melewati 40 detik; menunggu pengiriman ulang otomatis.";
  if (job.nextAttemptAt > now) return "Menunggu waktu percobaan berikutnya.";
  return "Menunggu giliran diproses dalam antrean dan jeda pengiriman perangkat.";
}

export const dispatchErrorLabels: Record<string, string> = {
  RECIPIENT_ID_UNRESOLVED: "Identitas penerima belum dapat dipetakan ke nomor telepon. Tunggu sinkronisasi kontak sebelum mencoba kembali.",
  RECIPIENT_OPTED_OUT: "Penerima berhenti berlangganan atau diblokir admin.",
  DEVICE_DAILY_LIMIT: "Batas percobaan pengiriman harian tercapai.",
  DEVICE_SAFETY_PAUSED: "Pengiriman dijeda oleh pengamanan perangkat.",
  DEVICE_THROTTLED: "Menunggu interval pengiriman perangkat.",
  DEVICE_INACTIVE: "Perangkat pengirim tidak aktif.", DEVICE_OFFLINE: "Perangkat pengirim belum terhubung ke WhatsApp.",
  MEDIA_PREPARATION_FAILED: "Lampiran belum dapat disiapkan.", SENDER_DELETED: "Perangkat pengirim sudah dihapus.",
  EXPIRED_AFTER_24_HOURS: "Batas waktu menunggu 24 jam telah habis.", CAMPAIGN_EXPIRED: "Batas waktu pengiriman campaign telah habis.",
  QUEUE_MAX_AGE_EXCEEDED: "Usia data antrean melewati batas hari pada Pengaturan Global.",
  ACK_UNKNOWN_CHECK_RECIPIENT: "Konfirmasi server WhatsApp belum diterima. Periksa penerima sebelum mengirim ulang.",
  ACK_TIMEOUT_RETRY: "Konfirmasi WhatsApp melewati 40 detik. Diulang otomatis dengan jeda 1, 2, 4, lalu 8 menit, maksimal 5 percobaan.",
  ACK_TIMEOUT_RETRY_EXHAUSTED: "Lima percobaan selesai tanpa konfirmasi WhatsApp. Pengulangan dihentikan; pesan mungkin sudah diterima.",
  WA_ACK_463_ACCOUNT_RESTRICTED: "WhatsApp menolak pesan dengan kode 463: akun dibatasi atau izin memulai percakapan belum tersedia. Pengulangan otomatis dihentikan.",
  WORKER_INTERRUPTED_CHECK_RECIPIENT: "Proses pengiriman terputus. Periksa penerima sebelum mengirim ulang.",
};
