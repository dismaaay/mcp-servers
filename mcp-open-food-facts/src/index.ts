#!/usr/bin/env node
/**
 * Open Food Facts MCP server.
 *
 * Exposes two tools over stdio:
 *   - get_product(barcode)       → full details for a single product
 *   - search_products(query)     → matching products from the database
 *
 * IMPORTANT: stdout is reserved for the MCP protocol. All diagnostic logging
 * MUST go to stderr (console.error), never stdout.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getProduct,
  searchProducts,
  OpenFoodFactsError,
  type Product,
} from "./api.js";

const server = new McpServer({
  name: "mcp-open-food-facts",
  version: "1.0.0",
});

/** Pretty-print a number with up to 2 decimals, dropping trailing zeros. */
function num(v: unknown): string | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * 100) / 100);
}

/** Build a compact, readable nutrition summary (per 100g). */
function formatNutriments(p: Product): string {
  const nm = p.nutriments;
  if (!nm) return "";
  const rows: Array<[string, string]> = [];
  const add = (label: string, key: string, unit: string) => {
    const val = num(nm[key]);
    if (val !== null) rows.push([label, `${val} ${unit}`]);
  };
  add("Energy", "energy-kcal_100g", "kcal");
  add("Fat", "fat_100g", "g");
  add("  of which saturated", "saturated-fat_100g", "g");
  add("Carbohydrates", "carbohydrates_100g", "g");
  add("  of which sugars", "sugars_100g", "g");
  add("Fiber", "fiber_100g", "g");
  add("Proteins", "proteins_100g", "g");
  add("Salt", "salt_100g", "g");
  if (rows.length === 0) return "";
  const body = rows.map(([k, v]) => `  ${k}: ${v}`).join("\n");
  return `\nNutrition (per 100g):\n${body}`;
}

/** Render a single product into readable text. */
function formatProduct(p: Product): string {
  const lines: string[] = [];
  const name = p.product_name?.trim() || p.generic_name?.trim() || "(unnamed product)";
  lines.push(`${name}`);
  lines.push(`Barcode: ${p.code}`);
  if (p.brands) lines.push(`Brand(s): ${p.brands}`);
  if (p.quantity) lines.push(`Quantity: ${p.quantity}`);
  if (p.categories) lines.push(`Categories: ${p.categories}`);

  const scores: string[] = [];
  if (p.nutriscore_grade && p.nutriscore_grade !== "unknown") {
    scores.push(`Nutri-Score ${p.nutriscore_grade.toUpperCase()}`);
  }
  if (typeof p.nova_group === "number") {
    scores.push(`NOVA group ${p.nova_group} (1=unprocessed … 4=ultra-processed)`);
  }
  if (p.ecoscore_grade && p.ecoscore_grade !== "unknown") {
    scores.push(`Eco-Score ${p.ecoscore_grade.toUpperCase()}`);
  }
  if (scores.length) lines.push(`Scores: ${scores.join(" | ")}`);

  if (p.labels) lines.push(`Labels: ${p.labels}`);
  if (p.ingredients_text?.trim()) {
    lines.push(`Ingredients: ${p.ingredients_text.trim()}`);
  }
  if (p.countries) lines.push(`Sold in: ${p.countries}`);
  if (p.image_url) lines.push(`Image: ${p.image_url}`);

  return lines.join("\n") + formatNutriments(p);
}

/** Map any error to a user-facing message string. */
function errorText(err: unknown): string {
  if (err instanceof OpenFoodFactsError) return err.message;
  return `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
}

server.registerTool(
  "get_product",
  {
    title: "Get food product by barcode",
    description:
      "Look up a single food product in the Open Food Facts database by its " +
      "barcode (EAN/UPC). Returns name, brand, ingredients, Nutri-Score, " +
      "NOVA processing group, Eco-Score, and a per-100g nutrition breakdown.",
    inputSchema: {
      barcode: z
        .string()
        .describe("Product barcode (EAN/UPC), e.g. 3017620422003 for Nutella."),
    },
  },
  async ({ barcode }) => {
    try {
      const product = await getProduct(barcode);
      if (!product) {
        return {
          content: [
            {
              type: "text",
              text: `No product found in Open Food Facts for barcode "${barcode}".`,
            },
          ],
        };
      }
      return { content: [{ type: "text", text: formatProduct(product) }] };
    } catch (err) {
      console.error("[get_product] error:", err);
      return {
        isError: true,
        content: [{ type: "text", text: errorText(err) }],
      };
    }
  },
);

server.registerTool(
  "search_products",
  {
    title: "Search food products",
    description:
      "Full-text search of the Open Food Facts database by product name, " +
      "brand, or keyword. Returns a ranked list of matches with barcode, " +
      "brand, quantity, and Nutri-Score so you can then call get_product " +
      "for full details.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Search terms, e.g. 'organic peanut butter' or 'coca cola'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of results to return (1–50, default 10)."),
    },
  },
  async ({ query, limit }) => {
    try {
      const result = await searchProducts(query, limit ?? 10);
      if (result.products.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No products found matching "${query}".`,
            },
          ],
        };
      }
      const header =
        `Found ${result.count} product(s) matching "${query}". ` +
        `Showing ${result.products.length}:\n`;
      const items = result.products.map((p, i) => {
        const name =
          p.product_name?.trim() || p.generic_name?.trim() || "(unnamed)";
        const bits: string[] = [`${i + 1}. ${name} — barcode ${p.code}`];
        if (p.brands) bits.push(`   Brand(s): ${p.brands}`);
        if (p.quantity) bits.push(`   Quantity: ${p.quantity}`);
        if (p.nutriscore_grade && p.nutriscore_grade !== "unknown") {
          bits.push(`   Nutri-Score: ${p.nutriscore_grade.toUpperCase()}`);
        }
        return bits.join("\n");
      });
      return {
        content: [{ type: "text", text: header + "\n" + items.join("\n\n") }],
      };
    } catch (err) {
      console.error("[search_products] error:", err);
      return {
        isError: true,
        content: [{ type: "text", text: errorText(err) }],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-open-food-facts running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-open-food-facts:", err);
  process.exit(1);
});
