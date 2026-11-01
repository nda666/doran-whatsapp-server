import { CountryCode } from "libphonenumber-js";
import { normalizePhoneRecipient } from "../utils/normalizePhoneRecipient";
import { z, ZodError } from "zod";

export const SendAttachmentValidation = async (data: any) => {
  const validation = z
    .object({
      number: z.string({
        error: issue => issue.input === undefined ? "Field to is required" : undefined,
      }),
      api_key: z.string({
        error: issue => issue.input === undefined ? "Field to is required" : undefined,
      }),
      phoneCountry: z.string().optional(),
      phoneCode: z.string().optional().default("ID"),
      caption: z.string().optional(),
    })
    .required({
      number: true,
      api_key: true,
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

    return { result: true, error: null, data: res };
  } catch (e) {
    if (e instanceof ZodError) {
      return { result: false, error: e, data: undefined };
    } else {
      return {
        result: false,
        error: "Something happen to server",
        data: undefined,
      };
    }
  }
};
