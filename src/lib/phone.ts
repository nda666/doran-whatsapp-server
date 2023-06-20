import { PhoneStatus } from "@prisma/client";
import { prisma } from "./prisma";

export const updatePhoneStatusAndOnline = async (
  id: string,
  status: PhoneStatus,
  isOnline: boolean
) => {
  return await prisma.phone.updateMany({
    where: {
      id,
    },
    data: {
      status,
      isOnline,
    },
  });
};
