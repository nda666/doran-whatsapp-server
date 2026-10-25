import type { User } from "@prisma/client";
export const SUPER_ADMIN_EMAIL = "admin@gmail.com";
export const SUPER_ADMIN_ROOM = "dashboard:super-admin";
type Account = Pick<User, "id" | "email" | "role" | "approvalStatus"> & { accessiblePhoneIds?: string[]; accessibleInboxScopes?: { userId: string; recipient: string }[] };
export function isSuperAdmin(user: Pick<User, "id" | "email"> & Partial<Pick<User, "role" | "approvalStatus" | "isActive">>) {
  return isApproved(user) && user.role === "ADMIN" && user.email?.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}
export function isSuperAdminPage(pathname: string) {
  return ["/dashboard/admin", "/dashboard/plans", "/dashboard/sender-groups", "/dashboard/ai-plugins"].some(path => pathname === path || pathname.startsWith(`${path}/`));
}
/** Only the designated admin can see data across owners. */
export function ownerScope(user: Account): { userId?: string } {
  return isSuperAdmin(user) ? {} : { userId: user.id };
}
// NOT keeps the access constraint separate from user supplied id/phoneId filters.
// Missing access context denies all devices rather than falling back to all data.
export function phoneScope(user: Account) {
  return isSuperAdmin(user) ? {} : { NOT: { id: { notIn: user.accessiblePhoneIds || [] } } };
}
export function phoneRecordScope(user: Account) {
  return isSuperAdmin(user) ? {} : { NOT: { phoneId: { notIn: user.accessiblePhoneIds || [] } } };
}
export function conversationScope(user: Account) {
  return isSuperAdmin(user) ? {} : { phone: phoneScope(user) };
}
export function campaignScope(user: Account) {
  return isSuperAdmin(user) ? {} : { userId: user.id, NOT: { dispatches: { some: { phoneId: { notIn: user.accessiblePhoneIds || [] } } } } };
}
export function inboxScope(user: Account) {
  return isSuperAdmin(user) ? {} : { AND: [{ OR: user.accessibleInboxScopes || [] }] };
}
export function isApproved(user: Partial<Pick<User, "approvalStatus" | "isActive">>) {
  return user.approvalStatus === "APPROVED" && user.isActive !== false;
}
export function isCurrentSession(user: Pick<User, "sessionVersion">, token: { sessionVersion?: unknown }) {
  return (token.sessionVersion ?? 0) === (user.sessionVersion ?? 0);
}
