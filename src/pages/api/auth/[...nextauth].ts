import axios, { AxiosError } from "axios";
import NextAuth, { Session } from "next-auth";
import { Adapter } from "next-auth/adapters";
import { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";

import { PrismaAdapter } from "@/lib/prismaAdapter";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default NextAuth({
  pages: {
    signIn: "/signin",
    newUser: "/signup", // New users will be directed here on first sign in (leave the property out if not of interest)
  },
  adapter: PrismaAdapter(prisma) as Adapter,
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
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      const user = await prisma.user.findUnique({
        where: {
          id: token.id || "",
        },
      });

      if (user && session.user) {
        session.user.id = user?.id;
        session.user.token = user?.token;
        session.user.email = user?.email!;
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
    CredentialsProvider({
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
          const result = await axios.post(
            process.env.NEXT_PUBLIC_APP_URL + "/api/signin",
            credentials
          );
          if (result.status == 200) {
            return result.data;
          }
        } catch (e) {
          if (e instanceof AxiosError) {
            throw new Error(e.message);
          }
        }

        return null;
      },
    }),
  ],
});
