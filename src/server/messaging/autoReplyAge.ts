import { prisma } from "../../lib/prisma";
import { decryptSetting } from "../../lib/globalSettings";
import { AUTO_REPLY_MAX_AGE_KEY, DEFAULT_AUTO_REPLY_MAX_AGE_SECONDS, parseAutoReplyMaxAge } from "../../lib/autoReplyAge";

export async function getAutoReplyMaxAgeSeconds() {
  const setting = await prisma.globalSetting.findUnique({ where: { key: AUTO_REPLY_MAX_AGE_KEY } });
  const seconds = setting ? parseAutoReplyMaxAge(decryptSetting(setting.value)) : DEFAULT_AUTO_REPLY_MAX_AGE_SECONDS;
  if (seconds === null) throw new Error("INVALID_AUTO_REPLY_MAX_AGE");
  return seconds;
}
