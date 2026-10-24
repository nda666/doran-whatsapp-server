export function telegramEnabled() {
  return process.env.TELEGRAM_ENABLED === "true" && !!process.env.TELEGRAM_API_KEY?.trim();
}
