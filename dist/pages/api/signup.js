"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@/lib/prisma");
const bcrypt_1 = __importDefault(require("bcrypt"));
const validations_1 = require("@/validations");
const crypto_1 = require("crypto");
async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
    }
    const { name, email, password, passwordConfirm } = req.body;
    await (0, validations_1.signupValidation)({ name, email, password, passwordConfirm }, res);
    const token = (0, crypto_1.randomUUID)();
    let users = await prisma_1.prisma.user.create({
        data: {
            name: name,
            email: email,
            password: bcrypt_1.default.hashSync(password, 10),
            token,
        },
    });
    return res.status(200).json({ result: "success" });
}
exports.default = handler;
