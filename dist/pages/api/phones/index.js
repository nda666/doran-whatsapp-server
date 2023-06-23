"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@/lib/prisma");
const apiAuthMiddleware_1 = __importDefault(require("@/middleware/apiAuthMiddleware"));
const jwt_1 = require("next-auth/jwt");
async function handler(req, res) {
    switch (req.method) {
        case "GET":
            return GET(req, res);
        case "POST":
            return POST(req, res);
        default:
            res.status(405).end();
    }
}
const GET = async (req, res) => {
    var _a;
    const token = await (0, jwt_1.getToken)({ req });
    try {
        const phones = await prisma_1.prisma.phone.findMany({
            where: {
                userId: (_a = req === null || req === void 0 ? void 0 : req.user) === null || _a === void 0 ? void 0 : _a.id,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        res.status(200).json(phones);
    }
    catch (err) {
        res.status(500).end();
    }
};
const POST = async (req, res) => {
    var _a;
    let phones = undefined;
    if (req.body.id) {
        phones = await prisma_1.prisma.phone.update({
            where: {
                id: req.body.id,
            },
            data: {
                name: req.body.name,
            },
        });
    }
    else {
        phones = await prisma_1.prisma.phone.create({
            data: {
                userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.id,
                name: req.body.name,
            },
        });
    }
    return res.status(200).json(phones);
};
exports.default = (0, apiAuthMiddleware_1.default)(handler);
