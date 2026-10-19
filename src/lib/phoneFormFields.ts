export const PHONE_FORM_FIELDS_KEY = "device-form-visible-fields";
export const PHONE_FORM_FIELDS_LABEL = "Input tambahan form perangkat";
export const PHONE_FORM_FIELDS = [
  { value: "saveIncomingMessages", label: "Simpan Pesan Masuk" },
  { value: "autoReplyEnabled", label: "Aktifkan Balasan Otomatis" },
  { value: "readReceipt", label: "Read receipt" },
  { value: "rejectCall", label: "Tolak panggilan" },
  { value: "showOnline", label: "Tampilkan online" },
  { value: "showTyping", label: "Tampilkan typing saat mengirim" },
] as const;
export type PhoneFormField = typeof PHONE_FORM_FIELDS[number]["value"];
export const DEFAULT_PHONE_FORM_FIELDS = PHONE_FORM_FIELDS.map(field => field.value);
export function parsePhoneFormFields(value: string): PhoneFormField[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some(key => !DEFAULT_PHONE_FORM_FIELDS.includes(key)) || new Set(parsed).size !== parsed.length) return null;
    return DEFAULT_PHONE_FORM_FIELDS.filter(key => parsed.includes(key));
  } catch { return null; }
}
