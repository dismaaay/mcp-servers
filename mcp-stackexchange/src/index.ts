#!/usr/bin/env node
/**
 * mcp-stackexchange — Model Context Protocol server for the Stack Exchange API.
 *
 * Exposes two tools over stdio:
 *   - search_questions(query): search Stack Overflow questions by free text
 *   - get_answers(question_id): fetch the top-voted answers for a question
 *
 * All diagnostic logging goes to stderr; stdout is reserved for the MCP
 * JSON-RPC protocol stream.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchQuestions, getAnswers } from "./api.js";

const server = new McpServer({
  name: "mcp-stackexchange",
  version: "1.0.0",
});

server.registerTool(
  "search_questions",
  {
    title: "Search Stack Overflow questions",
    description:
      "Search Stack Overflow questions by free-text query, sorted by relevance. " +
      "Returns titles, scores, answer counts, tags, links, and question ids. " +
      "Use the returned question_id with get_answers to read the solutions.",
    inputSchema: {
      query: z.string().min(1).describe("Free-text search terms, e.g. 'python merge two dicts'"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of questions to return (1-50, default 10)"),
    },
  },
  async ({ query, limit }) => {
    try {
      const questions = await searchQuestions(query, limit ?? 10);
      if (questions.length === 0) {
        return {
          content: [{ type: "text", text: `No Stack Overflow questions found for: "${query}"` }],
        };
      }
      const lines = questions.map((q, i) => {
        const accepted = q.accepted_answer_id ? " [has accepted answer]" : "";
        const tags = q.tags.length ? ` (${q.tags.join(", ")})` : "";
        return (
          `${i + 1}. ${q.title}${tags}\n` +
          `   id=${q.question_id} | score=${q.score} | answers=${q.answer_count}${accepted} | views=${q.view_count}\n` +
          `   ${q.link}`
        );
      });
      return {
        content: [
          {
            type: "text",
            text: `Found ${questions.length} question(s) for "${query}":\n\n${lines.join("\n\n")}`,
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error searching questions: ${(err as Error).message}` }],
      };
    }
  }
);

server.registerTool(
  "get_answers",
  {
    title: "Get Stack Overflow answers",
    description:
      "Fetch the top-voted answers for a Stack Overflow question id, sorted by score. " +
      "Returns the answer body text, score, and whether it is the accepted answer. " +
      "Get a question_id from search_questions first.",
    inputSchema: {
      question_id: z
        .number()
        .int()
        .positive()
        .describe("The Stack Overflow question id (from search_questions)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("Maximum number of answers to return (1-30, default 5)"),
    },
  },
  async ({ question_id, limit }) => {
    try {
      const answers = await getAnswers(question_id, limit ?? 5);
      if (answers.length === 0) {
        return {
          content: [
            { type: "text", text: `No answers found for question id ${question_id}.` },
          ],
        };
      }
      const blocks = answers.map((a, i) => {
        const accepted = a.is_accepted ? " ✓ ACCEPTED" : "";
        const author = a.owner_name ? ` by ${a.owner_name}` : "";
        const body = (a.body_markdown ?? a.body ?? "").trim() || "(no body)";
        return (
          `### Answer ${i + 1} (score ${a.score}${accepted})${author}\n` +
          `id=${a.answer_id}\n\n${body}`
        );
      });
      return {
        content: [
          {
            type: "text",
            text: `Top ${answers.length} answer(s) for question ${question_id}:\n\n${blocks.join("\n\n---\n\n")}`,
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error fetching answers: ${(err as Error).message}` }],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-stackexchange] running on stdio");
}

main().catch((err) => {
  console.error("[mcp-stackexchange] fatal error:", err);
  process.exit(1);
});
