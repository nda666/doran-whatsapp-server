import path from "node:path";
export const chatMediaDirectory = () => path.resolve("storage", "chat-media");
export function chatMediaPath(filename: string) {
  if (!/^[a-f\d-]{36}\.bin$/i.test(filename)) throw new Error("INVALID_CHAT_MEDIA");
  return path.join(chatMediaDirectory(), filename);
}
