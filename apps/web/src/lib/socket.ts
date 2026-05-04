import { io, Socket } from "socket.io-client";
import type { SocketEvents } from "@isp-nexus/shared";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io("/", { path: "/socket.io", transports: ["websocket"] });
  }
  return socket;
}

export function joinRouter(routerId: string) {
  getSocket().emit("join:router", routerId);
}

export function onEvent<K extends keyof SocketEvents>(event: K, handler: (data: SocketEvents[K]) => void) {
  getSocket().on(event as string, handler);
  return () => getSocket().off(event as string, handler);
}
