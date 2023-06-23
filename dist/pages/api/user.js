"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@/lib/prisma");
async function handler(req, res) {
    let users = await prisma_1.prisma.user.findMany();
    res.status(200).json("Oke");
}
exports.default = handler;
