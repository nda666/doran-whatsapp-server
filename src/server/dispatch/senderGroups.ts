import type { Phone } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export async function hasEnabledSenderGroup(phone: Pick<Phone, "senderGroupId" | "userId">) {
  return !!phone.senderGroupId && !!await prisma.senderGroup.findFirst({
    where: { id: phone.senderGroupId, userId: phone.userId, enabled: true }, select: { id: true },
  });
}
