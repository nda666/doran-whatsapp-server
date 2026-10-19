import sharp from "sharp";

export const stickerMaxBytes = 100 * 1024;

/** Convert locally, before enqueueing. Never run this for each recipient. */
export async function photoToSticker(input: Buffer): Promise<Buffer> {
  const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1) {
    throw new Error("Gunakan foto JPG, PNG, atau WebP statis.");
  }
  const base = image.rotate().resize(512, 512, {
    fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  for (const quality of [85, 70, 55, 40, 25, 10]) {
    const output = await base.clone().webp({ quality, alphaQuality: 80, effort: 4 }).timeout({ seconds: 10 }).toBuffer();
    if (output.length <= stickerMaxBytes) return output;
  }
  throw new Error("Foto terlalu kompleks untuk stiker. Gunakan foto yang lebih sederhana.");
}
