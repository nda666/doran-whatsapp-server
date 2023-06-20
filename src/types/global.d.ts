import { User } from "@prisma/client";
import { NextApiRequest } from "next";

export interface AuthNextApiRequest extends NextApiRequest {
  user?: User;
}
