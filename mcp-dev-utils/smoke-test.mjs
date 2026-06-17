/**
 * smoke-test.mjs — Live MCP protocol smoke test.
 *
 * Spawns the built server (dist/index.js) over stdio, performs a real protocol
 * handshake, lists tools, and invokes several tools with real inputs, asserting
 * the responses are non-empty and correct. Prints PASS on success, exits 1 on
 * any failure.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = join(__dirname, "dist", "index.js");

function textOf(result) {
  assert.ok(result, "result missing");
  assert.ok(Array.isArray(result.content), "result.content not array");
  assert.ok(result.content.length > 0, "result.content empty");
  const block = result.content.find((c) => c.type === "text");
  assert.ok(block, "no text content block");
  assert.ok(typeof block.text === "string" && block.text.length > 0, "empty text");
  return block.text;
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath, // node
    args: [SERVER_ENTRY],
    stderr: "inherit",
  });

  const client = new Client(
    { name: "smoke-test", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log("[1/4] Handshake OK — connected to mcp-dev-utils");

  // List tools.
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log(`[2/4] listTools -> ${names.join(", ")}`);
  const expected = ["base64", "hash", "iso_to_unix", "jwt_decode", "unix_to_iso", "uuid"];
  for (const want of expected) {
    assert.ok(names.includes(want), `missing tool: ${want}`);
  }

  // [3/4] One headline real call: hash a known string with sha256.
  const KNOWN = "hello";
  const KNOWN_SHA256 =
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
  const hashRes = await client.callTool({
    name: "hash",
    arguments: { text: KNOWN, algo: "sha256" },
  });
  const hashText = textOf(hashRes);
  console.log(`[3/4] callTool hash("${KNOWN}", sha256) -> ${hashText}`);
  const hashObj = JSON.parse(hashText);
  assert.equal(hashObj.algo, "sha256");
  assert.equal(hashObj.hex, KNOWN_SHA256, "sha256 digest mismatch");

  // [4/4] Exercise every remaining tool with real inputs.

  // uuid v4
  const uuidRes = await client.callTool({ name: "uuid", arguments: { version: "v4" } });
  const uuidVal = textOf(uuidRes).trim();
  assert.match(
    uuidVal,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    `uuid v4 malformed: ${uuidVal}`,
  );

  // uuid v7
  const uuid7Res = await client.callTool({ name: "uuid", arguments: { version: "v7" } });
  const uuid7Val = textOf(uuid7Res).trim();
  assert.match(
    uuid7Val,
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    `uuid v7 malformed: ${uuid7Val}`,
  );

  // base64 round-trip
  const encRes = await client.callTool({
    name: "base64",
    arguments: { text: "hello", mode: "encode" },
  });
  const enc = JSON.parse(textOf(encRes));
  assert.equal(enc.result, "aGVsbG8=", "base64 encode mismatch");
  const decRes = await client.callTool({
    name: "base64",
    arguments: { text: "aGVsbG8=", mode: "decode" },
  });
  const dec = JSON.parse(textOf(decRes));
  assert.equal(dec.result, "hello", "base64 decode mismatch");

  // jwt_decode — a real well-known sample token (HS256, {"sub":"1234567890","name":"John Doe","iat":1516239022})
  const SAMPLE_JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const jwtRes = await client.callTool({ name: "jwt_decode", arguments: { token: SAMPLE_JWT } });
  const jwt = JSON.parse(textOf(jwtRes));
  assert.equal(jwt.header.alg, "HS256", "jwt header.alg mismatch");
  assert.equal(jwt.payload.name, "John Doe", "jwt payload.name mismatch");
  assert.equal(jwt.payload.sub, "1234567890", "jwt payload.sub mismatch");

  // unix_to_iso
  const u2iRes = await client.callTool({ name: "unix_to_iso", arguments: { ts: 1516239022 } });
  const u2i = JSON.parse(textOf(u2iRes));
  assert.equal(u2i.iso, "2018-01-18T01:30:22.000Z", "unix_to_iso mismatch");

  // iso_to_unix
  const i2uRes = await client.callTool({
    name: "iso_to_unix",
    arguments: { iso: "2018-01-18T01:30:22Z" },
  });
  const i2u = JSON.parse(textOf(i2uRes));
  assert.equal(i2u.seconds, 1516239022, "iso_to_unix mismatch");

  console.log("[4/4] All 6 tools returned correct real data");
  console.log("PASS");

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
