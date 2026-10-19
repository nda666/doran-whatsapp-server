import { prisma } from "../../lib/prisma";
import { phoneMaintenance } from "../libs/phoneMaintenance";
import { normalizePhoneRecipient } from "../../utils/normalizePhoneRecipient";
export async function cacheDeviceContacts(userId: string, phoneId: string, contacts: { id?: string; name?: string; notify?: string; verifiedName?: string }[]) {
  if (phoneMaintenance.has(phoneId)) return;
  if (!await prisma.phone.findFirst({ where: { id: phoneId, userId } })) return;
  const data: { userId: string; phoneId: string; number: string; name: string }[] = [];
  for (const c of contacts.slice(0, 10000)) {
    if (!c.id?.endsWith("@s.whatsapp.net")) continue;
    try { data.push({ userId, phoneId, number: normalizePhoneRecipient(c.id.split("@")[0]), name: (c.name || c.notify || c.verifiedName || "").slice(0, 200) }); } catch { /* Ignore groups and non-phone identifiers. */ }
  }
  if (data.length && !phoneMaintenance.has(phoneId)) await prisma.deviceContact.createMany({ data, skipDuplicates: true });
}
