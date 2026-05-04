import { RouterOSClient, RosApiCommands } from "routeros-client";

interface RouterConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  useSsl?: boolean;
  timeout?: number;
}

/**
 * Wrapper around routeros-client that provides a simplified API
 * compatible with the rest of the codebase.
 *
 * `RouterOSClient.connect()` returns a `RosApiMenu` instance,
 * we store it and expose `write(path, data?)` / `close()`.
 */
export interface MikroTikApi {
  /**
   * Print items from a menu path. Returns an array of records.
   */
  print(path: string, filter?: Record<string, string>): Promise<Record<string, any>[]>;
  /**
   * Add an item at the given menu path.
   */
  add(path: string, data: Record<string, string>): Promise<Record<string, any>[]>;
  /**
   * Remove an item by .id from the given menu path.
   */
  remove(path: string, id: string): Promise<Record<string, any>[]>;
  /**
   * Execute a command (e.g. /export, /system/reboot).
   */
  exec(path: string, command: string, data?: Record<string, string>): Promise<Record<string, any>[]>;
  /**
   * Disconnect from the router.
   */
  close(): Promise<void>;
}

export async function getMikroTikClient(config: RouterConfig): Promise<MikroTikApi> {
  const client = new RouterOSClient({
    host: config.host,
    user: config.username,
    password: config.password,
    port: config.port,
    keepalive: true,
    timeout: config.timeout ?? 5000,
    tls: config.useSsl ? { rejectUnauthorized: false } : undefined,
  });

  const api = await client.connect();

  return {
    async print(path: string, filter?: Record<string, string>) {
      const cmd = api.menu(path);
      if (filter) {
        return (await cmd.where(filter).get()) as Record<string, any>[];
      }
      return (await cmd.get()) as Record<string, any>[];
    },

    async add(path: string, data: Record<string, string>) {
      return (await api.menu(path).add(data)) as Record<string, any>[];
    },

    async remove(path: string, id: string) {
      return (await api.menu(path).remove(id)) as Record<string, any>[];
    },

    async exec(path: string, command: string, data?: Record<string, string>) {
      if (data) {
        return (await api.menu(path).exec(command, data)) as Record<string, any>[];
      }
      return (await api.menu(path).exec(command)) as Record<string, any>[];
    },

    async close() {
      await client.close();
    },
  };
}
