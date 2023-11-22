import * as socketio from "socket.io";
export const getSocketIO = new socketio.Server({
  cors: {
    origin: "*",
    methods: ["GET", "POST"], // Add allowed methods if needed
  },
});
