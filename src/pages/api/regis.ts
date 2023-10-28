import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import SignupForm, { SignupData } from "@/components/auth/SignupForm";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
    const {name, email, password} = req.body;
    const token = randomUUID();
    // res.status(200).json("wow");
    try {
        const user = await prisma.user.create({
            data: {
                name: name,
                email: email,
                password: bcrypt.hashSync(password, 10),
                token: token
            }
        });

        res.status(200).json({
            message: `create user ${name}`
        });

        throw new Error('there has fault')
    } catch(error:any) {
        res.status(400).json({
            msg: error.message
        })
    }
}