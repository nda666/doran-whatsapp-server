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
    role?: string;
    approvalStatus?: string;
    isActive?: boolean;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionVersion?: number;
    id: string;
    token: string;
    email: string;
  }
}
