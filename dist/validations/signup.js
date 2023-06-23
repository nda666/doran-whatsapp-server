"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signupValidation = void 0;
const prisma_1 = require("@/lib/prisma");
const next_i18next_1 = require("next-i18next");
const zod_1 = require("zod");
const signupValidation = async (data, res) => {
    const validation = zod_1.z
        .object({
        name: zod_1.z.string(),
        email: zod_1.z
            .string()
            .email(next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("email", { field: "Email", ns: "form" }).toString()),
        password: zod_1.z
            .string()
            .min(6, next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("min", { field: "password", value: 6, ns: "form" }).toString()),
        passwordConfirm: zod_1.z.string(),
    })
        .required({
        name: true,
        email: true,
        password: true,
        passwordConfirm: true,
    })
        .refine(async (data) => {
        return (await prisma_1.prisma.user.findUnique({
            where: {
                email: data.email,
            },
        }))
            ? false
            : true;
    }, {
        message: next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("emailExist", { ns: "form" }).toString(),
        path: ["email"],
    })
        .refine((data) => data.password === data.passwordConfirm, {
        message: next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("passwordConfirm", { ns: "form" }).toString(),
        path: ["passwordConfirm"],
    });
    try {
        await validation.parseAsync(data);
    }
    catch (e) {
        if (e instanceof zod_1.ZodError) {
            return res.status(422).json(e);
        }
    }
};
exports.signupValidation = signupValidation;
