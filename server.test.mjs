import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL(".", import.meta.url));

async function unusedPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("model failure returns a manual-review response", async () => {
  const port = await unusedPort();
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: directory,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });

  try {
    let response;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        response = await fetch(`http://127.0.0.1:${port}/api/triage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "[error]" }),
        });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }

    assert.ok(response, "server should start and accept requests");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "manual_review",
      topic: null,
      draft: null,
    });
  } finally {
    child.kill();
    await once(child, "exit");
  }
});