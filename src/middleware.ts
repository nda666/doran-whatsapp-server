import { getToken } from 'next-auth/jwt';
import withAuth from 'next-auth/middleware';
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

  if (req.nextUrl.pathname === "/signup") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const guestUrl = ["/", "/signin"];
  if (guestUrl.includes(req.nextUrl.pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (guestUrl.includes(req.nextUrl.pathname) && !isAuthenticated) {
    return NextResponse.next();
  }

  const authMiddleware = await withAuth({
    pages: {
      signIn: `/signin`,
      newUser: `/signup`,
    },
  });

  // @ts-expect-error
  return authMiddleware(req, event);
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
