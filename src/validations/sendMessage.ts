import { Callback } from "i18next";
import { CountryCode } from "libphonenumber-js";
import { normalizePhoneRecipient } from "../utils/normalizePhoneRecipient";
import { NextApiResponse } from "next";
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { ZodError, z } from "zod";

export const SendMessageValidation = async (data: any) => {
  const validation = z
    .object({
      number: z.string({
        error: issue => issue.input === undefined ? "Field to is required" : undefined,
      }),
      phoneCountry: z.string().optional(),
      phoneCode: z.string().optional(),
      message: z.string({
        error: issue => issue.input === undefined ? "Field text is required" : undefined,
      }),
    })
    .required({
      message: true,
      number: true,
    })
    .refine(
      (data) => {
        try {
          return data.number.split(",").every(number => !!normalizePhoneRecipient(
            number, (data.phoneCountry || data.phoneCode || "ID") as CountryCode,
          ));
        } catch { return false; }
      },
      {
        message: "Number wrong formated",
        path: ["number"],
      }
    );

  try {
    const res = validation.parse(data);

    return { result: true, error: null };
  } catch (e) {
    if (e instanceof ZodError) {
      return { result: false, error: e };
    } else {
      return { result: false, error: "Something happen to server" };
    }
  }
};
