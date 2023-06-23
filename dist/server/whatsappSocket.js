"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const makeWASocket_1 = __importDefault(require("../lib/makeWASocket"));
const connectionUpdate_1 = __importDefault(require("./events/connectionUpdate"));
async function whatsappSocket(io, userId, phoneId) {
    // if (readdirSync(`${authFolder}`).length === 0) {
    //   return false;
    // }
    // eslint-disable-next-line react-hooks/rules-of-hooks
    try {
        const waSock = await (0, makeWASocket_1.default)(userId, phoneId);
        waSock.ev.on("connection.update", (update) => {
            (0, connectionUpdate_1.default)(io, waSock, userId, phoneId, update);
        });
        return waSock;
    }
    catch (e) {
        console.log("ERROR ", e);
        return false;
    }
}
exports.default = whatsappSocket;
