#!/usr/bin/env node
/**
 * mcp-trivia — an MCP server wrapping the Open Trivia DB (opentdb.com).
 *
 * Tools:
 *   - get_questions(amount, category?, difficulty?, type?)
 *   - list_categories()
 *
 * Transport: stdio. All diagnostic logging goes to stderr so it never
 * corrupts the JSON-RPC stream on stdout.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getQuestions,
  listCategories,
  type TriviaQuestion,
} from "./api.js";

const server = new McpServer({
  name: "mcp-trivia",
  version: "1.0.0",
});

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatQuestion(q: TriviaQuestion, index: number): string {
  const allAnswers =
    q.type === "boolean"
      ? ["True", "False"]
      : [q.correct_answer, ...q.incorrect_answers].sort(() =>
          Math.random() - 0.5
        );
  const options = allAnswers.map((a, i) => `   ${String.fromCharCode(65 + i)}. ${a}`);
  return [
    `${index + 1}. [${q.category} | ${q.difficulty} | ${q.type}]`,
    `   ${q.question}`,
    ...options,
    `   Answer: ${q.correct_answer}`,
  ].join("\n");
}

server.registerTool(
  "get_questions",
  {
    title: "Get Trivia Questions",
    description:
      "Fetch trivia questions from the Open Trivia DB. Returns the question, " +
      "shuffled answer options, and the correct answer. Optionally filter by " +
      "category id (see list_categories) and difficulty.",
    inputSchema: {
      amount: z
        .number()
        .int()
        .min(1)
        .max(50)
        .describe("Number of questions to fetch (1-50)."),
      category: z
        .number()
        .int()
        .optional()
        .describe(
          "Optional category id from list_categories (e.g. 9 = General Knowledge)."
        ),
      difficulty: z
        .enum(["easy", "medium", "hard"])
        .optional()
        .describe("Optional difficulty filter."),
      type: z
        .enum(["multiple", "boolean"])
        .optional()
        .describe(
          "Optional question type: 'multiple' (multiple choice) or 'boolean' (true/false)."
        ),
    },
  },
  async ({ amount, category, difficulty, type }) => {
    try {
      const questions = await getQuestions({ amount, category, difficulty, type });
      if (questions.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No questions were returned for that query.",
            },
          ],
        };
      }
      const formatted = questions
        .map((q, i) => formatQuestion(q, i))
        .join("\n\n");
      const text = `Fetched ${questions.length} trivia question(s):\n\n${formatted}`;
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to fetch trivia questions: ${errorText(err)}`,
          },
        ],
      };
    }
  }
);

server.registerTool(
  "list_categories",
  {
    title: "List Trivia Categories",
    description:
      "List every trivia category available from the Open Trivia DB, with the " +
      "numeric id to pass to get_questions and the category name.",
    inputSchema: {},
  },
  async () => {
    try {
      const categories = await listCategories();
      const lines = categories.map((c) => `${c.id}\t${c.name}`).join("\n");
      const text =
        `${categories.length} categories available ` +
        `(id\tname):\n\n${lines}`;
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to list trivia categories: ${errorText(err)}`,
          },
        ],
      };
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-trivia running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-trivia:", err);
  process.exit(1);
});
