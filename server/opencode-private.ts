/**
 * The private server of an OpenCode TUI started with `--standalone`: its child `opencode serve --stdio`,
 * which listens on a loopback port of its own with the password in its environment. A switch made
 * through the shared service never reaches that TUI, which puts its own model back at the next prompt.
 * Read from /proc, so Linux only; nothing is started here.
 */
import { readdirSync, readFileSync, readlinkSync } from "node:fs";

import type { OpenCodeServiceConfig } from "./opencode-service.ts";

const LISTEN = "0A";
const LOOPBACK = new Set(["0100007F", "00000000000000000000000001000000"]);

function read(path: string): string | null {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

function words(pid: number, file: "cmdline" | "environ"): string[] {
  return (read(`/proc/${pid}/${file}`) ?? "").split("\0").filter((word) => word !== "");
}

function childrenByParent(): Map<number, number[]> {
  const children = new Map<number, number[]>();
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/u.test(entry)) continue;
    const stat = read(`/proc/${entry}/stat`);
    const ppid = Number(stat?.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    if (!Number.isInteger(ppid)) continue;
    children.set(ppid, [...children.get(ppid) ?? [], Number(entry)]);
  }
  return children;
}

function serverUnder(tuiPid: number): number | null {
  const children = childrenByParent();
  let level = children.get(tuiPid) ?? [];
  for (let depth = 0; depth < 3 && level.length > 0; depth++) {
    const server = level.find((pid) => {
      const argv = words(pid, "cmdline");
      return argv.includes("serve") && argv.includes("--stdio");
    });
    if (server !== undefined) return server;
    level = level.flatMap((pid) => children.get(pid) ?? []);
  }
  return null;
}

function loopbackPort(pid: number): number | null {
  let fds: string[];
  try { fds = readdirSync(`/proc/${pid}/fd`); } catch { return null; }
  const inodes = new Set(fds.flatMap((fd) => {
    try { return [/^socket:\[(\d+)\]$/u.exec(readlinkSync(`/proc/${pid}/fd/${fd}`))?.[1] ?? ""]; } catch { return []; }
  }).filter((inode) => inode !== ""));
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    for (const line of (read(table) ?? "").split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/u);
      const [address, port] = (fields[1] ?? "").split(":");
      if (fields[3] === LISTEN && LOOPBACK.has(address ?? "") && inodes.has(fields[9] ?? "")) return Number.parseInt(port ?? "", 16);
    }
  }
  return null;
}

/** The private server of the TUI with this pid, as a service config; null when it runs none (it uses the shared service). */
export function openCodePrivateServer(tuiPid: number): OpenCodeServiceConfig | null {
  if (process.platform !== "linux") return null;
  const pid = serverUnder(tuiPid);
  if (pid === null) return null;
  const password = words(pid, "environ").find((entry) => entry.startsWith("OPENCODE_PASSWORD="))?.slice("OPENCODE_PASSWORD=".length);
  const port = loopbackPort(pid);
  if (!password || port === null || !Number.isInteger(port) || port <= 0) return null;
  return { baseUrl: `http://127.0.0.1:${port}`, port, pid, password };
}
