import { z } from "zod";
import { normalizePhoneRecipient } from "../utils/normalizePhoneRecipient";

const fieldPattern = /^[a-z][a-z0-9_]{0,49}$/;
const reserved = new Set(["nama", "nomor", "constructor", "prototype", "__proto__"]);
export const campaignDataSchema = z.record(
  z.string().refine(key => fieldPattern.test(key) && !reserved.has(key), "Nama kolom tambahan tidak valid. Gunakan huruf kecil, angka, dan underscore; awali dengan huruf. Nama/nomor dan nama properti sistem tidak boleh dipakai."),
  z.string().max(2000, "Nilai kolom maksimal 2.000 karakter."),
).superRefine((data, ctx) => {
  if (Object.keys(data).length > 30) ctx.addIssue({ code: "custom", message: "Maksimal 30 kolom tambahan per penerima." });
});
export const campaignRecipientSchema = z.object({
  number: z.string().max(100), name: z.string().max(200).default(""), data: campaignDataSchema.optional(),
});
export type CampaignRecipient = z.infer<typeof campaignRecipientSchema>;

export function campaignVariables(message: string): string[] {
  return Array.from(new Set(Array.from(message.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g), match => match[1])));
}

export function renderCampaignMessage(message: string, recipient: CampaignRecipient): string {
  const number = normalizePhoneRecipient(recipient.number);
  const data = recipient.data || {};
  const missing = campaignVariables(message).filter(key => !["nama", "nomor"].includes(key) &&
    (!Object.prototype.hasOwnProperty.call(data, key) || !data[key].trim()));
  if (missing.length) throw new Error(`Penerima ${number}: data ${missing.map(key => `{${key}}`).join(", ")} belum diisi.`);
  // One replacement pass: values containing braces or dollar signs stay literal.
  const rendered = message.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key: string) =>
    key === "nama" ? recipient.name || number : key === "nomor" ? number : data[key]);
  if (rendered.length > 10000) throw new Error(`Pesan untuk ${number} melebihi 10.000 karakter setelah personalisasi.`);
  return rendered;
}

export function parseCampaignRows(rows: unknown[][]): CampaignRecipient[] {
  const nonEmpty = rows.filter(row => row.some(cell => String(cell ?? "").trim()));
  if (nonEmpty.length < 2) throw new Error("Isi header dan minimal satu penerima.");
  if (nonEmpty.length > 10001) throw new Error("Maksimal 10.000 penerima.");
  const headers = nonEmpty[0].map(cell => String(cell ?? "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_"));
  if (!headers.includes("nomor")) throw new Error("Header wajib: nomor. Kolom nama bersifat opsional.");
  if (new Set(headers).size !== headers.length || headers.some(key => !key)) throw new Error("Header kolom tidak boleh kosong atau duplikat.");
  const extra = headers.filter(key => !["nama", "nomor"].includes(key));
  campaignDataSchema.parse(Object.fromEntries(extra.map(key => [key, ""])));
  const seen = new Set<string>();
  return nonEmpty.slice(1).map((row, index) => {
    try {
      if (row.length > headers.length && row.slice(headers.length).some(cell => String(cell ?? "").trim())) throw new Error("Ada nilai tanpa header kolom.");
      if (row.some(cell => cell instanceof Date)) throw new Error("Simpan tanggal sebagai teks, misalnya 16/10/2026.");
      const values = Object.fromEntries(headers.map((key, i) => [key, String(row[i] ?? "").trim()]));
      const number = normalizePhoneRecipient(values.nomor);
      if (seen.has(number)) throw new Error(`Nomor ${number} duplikat. Gunakan satu baris per penerima.`);
      seen.add(number);
      return campaignRecipientSchema.parse({ number, name: values.nama || "", data: Object.fromEntries(extra.map(key => [key, values[key]])) });
    } catch (error) {
      throw new Error(`Baris ${index + 2}: ${error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(", ") : error instanceof Error ? error.message : "Data tidak valid."}`);
    }
  });
}

export function mergeCampaignRecipients(contacts: CampaignRecipient[], recipients: CampaignRecipient[]): CampaignRecipient[] {
  const targets = new Map<string, CampaignRecipient>();
  for (const contact of contacts) targets.set(normalizePhoneRecipient(contact.number), contact);
  const seen = new Set<string>();
  for (const recipient of recipients) {
    const number = normalizePhoneRecipient(recipient.number);
    if (seen.has(number) && (Object.keys(recipient.data || {}).length || Object.keys(targets.get(number)?.data || {}).length)) throw new Error(`Nomor ${number} duplikat di penerima campaign. Gunakan satu baris per penerima.`);
    seen.add(number);
    targets.set(number, { ...recipient, number });
  }
  return Array.from(targets.values());
}
