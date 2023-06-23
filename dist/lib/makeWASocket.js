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
Object.defineProperty(exports, "__esModule", { value: true });
exports.waSocketLogOption = void 0;
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const pino_1 = require("pino");
const prisma_1 = require("./prisma");
exports.waSocketLogOption = (0, pino_1.pino)({
    transport: {
        targets: [
            // {
            //   level: "debug",
            //   target: "pino-pretty",
            //   options: {
            //     colorize: true,
            //   },
            // },
            {
                level: "error",
                target: "pino-roll",
                options: {
                    file: "./whatsapp-logs/whatsapp.log",
                    frequency: "daily",
                    colorize: true,
                    mkdir: true,
                },
                // target: "pino-pretty",
                // options: {
                //   colorize: false,
                //   destination: "./whatsapp-logs/whatsapp.log",
                // },
            },
        ],
        // target: "pino/file",
        // options: {
        //   destination:
        //     "/run/media/tiar/Website/www/doran-whatsapp-server/pino.log",
        // },
    },
});
const makeWASocket = async (userId, phoneId) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)(`./whatsapp-auth/${userId}-${phoneId}`);
    const _waSocket = await (0, baileys_1.default)({
        printQRInTerminal: false,
        auth: state,
        syncFullHistory: false,
        logger: exports.waSocketLogOption,
    });
    if (_waSocket.user) {
        await prisma_1.prisma.phone.update({
            where: {
                id: phoneId,
            },
            data: {
                number: _waSocket.user.id.split(":")[0],
                account_name: _waSocket.user.name,
            },
        });
    }
    _waSocket.ev.on("creds.update", (authState) => {
        saveCreds();
    });
    return _waSocket;
};
exports.default = makeWASocket;
