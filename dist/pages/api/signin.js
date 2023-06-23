"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@/lib/prisma");
const bcrypt_1 = __importDefault(require("bcrypt"));
const validations_1 = require("@/validations");
const next_i18next_1 = require("next-i18next");
async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
    }
    const { email, password } = req.body;
    (0, validations_1.SigninValidation)({ email, password }, res);
    const user = await prisma_1.prisma.user.findFirst({
        where: {
            email: email.trim(),
        },
    });
    if (!user) {
        return res
            .status(401)
            .json({ message: next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("invalid_login").toString() });
    }
    if (!bcrypt_1.default.compareSync(password, user.password)) {
        return res
            .status(401)
            .json({ message: next_i18next_1.i18n === null || next_i18next_1.i18n === void 0 ? void 0 : next_i18next_1.i18n.t("invalid_login").toString() });
    }
    return res
        .status(200)
        .json({ token: user.token, email: user.email, id: user.id });
}
exports.default = handler;
