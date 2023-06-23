"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiAuthMiddleware = void 0;
const prisma_1 = require("@/lib/prisma");
// 7f76a027-bfa2-4921-82d0-1229a8532c65
const apiAuthMiddleware = (handler) => async (req, res) => {
    const { authorization } = req.headers;
    if (!authorization || !authorization.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const token = authorization.split(" ")[1];
    try {
        const user = await prisma_1.prisma.user.findFirst({
            where: { token },
        });
        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        req.user = user;
        return handler(req, res);
    }
    catch (error) {
        console.log(error);
        return res.status(401).json({ message: "Unauthorized" });
    }
};
exports.apiAuthMiddleware = apiAuthMiddleware;
exports.default = exports.apiAuthMiddleware;
