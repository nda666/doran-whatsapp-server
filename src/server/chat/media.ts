import path from "node:path";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
export const chatMediaDirectory = () => path.resolve("storage", "chat-media");
export function chatMediaPath(filename: string) {
  if (!/^[a-f\d-]{36}\.bin$/i.test(filename)) throw new Error("INVALID_CHAT_MEDIA");
  return path.join(chatMediaDirectory(), filename);
}

/** Backpressure keeps inbound attachments off the heap; remove partial files on any failure. */
export async function writeChatMedia(source: AsyncIterable<Uint8Array>, maximumBytes: number) {
  const filename = `${randomUUID()}.bin`;
  await fs.mkdir(chatMediaDirectory(), { recursive: true });
  let size = 0;
  try {
    await pipeline(Readable.from(source), new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        callback(size > maximumBytes ? new Error("CHAT_MEDIA_TOO_LARGE") : null, chunk);
      },
    }), createWriteStream(chatMediaPath(filename), { flags: "wx" }));
    return filename;
  } catch (error) {
    await fs.unlink(chatMediaPath(filename)).catch(() => {});
    throw error;
  }
}
