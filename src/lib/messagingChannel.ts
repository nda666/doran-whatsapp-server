export type MessagingChannel = "whatsapp" | "telegram";
export function isTelegramDevice(phone: { channel?: string }) { return phone.channel === "telegram"; }
export const telegramMessageTypes = ["text", "image"] as const;
export const telegramUnsupportedSettings = ["is_save_group", "readReceipt", "rejectCall", "showOnline", "showTyping", "autoReplyEnabled", "saveIncomingMessages"] as const;
