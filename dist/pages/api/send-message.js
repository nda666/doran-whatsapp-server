"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const makeWASocket_1 = __importDefault(require("@/lib/makeWASocket"));
const prisma_1 = require("@/lib/prisma");
const sendMessage_1 = require("@/validations/sendMessage");
const libphonenumber_js_1 = require("libphonenumber-js");
const handler = async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("");
        return;
    }
    const validation = await (0, sendMessage_1.SendMessageValidation)(req.body);
    if (!(validation === null || validation === void 0 ? void 0 : validation.result)) {
        res.status(200).json(validation === null || validation === void 0 ? void 0 : validation.error);
        return;
    }
    const { number, message, api_key, phoneCountry } = req.body;
    const tos = number.split(",");
    console.log("tos", tos);
    const phone = await prisma_1.prisma.phone.findUnique({
        where: {
            token: api_key,
        },
    });
    if (!phone) {
        res.status(200).json({ result: false, message: "Token tidak valid" });
        return;
    }
    const socket = await (0, makeWASocket_1.default)(phone.userId, phone.id);
    socket.ev.on("connection.update", async (update) => {
        var _a, _b;
        if (update.qr) {
            socket.ev.flush(true);
            res.status(200).json({
                result: false,
                error: "Please scan qr code from phone dashboard page",
            });
            return;
        }
        if (update.connection === "close") {
            socket.ev.flush(true);
            res.status(200).json({
                result: false,
                error: (_b = (_a = update === null || update === void 0 ? void 0 : update.lastDisconnect) === null || _a === void 0 ? void 0 : _a.error) === null || _b === void 0 ? void 0 : _b.output,
            });
            return;
        }
        if (update.connection === "open") {
            try {
                let send = [];
                for (const _to of tos) {
                    const parsedTo = (0, libphonenumber_js_1.parsePhoneNumber)(_to, phoneCountry || "ID");
                    const sendResult = await socket.sendMessage(`${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`, {
                        text: message,
                    });
                    send.push(sendResult);
                }
                socket.ev.flush(true);
                res.status(200).json({ result: true, data: send });
                return;
            }
            catch (e) {
                socket.ev.flush(true);
                res
                    .status(200)
                    .json({ result: false, error: "Something wrong with server" });
                return;
            }
        }
    });
};
exports.default = handler;
