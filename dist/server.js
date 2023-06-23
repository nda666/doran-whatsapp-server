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
const express_1 = __importDefault(require("express"));
const compression_1 = __importDefault(require("compression"));
const prisma_1 = require("./lib/prisma");
const next_1 = __importDefault(require("next"));
const socketio = __importStar(require("socket.io"));
const whatsappSocket_1 = __importDefault(require("./server/whatsappSocket"));
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const nextApp = (0, next_1.default)({ dev, hostname, port, customServer: true });
const nextHandler = nextApp.getRequestHandler();
const app = (0, express_1.default)();
app.use((0, compression_1.default)());
const io = new socketio.Server();
nextApp.prepare().then(async () => {
    // const server = http.createServer(app);
    app.get("/hello", async (_, res) => {
        res.send(JSON.stringify(await prisma_1.prisma.phone.findMany()));
    });
    io === null || io === void 0 ? void 0 : io.on("connection", async (socket) => {
        var _a, _b, _c, _d, _e;
        if (!((_a = socket.handshake.query) === null || _a === void 0 ? void 0 : _a.phoneId)) {
            throw new Error("phone id is required");
        }
        if (!((_b = socket.handshake.query) === null || _b === void 0 ? void 0 : _b.userId)) {
            throw new Error("user id is required");
        }
        const query = socket.handshake.query;
        const userId = (_d = (_c = socket.handshake.query) === null || _c === void 0 ? void 0 : _c.userId) === null || _d === void 0 ? void 0 : _d.toString();
        const phoneIds = (_e = query === null || query === void 0 ? void 0 : query.phoneId) === null || _e === void 0 ? void 0 : _e.toString().split(",");
        socket.join(`${userId}`);
        const waSocks = [];
        phoneIds === null || phoneIds === void 0 ? void 0 : phoneIds.forEach(async (phoneId) => {
            const createdWaSock = await (0, whatsappSocket_1.default)(socket, userId, phoneId);
            createdWaSock && waSocks.push(createdWaSock);
        });
        socket.on("disconnecting", () => {
            waSocks.forEach((waSock) => {
                waSock.ev.flush(true);
            });
        });
        socket === null || socket === void 0 ? void 0 : socket.on("disconnect", async (reason) => {
            waSocks.forEach((waSock) => {
                waSock.ev.flush(true);
            });
        });
    });
    app.all("*", (req, res, next) => {
        res.setTimeout(20000, function () {
            res.status(408).end();
        });
        nextHandler(req, res);
    });
    const server = app.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
        process.send && process.send("ready");
    });
    io.attach(server);
});
