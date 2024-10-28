import * as socketio from "socket.io";
export const getSocketIO = new socketio.Server({
  allowEIO3: true,
  cors: {
    origin: "*",
  },
});
