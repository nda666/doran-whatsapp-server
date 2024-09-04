import { CountryCode, parsePhoneNumber } from "libphonenumber-js";
import { z, ZodError } from "zod";

export const SendAttachmentValidation = async (data: any) => {
  const validation = z
    .object({
      number: z.string({
        required_error: "Field to is required",
      }),
      api_key: z.string({
        required_error: "Field to is required",
      }),
      phoneCode: z.string().optional().default("ID"),
      caption: z.string().optional(),
    })
    .required({
      number: true,
      api_key: true,
    })
    .refine(
      (data) => {
        const tos = data.number.split(",");
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
