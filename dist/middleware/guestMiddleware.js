"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guestMiddleware = void 0;
const jwt_1 = require("next-auth/jwt");
// 7f76a027-bfa2-4921-82d0-1229a8532c65
const guestMiddleware = (handler) => async (req, res) => {
    const token = await (0, jwt_1.getToken)({ req });
    return handler(req, res);
};
exports.guestMiddleware = guestMiddleware;
exports.default = exports.guestMiddleware;
