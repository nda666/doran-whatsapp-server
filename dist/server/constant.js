"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WaSockQrTimeout = void 0;
exports.WaSockQrTimeout = parseInt(process.env.WHATSAPP_QRTIMEOUT || "30") * 1000;
