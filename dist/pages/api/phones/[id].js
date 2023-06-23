"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@/lib/prisma");
const apiAuthMiddleware_1 = __importDefault(require("@/middleware/apiAuthMiddleware"));
const jwt_1 = require("next-auth/jwt");
const handler = async (req, res) => {
    const token = await (0, jwt_1.getToken)({ req });
    const phoneId = req.query.id;
    switch (req.method) {
        case "DELETE":
            deletePhone(token === null || token === void 0 ? void 0 : token.id, phoneId === null || phoneId === void 0 ? void 0 : phoneId.toString(), res);
            break;
        default:
            res.status(405).end();
    }
};
async function deletePhone(userId, phoneId, res) {
    const result = (await prisma_1.prisma.phone.deleteMany({
        where: {
            id: phoneId,
            userId,
        },
    })).count >= 0;
    res.status(200).json({ result });
}
exports.default = (0, apiAuthMiddleware_1.default)(handler);
