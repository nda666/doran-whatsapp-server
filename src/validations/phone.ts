import { parsePhoneNumber } from "libphonenumber-js";
import { NextApiResponse } from "next";
import { i18n } from "next-i18next";
import { ZodError, z } from "zod";

export const PhoneValidation = (data: any, res: NextApiResponse) => {
  const validation = z
    .object({
      number: z.string(),
    })
    .refine((data) => parsePhoneNumber(data.number).isValid(), {
      message: i18n?.t("validation.phone_not_valid").toString(),
      path: ["number"],
    });

  try {
    validation.parse(data);
  } catch (e) {
    if (e instanceof ZodError) {
      return res.status(422).json(e);
    }
  }
};
