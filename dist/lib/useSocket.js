"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const socket_io_client_1 = require("socket.io-client");
const useSocket = (option) => {
    const [socket, setSocket] = (0, react_1.useState)(null);
    const [events, setEvents] = (0, react_1.useState)(null);
    const disconnectSocket = () => {
        if (events) {
            for (const event of events) {
                socket === null || socket === void 0 ? void 0 : socket.off(event.name);
            }
            socket === null || socket === void 0 ? void 0 : socket.disconnect();
        }
    };
    (0, react_1.useEffect)(() => {
        if (!events) {
            disconnectSocket();
            return;
        }
        const socketInstance = (0, socket_io_client_1.io)(option);
        for (const event of events) {
            socketInstance.on(event.name, event.handler);
        }
        socketInstance.connect();
        setSocket(socketInstance);
        return function () {
            disconnectSocket();
        };
    }, [events]);
    return { socket, setEvents, disconnectSocket };
};
exports.default = useSocket;
