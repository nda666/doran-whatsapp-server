import { PhoneStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';

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

export const getPhoneById = async (phoneId: any) =>
  await prisma.phone.findUnique({
    where: {
      id: phoneId,
    },
  });
