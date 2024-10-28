import { prisma } from '@/lib/prisma';

/**
 * Retrieves a list of auto replies associated with a specific phone ID.
 *
 * @param phoneId - The phone ID for which to retrieve auto replies.
 * @returns A promise that resolves to an array of auto replies.
 */
export const getAutoReplyByPhoneId = async (phoneId: any) =>
  await prisma.autoReply.findMany({
    where: {
      phoneId: phoneId,
    },
  });
