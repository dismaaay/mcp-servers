// Live smoke test: spawns the built server over stdio, performs the MCP
// handshake, lists tools, and makes ONE real tool call against a public
// sitemap, asserting we get real data back. Prints PASS on success.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
});

const client = new Client(
  { name: "smoke-test", version: "1.0.0" },
  { capabilities: {} },
);

try {
  await client.connect(transport);
  console.log("[smoke] connected & handshake complete");

  const { tools } = await client.listTools();
  console.log(`[smoke] tools: ${tools.map((t) => t.name).join(", ")}`);
  assert(tools.length >= 1, "expected at least one tool");
  assert(
    tools.some((t) => t.name === "get_urls"),
    "expected get_urls tool to be registered",
  );

  // One real call against a stable, public sitemap.
  const SITEMAP = "https://www.sitemaps.org/sitemap.xml";
  console.log(`[smoke] calling get_urls(${SITEMAP}, limit=5) ...`);
  const res = await client.callTool({
    name: "get_urls",
    arguments: { sitemap_url: SITEMAP, limit: 5 },
  });

  assert(!res.isError, `tool returned an error: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "empty content");

  const textParts = res.content.filter((c) => c.type === "text");
  assert(textParts.length > 0, "no text content returned");

  // The second text block is JSON; parse and assert real URLs came back.
  const jsonPart = textParts[textParts.length - 1].text;
  const parsed = JSON.parse(jsonPart);
  assert(parsed.urls && parsed.urls.length > 0, "no urls in parsed result");
  assert(
    typeof parsed.urls[0].loc === "string" &&
      parsed.urls[0].loc.startsWith("http"),
    "first url loc is not a valid http URL",
  );
  assert(parsed.totalFound >= parsed.urls.length, "totalFound inconsistent");

  console.log(`[smoke] kind=${parsed.kind} totalFound=${parsed.totalFound}`);
  console.log("[smoke] sample human-readable output:\n" + textParts[0].text);
  console.log(
    `[smoke] first URL: ${parsed.urls[0].loc}` +
      (parsed.urls[0].lastmod ? ` (lastmod ${parsed.urls[0].lastmod})` : ""),
  );

  console.log("\nPASS");
} catch (err) {
  console.error("\nFAIL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.close();
}
