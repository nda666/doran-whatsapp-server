"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const next_auth_1 = __importDefault(require("next-auth"));
const credentials_1 = __importDefault(require("next-auth/providers/credentials"));
const axios_1 = __importStar(require("axios"));
const client_1 = require("@prisma/client");
const prismaAdapter_1 = require("@/lib/prismaAdapter");
const prisma = new client_1.PrismaClient();
exports.default = (0, next_auth_1.default)({
    pages: {
        signIn: "/signin",
        newUser: "/signup", // New users will be directed here on first sign in (leave the property out if not of interest)
    },
    adapter: (0, prismaAdapter_1.PrismaAdapter)(prisma),
    jwt: {
        secret: process.env.NEXTAUTH_SECRET,
    },
    session: {
        strategy: "jwt",
    },
    callbacks: {
        // authorize({ token }: { token: JWT }) {
        //   if (token) return true; // If there is a token, the user is authenticated
        // },
        async redirect({ url, baseUrl }) {
            // Allows relative callback URLs
            if (url.startsWith("/"))
                return `${baseUrl}${url}`;
            // Allows callback URLs on the same origin
            else if (new URL(url).origin === baseUrl)
                return url;
            return baseUrl;
        },
        async session({ session, token }) {
            const user = await prisma.user.findUnique({
                where: {
                    id: token.id || "",
                },
            });
            if (user && session.user) {
                session.user.id = user === null || user === void 0 ? void 0 : user.id;
                session.user.token = user === null || user === void 0 ? void 0 : user.token;
                session.user.email = user === null || user === void 0 ? void 0 : user.email;
            }
            return session;
        },
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.token = user.token;
                token.email = user.email;
            }
            return token;
        },
    },
    // Configure one or more authentication providers
    providers: [
        (0, credentials_1.default)({
            // The name to display on the sign in form (e.g. 'Sign in with...')
            name: "Credentials",
            // The credentials is used to generate a suitable form on the sign in page.
            // You can specify whatever fields you are expecting to be submitted.
            // e.g. domain, username, password, 2FA token, etc.
            // You can pass any HTML attribute to the <input> tag through the object.
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials, req) {
                try {
                    const result = await axios_1.default.post(process.env.APP_URL + "/api/signin", credentials);
                    if (result.status == 200) {
                        return result.data;
                    }
                }
                catch (e) {
                    if (e instanceof axios_1.AxiosError) {
                        throw new Error(e.message);
                    }
                }
                return null;
            },
        }),
    ],
});
