import type { Prisma } from "@prisma/client";

export const mediaTypeOptions = [
  { value: "image", label: "Gambar" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "document", label: "Dokumen" },
];

export function mediaSearchWhere(query: { q?: unknown; type?: unknown }): Prisma.MediaAssetWhereInput {
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 255) : "";
  const type = typeof query.type === "string" ? query.type : "";
  const conditions: Prisma.MediaAssetWhereInput[] = [];
  if (q) conditions.push({ OR: [{ name: { contains: q } }, { originalName: { contains: q } }] });
  if (["image", "video", "audio"].includes(type)) conditions.push({ mime: { startsWith: `${type}/` } });
  if (type === "document") conditions.push({ OR: [{ mime: { startsWith: "application/" } }, { mime: { startsWith: "text/" } }] });
  return conditions.length ? { AND: conditions } : {};
}
