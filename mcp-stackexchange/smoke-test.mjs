#!/usr/bin/env node
/**
 * Live protocol smoke test for mcp-stackexchange.
 *
 * Spawns the built server over stdio, performs an MCP handshake, lists the
 * tools, then makes ONE real tool call against the live Stack Exchange API and
 * asserts the response contains real data. Exits non-zero on any failure.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    stderr: "inherit",
  });

  const client = new Client({ name: "smoke-test", version: "1.0.0" });

  console.log("→ connecting + handshake...");
  await client.connect(transport);
  console.log("  handshake OK");

  console.log("→ listing tools...");
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  console.log("  tools:", names.join(", "));
  assert(names.includes("search_questions"), "search_questions tool must be registered");
  assert(names.includes("get_answers"), "get_answers tool must be registered");

  console.log('→ calling search_questions(query="python merge two dictionaries")...');
  const searchRes = await client.callTool({
    name: "search_questions",
    arguments: { query: "python merge two dictionaries", limit: 3 },
  });
  assert(!searchRes.isError, `search_questions returned an error: ${JSON.stringify(searchRes.content)}`);
  const searchText = searchRes.content?.[0]?.text ?? "";
  assert(searchText.length > 0, "search_questions returned empty text");
  assert(/id=\d+/.test(searchText), "search result must include a numeric question id");
  console.log("  search result (first 300 chars):");
  console.log("  " + searchText.slice(0, 300).replace(/\n/g, "\n  "));

  // Extract a real question id and make a second real call to prove the chain.
  const idMatch = searchText.match(/id=(\d+)/);
  assert(idMatch, "could not extract a question id from search results");
  const questionId = Number(idMatch[1]);

  console.log(`→ calling get_answers(question_id=${questionId})...`);
  const answersRes = await client.callTool({
    name: "get_answers",
    arguments: { question_id: questionId, limit: 1 },
  });
  assert(!answersRes.isError, `get_answers returned an error: ${JSON.stringify(answersRes.content)}`);
  const answersText = answersRes.content?.[0]?.text ?? "";
  assert(answersText.length > 0, "get_answers returned empty text");
  console.log("  answers result (first 300 chars):");
  console.log("  " + answersText.slice(0, 300).replace(/\n/g, "\n  "));

  await client.close();

  console.log("\n=========================================");
  console.log("PASS — handshake, tool list, and 2 live API calls all succeeded.");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("\nFAIL —", err.message);
  process.exit(1);
});
