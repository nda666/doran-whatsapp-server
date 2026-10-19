import { z } from "zod";

export const testSendTypes = [
  { value: "text", label: "Teks" }, { value: "image", label: "Gambar" },
  { value: "video", label: "Video" }, { value: "audio", label: "Audio" },
  { value: "document", label: "Dokumen" }, { value: "sticker", label: "Stiker / foto menjadi stiker" },
  { value: "button", label: "Button / tombol" }, { value: "list", label: "List / daftar pilihan" },
  { value: "poll", label: "Polling" }, { value: "location", label: "Lokasi" },
  { value: "vcard", label: "Kontak / vCard" },
];
export const testSendRequest = z.object({
  number: z.string().min(1).max(32).refine(value => !value.includes(",")),
  type: z.enum(["text", "image", "video", "audio", "document", "sticker", "button", "list", "poll", "location", "vcard"]).default("text"),
  message: z.string().max(1000).default(""),
  mediaId: z.string().min(1).max(128).optional(),
  payload: z.unknown().optional(),
});
export function matchesTestMedia(type: string, mime: string) {
  if (type === "sticker") return mime === "image/webp";
  if (["image", "video", "audio"].includes(type)) return mime.startsWith(`${type}/`);
  return type === "document" && !/^(image|video|audio)\//.test(mime);
}
