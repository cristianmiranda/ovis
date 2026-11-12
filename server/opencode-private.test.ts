import { expect, it } from "bun:test";

import { openCodePrivateServer } from "./opencode-private.ts";

it.skipIf(process.platform !== "linux")("finds a TUI's private server under it: its loopback port and the password it was started with", async () => {
  const child = Bun.spawn([process.execPath, "-e", "const s = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('') }); console.log(s.port);", "serve", "--stdio"], {
    env: { ...process.env, OPENCODE_PASSWORD: "fixture-pass" }, stdout: "pipe",
  });
  try {
    const reader = child.stdout.getReader();
    const port = Number(new TextDecoder().decode((await reader.read()).value).trim());
    expect(openCodePrivateServer(process.pid)).toEqual({ baseUrl: `http://127.0.0.1:${port}`, port, pid: child.pid, password: "fixture-pass" });
    // a TUI with no such child talks to the shared service
    expect(openCodePrivateServer(child.pid)).toBeNull();
  } finally {
    child.kill();
    await child.exited;
  }
});
