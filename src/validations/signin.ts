import { NextApiResponse } from "next";
import { i18n } from "next-i18next";
import { ZodError, z } from "zod";

export const SigninValidation = (data: any, res: NextApiResponse) => {
  var passwordField = i18n
    ?.t("password", { field: "password", ns: "common" })
    .toString();
  const validation = z.object({
    email: z
      .string()
      .email(i18n?.t("email", { field: "Email", ns: "form" }).toString()),
    password: z.string({
      required_error: i18n
        ?.t("required", { field: passwordField, ns: "form" })
        .toString(),
    }),
  });

  try {
    validation.parse(data);
  } catch (e) {
    if (e instanceof ZodError) {
      return res.status(422).json(e);
    }
  }
};
