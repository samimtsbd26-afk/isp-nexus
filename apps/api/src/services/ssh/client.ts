import { Client } from "ssh2";

export interface SshConnectOpts {
  host: string;
  port: number;
  username: string;
  privateKey?: string;
  password?: string;
  timeoutMs?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Execute a single command over SSH and return stdout/stderr/exit-code.
 * Connection is opened and closed per call — no persistent pool.
 */
export function sshExec(opts: SshConnectOpts, command: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const timeoutMs = opts.timeoutMs ?? 15_000;

    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    client.on("ready", () => {
      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          client.end();
          return reject(err);
        }
        let stdout = "";
        let stderr = "";
        stream.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
        stream.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
        stream.on("close", (code: number) => {
          clearTimeout(timer);
          client.end();
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code ?? 0 });
        });
      });
    });

    client.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    const connectOpts: Parameters<Client["connect"]>[0] = {
      host: opts.host,
      port: opts.port,
      username: opts.username,
      readyTimeout: timeoutMs,
    };
    if (opts.privateKey) connectOpts.privateKey = opts.privateKey;
    else if (opts.password) connectOpts.password = opts.password;

    client.connect(connectOpts);
  });
}

/** Test connectivity — runs `echo ok`. */
export async function sshTest(opts: SshConnectOpts): Promise<boolean> {
  try {
    const result = await sshExec(opts, "echo ok");
    return result.code === 0 && result.stdout.includes("ok");
  } catch {
    return false;
  }
}
