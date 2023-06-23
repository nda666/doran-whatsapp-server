"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendMessageValidation = void 0;
const libphonenumber_js_1 = require("libphonenumber-js");
const zod_1 = require("zod");
const SendMessageValidation = async (data) => {
    const validation = zod_1.z
        .object({
        number: zod_1.z.string({
            required_error: "Field to is required",
        }),
        phoneCode: zod_1.z.string().optional(),
        message: zod_1.z.string({
            required_error: "Field text is required",
        }),
    })
        .required({
        message: true,
        number: true,
    })
        .refine((data) => {
        const tos = data.number.split(",");
        let result = true;
        tos.forEach((x) => {
            try {
                let _res = (0, libphonenumber_js_1.parsePhoneNumber)(x, data.phoneCode ? data.phoneCode : "ID").isValid();
                if (!_res) {
                    result = false;
                    return false;
                }
            }
            catch (e) {
                result = false;
                return false;
            }
        });
        return result;
    }, {
        message: "Number wrong formated",
        path: ["number"],
    });
    try {
        const res = validation.parse(data);
        return { result: true, error: null };
    }
    catch (e) {
        if (e instanceof zod_1.ZodError) {
            return { result: false, error: e };
        }
        else {
            return { result: false, error: "Something happen to server" };
        }
    }
};
exports.SendMessageValidation = SendMessageValidation;
