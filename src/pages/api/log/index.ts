import type {
  NextApiRequest,
  NextApiResponse,
} from 'next';
import { getToken } from 'next-auth/jwt';

import { prisma } from '@/lib/prisma';
import apiAuthMiddleware from '@/middleware/apiAuthMiddleware';
import { AuthNextApiRequest } from '@/types/global';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case "GET":
      return GET(req, res);
    default:
      res.status(405).end();
  }
}

const GET = async (req: AuthNextApiRequest, res: NextApiResponse) => {
  const token = await getToken({ req });
  console.log(token);
  try {
    const { limit = 10, page = 1, sender, recipient } = req.query;

    const limitNumber = parseInt(limit as string) || 10;
    const pageNumber = parseInt(page as string) || 1;
    await prisma.inboxMessage.updateMany({
      where: {
        userId: null,
      },
      data: {
        userId: token?.id,
      },
    });
    const inbox = await prisma.inboxMessage.findMany({
      where: {
        userId: token?.id,
        ...(sender && {
          sender: {
            contains: String(sender), // Case-insensitive search, adjust if needed
          },
        }),
        ...(recipient && {
          recipient: {
            contains: String(recipient), // Case-insensitive search, adjust if needed
          },
        }),
      },
      take: limitNumber, // Fetch an extra item to determine if there’s a next page
      skip: limitNumber * (pageNumber - 1), // Skip the cursor item itself
      orderBy: { id: "desc" },
    });

    const totalData = await prisma.inboxMessage.count({
      where: {
        userId: token?.id,
        ...(sender && {
          sender: {
            contains: String(sender), // Case-insensitive search, adjust if needed
          },
        }),
        ...(recipient && {
          recipient: {
            contains: String(recipient), // Case-insensitive search, adjust if needed
          },
        }),
      },
    });
    const totalPage = Math.ceil(totalData / limitNumber);

    res.status(200).json({
      data: inbox,
      totalPage: totalPage,
      totalData: totalData,
      currentPage: pageNumber,
    });
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
};

export default apiAuthMiddleware(handler);
