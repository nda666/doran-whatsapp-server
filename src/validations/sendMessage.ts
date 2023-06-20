import { Callback } from "i18next";
import { CountryCode, parsePhoneNumber } from "libphonenumber-js";
import { NextApiResponse } from "next";
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { ZodError, z } from "zod";

export const SendMessageValidation = async (
  data: any,
  res: NextApiResponse
) => {
  const validation = z
    .object({
      to: z.string({
        required_error: "Field to is required",
      }),
      phoneCode: z.string().optional(),
      text: z.string({
        required_error: "Field text is required",
      }),
    })
    .required({
      text: true,
      to: true,
    })
    .refine(
      (data) =>
        parsePhoneNumber(
          data.to,
          data.phoneCode ? (data.phoneCode as CountryCode) : "ID"
        ).isValid(),
      {
        message: i18n?.t("validation.phone_not_valid").toString(),
        path: ["number"],
      }
    );

  try {
    validation.parse(data);
    return { result: true, error: null };
  } catch (e) {
    if (e instanceof ZodError) {
      res.status(422).send(e);
      return { result: false, error: e };
    }
  }
};
