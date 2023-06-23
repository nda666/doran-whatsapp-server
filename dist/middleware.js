"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const jwt_1 = require("next-auth/jwt");
const middleware_1 = __importDefault(require("next-auth/middleware"));
const server_1 = require("next/server");
async function middleware(req, event) {
    const token = await (0, jwt_1.getToken)({ req });
    const isAuthenticated = !!token;
    if (req.nextUrl.pathname === "/signup") {
        return server_1.NextResponse.redirect(new URL("/dashboard", req.url));
    }
    const guestUrl = ["/", "/signin"];
    if (guestUrl.includes(req.nextUrl.pathname) && isAuthenticated) {
        return server_1.NextResponse.redirect(new URL("/dashboard", req.url));
    }
    if (guestUrl.includes(req.nextUrl.pathname) && !isAuthenticated) {
        return server_1.NextResponse.next();
    }
    const authMiddleware = await (0, middleware_1.default)({
        pages: {
            signIn: `/signin`,
            newUser: `/signup`,
        },
    });
    // @ts-expect-error
    return authMiddleware(req, event);
}
exports.default = middleware;
exports.config = {
    matcher: [
        "/",
        "/signin",
        "/signup",
        "/dashboard",
        "/dashboard/phone",
        "/signout",
    ],
};
