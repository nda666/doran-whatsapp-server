import { prisma } from "@/lib/prisma";
import { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcrypt";
import { signupValidation } from "@/validations";
import { randomUUID } from "crypto";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
  }
  const { name, email, password, passwordConfirm } = req.body;

  await signupValidation({ name, email, password, passwordConfirm }, res);

  const token = randomUUID();

  let users = await prisma.user.create({
    data: {
      name: name,
      email: email,
      password: bcrypt.hashSync(password, 10),
      token,
    },
  });
  return res.status(200).json({ result: "success" });
}
