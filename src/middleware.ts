import { getToken } from 'next-auth/jwt';
import { localizedPath } from './lib/localizedPath';
import {
  NextFetchEvent,
  NextRequest,
  NextResponse,
} from 'next/server';

export default async function middleware(
  req: NextRequest,
  event: NextFetchEvent
) {
  const token = await getToken({ req });
  const isAuthenticated = !!token;
  const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;

  const guestUrl = ["/", "/signin", "/signup"];
  if (guestUrl.includes(req.nextUrl.pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL(localizedPath("/dashboard", req.nextUrl.locale), baseUrl));
  }

  if (guestUrl.includes(req.nextUrl.pathname) && !isAuthenticated) {
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    const signinUrl = new URL(localizedPath("/signin", req.nextUrl.locale), baseUrl);
    signinUrl.searchParams.set("callbackUrl", localizedPath(req.nextUrl.pathname, req.nextUrl.locale) + req.nextUrl.search);
    return NextResponse.redirect(signinUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/signin",
    "/signup",
    "/dashboard",
    "/dashboard/:path*",
    "/signout",
  ],
};
