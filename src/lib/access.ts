import type { User } from "@prisma/client";
export const SUPER_ADMIN_EMAIL = "admin@gmail.com";
export const SUPER_ADMIN_ROOM = "dashboard:super-admin";
type Account = Pick<User, "id" | "email" | "role" | "approvalStatus">;
export function isSuperAdmin(user: Pick<User, "id" | "email"> & Partial<Pick<User, "role" | "approvalStatus" | "isActive">>) {
  return isApproved(user) && user.role === "ADMIN" && user.email?.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}
export function isSuperAdminPage(pathname: string) {
  return ["/dashboard/admin", "/dashboard/plans"].some(path => pathname === path || pathname.startsWith(`${path}/`));
}
/** Only the designated admin can see data across owners. */
export function ownerScope(user: Account): { userId?: string } {
  return isSuperAdmin(user) ? {} : { userId: user.id };
}
export function isApproved(user: Partial<Pick<User, "approvalStatus" | "isActive">>) {
  return user.approvalStatus === "APPROVED" && user.isActive !== false;
}
export function isCurrentSession(user: Pick<User, "sessionVersion">, token: { sessionVersion?: unknown }) {
  return (token.sessionVersion ?? 0) === (user.sessionVersion ?? 0);
}
