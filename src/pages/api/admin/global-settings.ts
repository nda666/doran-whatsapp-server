import type { NextApiResponse } from "next";
import { DEFAULT_EMAIL_FROM, EMAIL_FROM_KEY, EMAIL_FROM_LABEL, emailFromInput } from "@/lib/emailSettings";
import { DEFAULT_WARMUP_DAILY_LIMITS, WARMUP_DAILY_LIMITS_KEY, WARMUP_DAILY_LIMITS_LABEL, WARMUP_LIMITS_ERROR, parseWarmupDailyLimits } from "@/lib/warmupSettings";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { decryptSetting, encryptSetting, POSTMARK_TOKEN_KEY, secretSetting, settingInput, slugSettingKey } from "@/lib/globalSettings";
import { DEFAULT_DISPATCH_MAX_AGE_DAYS, DISPATCH_MAX_AGE_DAYS_KEY, DISPATCH_MAX_AGE_LABEL, parseDispatchMaxAgeDays } from "@/lib/dispatchSettings";
import { DEFAULT_DISPATCH_QUEUE_ORDER, DISPATCH_QUEUE_ORDER_KEY, DISPATCH_QUEUE_ORDER_LABEL, parseDispatchQueueOrder } from "@/lib/dispatchSettings";
import { DEFAULT_DISPATCH_DELAY, DISPATCH_DELAY_KEY, DISPATCH_DELAY_LABEL, parseDispatchDelayRange } from "@/lib/dispatchSettings";
import { DEFAULT_PHONE_FORM_FIELDS, PHONE_FORM_FIELDS_KEY, PHONE_FORM_FIELDS_LABEL, parsePhoneFormFields } from "@/lib/phoneFormFields";

import { DEVICE_DAILY_QUOTA_KEY, DEVICE_DAILY_QUOTA_LABEL, DEFAULT_DEVICE_DAILY_QUOTA, parseDeviceDailyQuota } from "@/lib/deviceQuota";

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const decode = (row: { id: string; label: string; key: string; value: string }) => ({ ...row, value: decryptSetting(row.value), secret: secretSetting(row.key) });
  if (req.method === "GET") {
    await prisma.globalSetting.createMany({ data: [
      { key: WARMUP_DAILY_LIMITS_KEY, label: WARMUP_DAILY_LIMITS_LABEL, value: encryptSetting(DEFAULT_WARMUP_DAILY_LIMITS.join(",")) },
      { key: DEVICE_DAILY_QUOTA_KEY, label: DEVICE_DAILY_QUOTA_LABEL, value: encryptSetting(String(DEFAULT_DEVICE_DAILY_QUOTA)) },
      { key: EMAIL_FROM_KEY, label: EMAIL_FROM_LABEL, value: encryptSetting(DEFAULT_EMAIL_FROM) },
      { key: PHONE_FORM_FIELDS_KEY, label: PHONE_FORM_FIELDS_LABEL, value: encryptSetting(JSON.stringify(DEFAULT_PHONE_FORM_FIELDS)) },
      { key: DISPATCH_MAX_AGE_DAYS_KEY, label: DISPATCH_MAX_AGE_LABEL, value: encryptSetting(String(DEFAULT_DISPATCH_MAX_AGE_DAYS)) },
      { key: DISPATCH_QUEUE_ORDER_KEY, label: DISPATCH_QUEUE_ORDER_LABEL, value: encryptSetting(DEFAULT_DISPATCH_QUEUE_ORDER) },
      { key: DISPATCH_DELAY_KEY, label: DISPATCH_DELAY_LABEL, value: encryptSetting(JSON.stringify(DEFAULT_DISPATCH_DELAY)) },
    ], skipDuplicates: true });
    const rows = await prisma.globalSetting.findMany({ orderBy: { key: "asc" } });
    return res.json(rows.map(decode));
  }
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).end();
  }
  const schema = req.method === "PATCH" ? settingInput.extend({ id: z.string().uuid() }) : settingInput;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(issue => issue.message).join(", ") });
  const { label, value } = parsed.data;
  const id = "id" in parsed.data ? parsed.data.id as string : undefined;
  const previous = id ? await prisma.globalSetting.findUnique({ where: { id } }) : null;
  if (id && !previous) return res.status(404).json({ message: "Setting tidak ditemukan." });
  const key = previous?.key || slugSettingKey(parsed.data.key?.trim() || label);
  if (!key || key.length > 120) return res.status(400).json({ message: "Key harus menghasilkan slug sepanjang 1–120 karakter." });
  if (previous && parsed.data.key !== undefined && parsed.data.key !== previous.key) return res.status(409).json({ message: "Key tidak dapat diubah setelah dibuat." });
  if (key === DISPATCH_MAX_AGE_DAYS_KEY && parseDispatchMaxAgeDays(value) === null) return res.status(400).json({ message: "Maksimal usia data antrean harus berupa bilangan bulat 1–3650 hari." });
  if (key === DISPATCH_QUEUE_ORDER_KEY && parseDispatchQueueOrder(value) === null) return res.status(400).json({ message: "Pilih data terlama dahulu atau data terbaru dahulu." });
  if (key === WARMUP_DAILY_LIMITS_KEY && parseWarmupDailyLimits(value) === null) return res.status(400).json({ message: WARMUP_LIMITS_ERROR });
  if (key === DEVICE_DAILY_QUOTA_KEY && parseDeviceDailyQuota(value) === null) return res.status(400).json({ message: "Kuota harian harus berupa bilangan bulat 1–100000." });
  if (key === DISPATCH_DELAY_KEY && parseDispatchDelayRange(value) === null) return res.status(400).json({ message: "Jeda harus bilangan bulat 1–30 detik; Hingga harus sama atau lebih besar dari Mulai." });
  if (key === PHONE_FORM_FIELDS_KEY && parsePhoneFormFields(value) === null) return res.status(400).json({ message: "Pilih input form perangkat yang valid, tanpa duplikasi." });
  if (key === POSTMARK_TOKEN_KEY && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) return res.status(400).json({ message: "Format token server Postmark tidak valid." });
  if (key === EMAIL_FROM_KEY && !emailFromInput.safeParse(value).success) return res.status(400).json({ message: "Masukkan alamat email pengirim yang valid." });
  try {
    const data = { label, value: encryptSetting(key === WARMUP_DAILY_LIMITS_KEY ? parseWarmupDailyLimits(value)!.join(",") : value) };
    const row = id ? await prisma.globalSetting.update({ where: { id }, data }) : await prisma.globalSetting.create({ data: { ...data, key } });
    return res.status(id ? 200 : 201).json(decode(row));
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return res.status(409).json({ message: "Key sudah digunakan. Gunakan key lain." });
    throw error;
  }
}
export default apiSuperAdminMiddleware(handler);
