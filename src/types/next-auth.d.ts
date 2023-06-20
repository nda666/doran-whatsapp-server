import { Session } from "next-auth";
import { JWT } from "next-auth/jwt";
import { DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    id: string;
    token: string;
    email: string;
    user?: User;
  }

  interface DefaultSession {
    user?: User;
    expires: ISODateString;
  }

  interface User {
    id: string;
    token: string;
    email: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    token: string;
    email: string;
  }
}
