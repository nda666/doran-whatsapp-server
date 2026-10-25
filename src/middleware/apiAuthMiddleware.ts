import { prisma } from "../lib/prisma";
import { AuthNextApiRequest } from "../types/global";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import { isApproved, isCurrentSession, isSuperAdmin } from "../lib/access";

// 7f76a027-bfa2-4921-82d0-1229a8532c65
export const apiAuthMiddleware =
  (handler: NextApiHandler) =>
  async (req: AuthNextApiRequest, res: NextApiResponse) => {
    const { authorization } = req.headers;

    try {
      const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : undefined;
      const session = !authorization ? await getToken({ req }) : null;
      if (!bearer && (typeof session?.id !== "string" || !session.id)) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!bearer && !["GET", "HEAD", "OPTIONS"].includes(req.method || "")) {
        const origin = req.headers.origin;
        if (!origin || origin !== new URL(process.env.NEXTAUTH_URL!).origin) return res.status(403).json({ message: "Invalid request origin" });
      }
      const user = await prisma.user.findFirst({
        where: bearer ? { token: bearer } : { id: session!.id as string },
      });

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      req.user = user;
      if (!isApproved(user)) return res.status(403).json({ message: user.isActive === false ? "Akun tidak aktif. Hubungi admin." : "Akun belum disetujui admin atau telah ditolak." });
      if (!bearer && !isCurrentSession(user, session!)) return res.status(401).json({ message: "Sesi telah berakhir. Silakan login kembali." });
      if (!isSuperAdmin(user)) {
        const phones = await prisma.phone.findMany({ where: { OR: [{ assignedUserId: user.id }, { assignedUserId: null, userId: user.id }] }, select: { id: true, number: true, userId: true } });
        req.user.accessiblePhoneIds = phones.map(phone => phone.id);
        req.user.accessibleInboxScopes = phones.flatMap(phone => phone.number ? [{ userId: phone.userId, recipient: phone.number }] : []);
      }
      return await handler(req, res);
    } catch (error) {
      console.error("API request failed:", error instanceof Error ? error.message : "Unknown error");
      if (!res.headersSent) return res.status(500).json({ message: "Internal Server Error" });
    }
  };

export default apiAuthMiddleware;
