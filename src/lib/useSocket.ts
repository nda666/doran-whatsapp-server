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
    if (!events || events?.length == 0) {
      disconnectSocket();
      return;
    }
    disconnectSocket();
    const socketInstance = io(
      process.env.NEXT_PUBLIC_APP_URL?.toString() ?? "",
      option
    );
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

export default useSocket;
