import * as socketio from "socket.io";
import { getToken } from "next-auth/jwt";
import { prisma } from "../../lib/prisma";
import { isApproved, isCurrentSession, isSuperAdmin, SUPER_ADMIN_ROOM } from "../../lib/access";
const allowedOrigin = () => new URL(process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000").origin;
const shared = globalThis as typeof globalThis & { doranSocketIO?: socketio.Server };
function createSocketServer() {
  const io = new socketio.Server({
    cors: { origin: (origin, callback) => callback(null, !origin || origin === allowedOrigin()), credentials: true },
    allowRequest: (req, callback) => callback(null, !req.headers.origin || req.headers.origin === allowedOrigin()),
  });
  io.use(async (socket, next) => {
    try {
      const bearer = socket.handshake.auth?.token;
      // IncomingMessage lacks Next.js's parsed cookies. Preserve chunked session cookies.
      const cookies: Record<string, string> = {};
      for (const part of (socket.request.headers.cookie || "").split(";")) {
        const index = part.indexOf("=");
        if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
      }
      const token = typeof bearer !== "string" ? await getToken({ req: { headers: socket.request.headers, cookies } as any }) : null;
      if (!(typeof bearer === "string" && bearer) && !(typeof token?.id === "string" && token.id)) return next(new Error("Unauthorized"));
      const user = await prisma.user.findFirst({ where: typeof bearer === "string" ? { token: bearer } : { id: token!.id as string } });
      if (!user || !isApproved(user)) return next(new Error("Unauthorized"));
      if (token && !isCurrentSession(user, token)) return next(new Error("Unauthorized"));
      if (socket.handshake.auth?.sessionVersion !== undefined && !isCurrentSession(user, socket.handshake.auth)) return next(new Error("Unauthorized"));
      socket.data.userId = user.id;
      await socket.join(user.id);
      if (isSuperAdmin(user)) await socket.join(SUPER_ADMIN_ROOM);
      next();
    } catch (error) { next(new Error("Unauthorized")); }
  });
  return io;
}
export const getSocketIO = shared.doranSocketIO || (shared.doranSocketIO = createSocketServer());

// Resolve the current assignee for every event; existing sockets must not retain
// access after an admin changes an assignment during the same login session.
export async function emitDeviceEvent(phoneId: string, event: string, payload: unknown) {
  try {
    const phone = await prisma.phone.findUnique({ where: { id: phoneId }, select: { userId: true, assignedUserId: true } });
    if (phone) getSocketIO.to(phone.assignedUserId || phone.userId).to(SUPER_ADMIN_ROOM).emit(event, payload);
  } catch { console.error("DEVICE_EVENT_ACCESS_LOOKUP_FAILED", phoneId); }
}
