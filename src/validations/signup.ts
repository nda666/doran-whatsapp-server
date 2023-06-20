import { prisma } from "@/lib/prisma";
import { NextApiResponse } from "next";
import { i18n } from "next-i18next";
import { ZodError, z } from "zod";

export const signupValidation = async (data: any, res: NextApiResponse) => {
  const validation = z
    .object({
      name: z.string(),
      email: z
        .string()
        .email(i18n?.t("email", { field: "Email", ns: "form" }).toString()),
      password: z
        .string()
        .min(
          6,
          i18n?.t("min", { field: "password", value: 6, ns: "form" }).toString()
        ),
      passwordConfirm: z.string(),
    })
    .required({
      name: true,
      email: true,
      password: true,
      passwordConfirm: true,
    })
    .refine(
      async (data) => {
        return (await prisma.user.findUnique({
          where: {
            email: data.email,
          },
        }))
          ? false
          : true;
      },
      {
        message: i18n?.t("emailExist", { ns: "form" }).toString(),
        path: ["email"],
      }
    )
    .refine((data) => data.password === data.passwordConfirm, {
      message: i18n?.t("passwordConfirm", { ns: "form" }).toString(),
      path: ["passwordConfirm"],
    });

  try {
    await validation.parseAsync(data);
  } catch (e) {
    if (e instanceof ZodError) {
      return res.status(422).json(e);
    }
  }
};
