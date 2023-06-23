"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePhoneStatusAndOnline = void 0;
const prisma_1 = require("./prisma");
const updatePhoneStatusAndOnline = async (id, status, isOnline) => {
    return await prisma_1.prisma.phone.updateMany({
        where: {
            id,
        },
        data: {
            status,
            isOnline,
        },
    });
};
exports.updatePhoneStatusAndOnline = updatePhoneStatusAndOnline;
