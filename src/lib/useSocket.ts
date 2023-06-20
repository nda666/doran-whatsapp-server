import { useEffect, useState } from "react";
import { ManagerOptions, Socket, SocketOptions, io } from "socket.io-client";

export interface SocketEvent {
  name: string;
  handler(...args: any[]): any;
}

const useSocket = (
  option?: Partial<ManagerOptions & SocketOptions> | undefined
) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [events, setEvents] = useState<SocketEvent[] | null>(null);

  const disconnectSocket = () => {
    if (events) {
      for (const event of events) {
        socket?.off(event.name);
      }
      socket?.disconnect();
    }
  };

  useEffect(() => {
    if (!events) {
      disconnectSocket();
      return;
    }
    const socketInstance = io(option);

    for (const event of events) {
      console.log("set socket event: " + event.name);
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

export default useSocket;
