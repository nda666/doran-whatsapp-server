"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SigninValidation = void 0;
const next_i18next_1 = require("next-i18next");
const zod_1 = require("zod");
const SigninValidation = (data, res) => {
    var passwordField = next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("password", { field: "password", ns: "common" }).toString();
    const validation = zod_1.z.object({
        email: zod_1.z
            .string()
            .email(next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("email", { field: "Email", ns: "form" }).toString()),
        password: zod_1.z.string({
            required_error: next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("required", { field: passwordField, ns: "form" }).toString(),
        }),
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
exports.SigninValidation = SigninValidation;
