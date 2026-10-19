import { CountryCode, getCountryCallingCode, parsePhoneNumber } from "libphonenumber-js";

export function normalizePhoneRecipient(input: string, country: CountryCode = "ID"): string {
  const value = input.trim();
  if (/[^\d+()\s.-]/.test(value)) throw new Error("Nomor tujuan tidak valid.");
  const compact = value.replace(/[()\s.-]/g, "");
  if (!/^\+?\d{5,15}$/.test(compact)) throw new Error("Nomor tujuan tidak valid.");
  let candidate = compact;
  // Metadata-based parsing may fail to remove the local trunk prefix or may
  // duplicate 62 on short/legacy Indonesian numbers. Normalize these explicitly.
  if (!candidate.startsWith("+") && country === "ID") {
    if (candidate.startsWith("00")) throw new Error("Gunakan kode negara dengan awalan +.");
    candidate = "+" + (candidate.startsWith("62") ? candidate : "62" + candidate.replace(/^0/, ""));
  }
  getCountryCallingCode(country); // Reject an unsupported default country.
  const phone = parsePhoneNumber(candidate, country);
  // Check international syntax only. Operator/length metadata is not evidence
  // that a legacy number cannot receive WhatsApp messages.
  if (!/^\+[1-9]\d{4,14}$/.test(phone.number)) throw new Error("Nomor tujuan tidak valid.");
  return phone.number.slice(1);
}
