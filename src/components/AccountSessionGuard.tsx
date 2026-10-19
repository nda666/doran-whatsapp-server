import { useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { io } from "socket.io-client";
import { localizedPath } from "@/lib/localizedPath";

// NextAuth returns null on client fetch errors as well as expired sessions.
// Confirm with a successful response before deleting the browser's login cookie.
export async function checkAccountSession(signal: AbortSignal): Promise<"active" | "inactive" | "unavailable"> {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store", redirect: "error", signal });
    if (!response.ok) return "unavailable";
    const session = await response.json();
    if (session === null || (typeof session === "object" && !Array.isArray(session) && Object.keys(session).length === 0)) return "inactive";
    if (!session || typeof session !== "object" || typeof session.expires !== "string") return "unavailable";
    return session.user?.id && session.user.isActive !== false ? "active" : "inactive";
  } catch { return "unavailable"; }
}

export default function AccountSessionGuard() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const signingOut = useRef(false);
  const dashboard = router.pathname.startsWith("/dashboard");
  const userId = session?.user?.id, token = session?.user?.token, version = session?.user?.sessionVersion;
  const valid = !!userId && session?.user?.isActive !== false;
  useEffect(() => {
    if (!dashboard || status === "loading") return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const logout = async () => {
      if (signingOut.current) return;
      signingOut.current = true;
      try { await signOut({ callbackUrl: localizedPath("/signin?reason=inactive", router.locale) }); }
      catch {
        signingOut.current = false;
        if (!cancelled) retry = setTimeout(() => void confirmSession(), 5000);
      }
    };
    const confirmSession = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      const result = await checkAccountSession(controller.signal);
      clearTimeout(timeout);
      if (cancelled) return;
      if (result === "inactive") { await logout(); return; }
      if (result === "active") {
        try { await update(); } catch { /* Retry without clearing the login cookie. */ }
      }
      if (!cancelled) retry = setTimeout(() => void confirmSession(), 5000);
    };
    const cleanup = () => { cancelled = true; clearTimeout(retry); controller?.abort(); };
    if (!valid) { void confirmSession(); return cleanup; }
    const socket = io({ path: "/socket.io", auth: { token, sessionVersion: version ?? 0 } });
    socket.on("account:disabled", () => { void logout(); });
    return () => { cleanup(); socket.disconnect(); };
  }, [dashboard, status, valid, userId, token, version, update]);
  return null;
}
