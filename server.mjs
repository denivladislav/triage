import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function handleTriage(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json(response, 400, { status: "invalid_input" });
  }
  if (typeof payload?.text !== "string" || !payload.text.trim()) {
    return json(response, 400, { status: "invalid_input" });
  }

  const controller = new AbortController();
  let timeoutId;
  try {
    const timeout = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, 300);
    });
    const output = await Promise.race([
      classify(payload.text, { signal: controller.signal }),
      timeout,
    ]);
    if (typeof output !== "string") {
      return json(response, 200, { status: "manual_review", topic: null, draft: null });
    }

    const result = JSON.parse(output);
    if (
      !["delivery", "pricing", "other"].includes(result?.topic) ||
      typeof result?.draft !== "string" ||
      !result.draft.trim()
    ) {
      return json(response, 200, { status: "manual_review", topic: null, draft: null });
    }
    return json(response, 200, { status: "ready", topic: result.topic, draft: result.draft });
  } catch {
    return json(response, 200, { status: "manual_review", topic: null, draft: null });
  } finally {
    clearTimeout(timeoutId);
  }
}

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/triage") {
    return json(response, 404, { status: "not_found" });
  }
  try {
    await handleTriage(request, response);
  } catch {
    if (!response.headersSent) json(response, 400, { status: "invalid_input" });
  }
}).listen(Number(process.env.PORT || 3000), "127.0.0.1");
