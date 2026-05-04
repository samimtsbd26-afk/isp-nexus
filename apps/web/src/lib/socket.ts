import { io, Socket } from "socket.io-client";
import type { SocketEvents } from "@isp-nexus/shared";

let socket: Socket | null = null;
const joinedRouters = new Set<string>();

function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("isp_access_token")
    ?? localStorage.getItem("accessToken")
    ?? localStorage.getItem("token");
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io("/", {
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 5_000,
      auth: { token: getAccessToken() },
    });
    socket.io.on("reconnect_attempt", () => {
      if (socket) socket.auth = { token: getAccessToken() };
    });
    socket.on("connect", () => {
      joinedRouters.forEach((routerId) => socket?.emit("join:router", routerId));
    });
  }
  return socket;
}

export function reconnectSocket(): Socket {
  const nextSocket = getSocket();
  nextSocket.auth = { token: getAccessToken() };
  if (nextSocket.connected) nextSocket.disconnect();
  nextSocket.connect();
  return nextSocket;
}

export function joinRouter(routerId: string) {
  joinedRouters.add(routerId);
  getSocket().emit("join:router", routerId);
}

export function onEvent<K extends keyof SocketEvents>(event: K, handler: (data: SocketEvents[K]) => void) {
  getSocket().on(event as string, handler);
  return () => getSocket().off(event as string, handler);
}
