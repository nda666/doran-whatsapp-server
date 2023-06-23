"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const baileys_1 = require("@whiskeysockets/baileys");
const fs = __importStar(require("fs"));
const whatsappSocket_1 = __importDefault(require("../whatsappSocket"));
const constant_1 = require("../constant");
function connectionUpdate(io, waSock, userId, phoneId, update) {
    var _a, _b, _c, _d;
    if (waSock.user) {
        io === null || io === void 0 ? void 0 : io.emit("waUser", { phoneId, waUser: waSock.user });
    }
    if (update.connection == "close") {
        // io?.to(`${userId}`).emit(`connectionState`, "FUCJJJ");
        // fs.rmSync(`./whatsapp-auth/${userId}-${phoneId}`, {
        //   recursive: true,
        //   force: true,
        // });
        // whatsappSocket(io, userId, phoneId);
    }
    if (update.qr) {
        io === null || io === void 0 ? void 0 : io.emit(`qr`, {
            phoneId,
            qr: update.qr,
            timeout: constant_1.WaSockQrTimeout,
        });
    }
    else {
        io === null || io === void 0 ? void 0 : io.emit("connectionState", { ...update, phoneId: phoneId });
    }
    const { connection, lastDisconnect } = update;
    if (update.isNewLogin) {
        waSock.ev.flush(true);
        (0, whatsappSocket_1.default)(io, userId, phoneId);
    }
    if (update.isOnline) {
        io === null || io === void 0 ? void 0 : io.emit("isOnline", {
            isOnline: update.isOnline,
            phoneId: phoneId,
        });
        waSock.ev.flush(true);
    }
    if (connection === "close") {
        waSock.ev.flush(true);
        io === null || io === void 0 ? void 0 : io.emit("connectionState", {
            update: "lalalala",
            t: (_b = (_a = lastDisconnect === null || lastDisconnect === void 0 ? void 0 : lastDisconnect.error) === null || _a === void 0 ? void 0 : _a.output) === null || _b === void 0 ? void 0 : _b.statusCode,
        });
        const shouldReconnectStatus = [
            baileys_1.DisconnectReason.restartRequired,
            baileys_1.DisconnectReason.loggedOut,
        ];
        const shouldReconnect = shouldReconnectStatus.includes((_d = (_c = lastDisconnect === null || lastDisconnect === void 0 ? void 0 : lastDisconnect.error) === null || _c === void 0 ? void 0 : _c.output) === null || _d === void 0 ? void 0 : _d.statusCode);
        // console.log(
        //   "connection closed due to ",
        //   lastDisconnect?.error,
        //   ", reconnecting ",
        //   shouldReconnect
        // );
        // reconnect if not logged out
        if (shouldReconnect) {
            fs.rmSync(`./whatsapp-auth/${userId}-${phoneId}`, {
                recursive: true,
                force: true,
            });
            (0, whatsappSocket_1.default)(io, userId, phoneId);
        }
    }
    else if (connection === "open") {
        console.log("OPEN");
        waSock.ev.flush(true);
    }
}
exports.default = connectionUpdate;
