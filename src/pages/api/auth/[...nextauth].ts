import NextAuth from "next-auth";
import { Adapter } from "next-auth/adapters";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { i18n } from "next-i18next";
import axios, { AxiosError } from "axios";
import { getToken } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";
import { PrismaAdapter } from "@/lib/prismaAdapter";
import { signOut } from "next-auth/react";

const prisma = new PrismaClient();

export default NextAuth({
  pages: {
    signIn: "/signin",
    newUser: "/signup", // New users will be directed here on first sign in (leave the property out if not of interest)
  },
  adapter: PrismaAdapter(prisma) as Adapter<boolean>,
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ req, token }) {
      if (token) return true; // If there is a token, the user is authenticated
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
    async session({ session, token }) {
      const user = await prisma.user.findUnique({
        where: {
          id: token.id || "",
        },
      });

      if (!user) {
        return null;
      }

      session.user.id = user?.id;
      session.user.token = user?.token;
      session.user.email = user?.email!;
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
            process.env.APP_URL + "/api/signin",
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
