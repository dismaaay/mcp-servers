/**
 * Live smoke test for mcp-http-fetch.
 *
 * Spawns the built server over stdio, performs the MCP handshake, lists the
 * tools, and makes ONE real tool call (fetch_json against a public, no-auth
 * endpoint). Asserts the response is non-empty and contains real data, then
 * prints PASS.
 *
 * Run with:  node smoke-test.mjs   (after npm run build)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });

  const client = new Client({ name: "smoke-test", version: "1.0.0" });
  await client.connect(transport);
  console.error("[smoke] connected + handshake OK");

  // 1) List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("[smoke] tools:", names.join(", "));
  assert(names.includes("http_get"), "http_get tool present");
  assert(names.includes("http_post"), "http_post tool present");
  assert(names.includes("fetch_json"), "fetch_json tool present");

  // 2) ONE real call against a public no-auth JSON endpoint.
  const targetUrl = "https://api.github.com/zen";
  // api.github.com/zen returns plain text, so use a guaranteed-JSON endpoint.
  const jsonUrl = "https://api.github.com/repos/modelcontextprotocol/typescript-sdk";
  const res = await client.callTool({
    name: "fetch_json",
    arguments: { url: jsonUrl },
  });

  assert(!res.isError, `fetch_json returned an error result: ${JSON.stringify(res)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "content non-empty");
  const text = res.content[0].text;
  assert(typeof text === "string" && text.length > 0, "text payload non-empty");

  const parsed = JSON.parse(text);
  assert(parsed.ok === true, `HTTP status not ok: ${parsed.status}`);
  assert(parsed.json && typeof parsed.json === "object", "json payload is an object");
  assert(
    parsed.json.full_name === "modelcontextprotocol/typescript-sdk",
    `unexpected repo full_name: ${parsed.json.full_name}`,
  );

  console.error(
    `[smoke] real data: full_name=${parsed.json.full_name} ` +
      `stars=${parsed.json.stargazers_count} ` +
      `language=${parsed.json.language}`,
  );

  await client.close();
  console.error(`[smoke] (also available text endpoint: ${targetUrl})`);
  console.log("PASS");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
