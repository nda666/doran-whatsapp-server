import { prisma } from "@/lib/prisma";
import { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcrypt";
import { SigninValidation } from "@/validations";
import { i18n } from "next-i18next";
import jwt from "jsonwebtoken";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
  }
  const { email, password } = req.body;

  SigninValidation({ email, password }, res);

  const user = await prisma.user.findFirst({
    where: {
      email: email.trim(),
    },
  });
  if (!user) {
    return res
      .status(401)
      .json({ message: i18n?.t("invalid_login").toString() });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    return res
      .status(401)
      .json({ message: i18n?.t("invalid_login").toString() });
  }
  return res
    .status(200)
    .json({ token: user.token, email: user.email, id: user.id });
}
