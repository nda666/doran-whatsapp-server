import { z } from "zod";

export const cleanupLabels = {
  disconnect: "Putuskan koneksi/socket dan sesi WhatsApp aktif",
  clearAuth: "Logout WhatsApp dan hapus file autentikasi di server (scan QR ulang)",
  clearContacts: "Hapus cache kontak perangkat",
  clearHistory: "Hapus percakapan tersimpan, lampiran, riwayat, dan antrean pengiriman perangkat",
  clearAutoReplies: "Hapus auto-reply terkait perangkat",
  resetToken: "Hapus token API lama dan ganti dengan token baru",
  resetSettings: "Kosongkan webhook dan kembalikan preferensi WhatsApp ke bawaan",
  deleteRecord: "Hapus baris perangkat dari tabel phones",
};
export type PhoneCleanupOptions = Record<keyof typeof cleanupLabels, boolean>;
export const defaultCleanupOptions: PhoneCleanupOptions = {
  disconnect: true, clearAuth: true, clearContacts: true, clearHistory: true,
  clearAutoReplies: true, resetToken: true, resetSettings: true, deleteRecord: false,
};
export const phoneCleanupSchema = z.object({
  disconnect: z.boolean(), clearAuth: z.boolean(), clearContacts: z.boolean(),
  clearHistory: z.boolean(), clearAutoReplies: z.boolean(), resetToken: z.boolean(), resetSettings: z.boolean(), deleteRecord: z.boolean(),
}).strict().refine(o => Object.values(o).some(Boolean), "Pilih minimal satu tindakan.")
  .refine(o => !o.clearAuth || o.disconnect, "Penghapusan autentikasi wajib memutus koneksi.")
  .refine(o => !o.deleteRecord || (o.disconnect && o.clearAuth && o.clearAutoReplies && o.resetToken), "Hapus entri wajib membersihkan sesi, autentikasi, auto-reply, dan token API.");
