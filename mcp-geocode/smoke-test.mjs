/**
 * Live smoke test for mcp-geocode.
 *
 * Spawns the built server (dist/index.js) over stdio using the official MCP
 * client, lists the tools, then makes ONE real tool call against the live
 * Nominatim API and asserts the result is non-empty.
 *
 * Exits 0 and prints "PASS" on success; exits 1 on any failure.
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
    command: process.execPath, // node
    args: [serverPath],
  });

  const client = new Client(
    { name: "mcp-geocode-smoke-test", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("[smoke] connected to server over stdio");

  // 1. List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log(`[smoke] tools listed: ${names.join(", ")}`);
  assert(names.includes("geocode"), "geocode tool must be registered");
  assert(names.includes("reverse"), "reverse tool must be registered");

  // 2. ONE real tool call against the live API
  console.log("[smoke] calling geocode('Eiffel Tower') against live Nominatim...");
  const result = await client.callTool({
    name: "geocode",
    arguments: { query: "Eiffel Tower", limit: 1 },
  });

  assert(!result.isError, `tool returned an error: ${JSON.stringify(result.content)}`);
  assert(Array.isArray(result.content), "content must be an array");
  assert(result.content.length > 0, "content must be non-empty");
  const text = result.content[0].text ?? "";
  assert(text.length > 0, "returned text must be non-empty");
  assert(/Coordinates:/.test(text), "result must include coordinates");
  // Eiffel Tower is in Paris (~48.85, ~2.29) — sanity check the live data.
  assert(/48\.8/.test(text), "live result should contain Paris latitude ~48.8");

  console.log("[smoke] --- sample of real returned data ---");
  console.log(
    text
      .split("\n")
      .map((l) => "    " + l)
      .join("\n")
  );
  console.log("[smoke] ----------------------------------------");

  // 3. Bonus: exercise reverse to prove both tools work end-to-end.
  console.log("[smoke] calling reverse(48.8584, 2.2945) against live Nominatim...");
  const rev = await client.callTool({
    name: "reverse",
    arguments: { lat: 48.8584, lon: 2.2945 },
  });
  assert(!rev.isError, `reverse returned an error: ${JSON.stringify(rev.content)}`);
  const revText = rev.content[0].text ?? "";
  assert(revText.length > 0, "reverse text must be non-empty");
  console.log(`[smoke] reverse returned: ${revText.split("\n")[0]}`);

  await client.close();
  console.log("PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
