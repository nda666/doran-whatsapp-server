"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhoneValidation = void 0;
const libphonenumber_js_1 = require("libphonenumber-js");
const next_i18next_1 = require("next-i18next");
const zod_1 = require("zod");
const PhoneValidation = (data, res) => {
    const validation = zod_1.z
        .object({
        number: zod_1.z.string(),
    })
        .refine((data) => (0, libphonenumber_js_1.parsePhoneNumber)(data.number).isValid(), {
        message: next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("validation.phone_not_valid").toString(),
        path: ["number"],
    });
    try {
        validation.parse(data);
    }
    catch (e) {
        if (e instanceof zod_1.ZodError) {
            return res.status(422).json(e);
        }
    }
};
exports.PhoneValidation = PhoneValidation;
