import { Callback } from "i18next";
import { CountryCode, parsePhoneNumber } from "libphonenumber-js";
import { NextApiResponse } from "next";
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { ZodError, z } from "zod";

export const SendAttachmentValidation = async (data: any) => {
  const validation = z
    .object({
      sender: z.string({
        required_error: "Field to is required",
      }),
      phoneCode: z.string().optional(),
      caption: z.string().optional(),
      image: z.any().optional(),
    })
    .required({
      sender: true,
      image: true,
    })
    .refine(
      (data) => {
        const tos = data.sender.split(",");
        let result = true;
        tos.forEach((x) => {
          try {
            let _res = parsePhoneNumber(
              x,
              data.phoneCode ? (data.phoneCode as CountryCode) : "ID"
            ).isValid();

            if (!_res) {
              result = false;
              return false;
            }
          } catch (e) {
            result = false;
            return false;
          }
        });
        return result;
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
