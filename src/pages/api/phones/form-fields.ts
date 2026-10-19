import type { NextApiResponse } from "next";
import type { AuthNextApiRequest } from "@/types/global";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { getWarmupDailyLimits } from "@/server/dispatch/settings";
import { prisma } from "@/lib/prisma";
import { decryptSetting } from "@/lib/globalSettings";
import { DEFAULT_PHONE_FORM_FIELDS, PHONE_FORM_FIELDS_KEY, parsePhoneFormFields } from "@/lib/phoneFormFields";

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end(); }
  const setting = await prisma.globalSetting.findUnique({ where: { key: PHONE_FORM_FIELDS_KEY } });
  const fields = setting ? parsePhoneFormFields(decryptSetting(setting.value)) : DEFAULT_PHONE_FORM_FIELDS;
  if (!fields) return res.status(500).json({ message: "Pengaturan form perangkat tidak valid." });
  return res.json({ fields, warmupLimits: await getWarmupDailyLimits() });
}
export default apiAuthMiddleware(handler);
