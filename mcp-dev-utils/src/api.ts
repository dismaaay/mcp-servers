/**
 * api.ts — Core developer-utility logic.
 *
 * This module contains NO MCP imports. It is pure, local, network-free logic
 * that can be unit-tested or reused independently of the MCP transport layer.
 * Every function validates its inputs and throws clear Error messages on
 * invalid data so the MCP layer can surface them to the caller.
 */

import {
  randomUUID,
  createHash,
  getHashes,
  randomFillSync,
} from "node:crypto";

// ---------------------------------------------------------------------------
// UUID
// ---------------------------------------------------------------------------

export type UuidVersion = "v4" | "v7";

/**
 * Generate a UUID.
 *
 * - v4: random UUID (delegates to Node's crypto.randomUUID).
 * - v7: time-ordered UUID (RFC 9562). Implemented locally because not all
 *   Node versions expose a v7 generator. Layout:
 *     unix_ts_ms (48 bits) | ver (4 bits = 0b0111) | rand_a (12 bits)
 *     | variant (2 bits = 0b10) | rand_b (62 bits)
 */
export function generateUuid(version: UuidVersion = "v4"): string {
  if (version === "v4") {
    return randomUUID();
  }
  if (version === "v7") {
    return uuidV7();
  }
  throw new Error(`Unsupported UUID version: ${version}. Use "v4" or "v7".`);
}

function uuidV7(): string {
  const bytes = new Uint8Array(16);

  // 48-bit big-endian Unix timestamp in milliseconds.
  const ms = Date.now();
  // JS numbers are safe well beyond 48 bits of milliseconds, so split safely.
  const msHigh = Math.floor(ms / 0x100000000); // top 16 bits
  const msLow = ms >>> 0; // bottom 32 bits
  bytes[0] = (msHigh >>> 8) & 0xff;
  bytes[1] = msHigh & 0xff;
  bytes[2] = (msLow >>> 24) & 0xff;
  bytes[3] = (msLow >>> 16) & 0xff;
  bytes[4] = (msLow >>> 8) & 0xff;
  bytes[5] = msLow & 0xff;

  // Random for the remaining 10 bytes.
  const rand = new Uint8Array(10);
  cryptoRandom(rand);
  bytes.set(rand, 6);

  // Set version (0b0111) in the high nibble of byte 6.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Set variant (0b10) in the high bits of byte 8.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16) +
    "-" +
    hex.slice(16, 20) +
    "-" +
    hex.slice(20)
  );
}

function cryptoRandom(out: Uint8Array): void {
  // Cryptographically-secure random fill via Node crypto.
  randomFillSync(out);
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export const SUPPORTED_HASH_ALGOS = ["md5", "sha1", "sha256", "sha512"] as const;
export type HashAlgo = (typeof SUPPORTED_HASH_ALGOS)[number];

/**
 * Hash a UTF-8 string and return the lowercase hex digest.
 */
export function hashText(text: string, algo: HashAlgo = "sha256"): string {
  if (typeof text !== "string") {
    throw new Error("hash: 'text' must be a string.");
  }
  if (!SUPPORTED_HASH_ALGOS.includes(algo)) {
    throw new Error(
      `hash: unsupported algorithm "${algo}". Supported: ${SUPPORTED_HASH_ALGOS.join(", ")}.`,
    );
  }
  // Defensive: confirm the runtime actually supports the algorithm.
  if (!getHashes().includes(algo)) {
    throw new Error(`hash: algorithm "${algo}" is not available in this Node runtime.`);
  }
  return createHash(algo).update(text, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------

export type Base64Mode = "encode" | "decode";

/**
 * Base64 encode or decode a UTF-8 string.
 * - encode: UTF-8 text -> base64 string.
 * - decode: base64 string -> UTF-8 text (throws on invalid base64).
 */
export function base64(text: string, mode: Base64Mode = "encode"): string {
  if (typeof text !== "string") {
    throw new Error("base64: 'text' must be a string.");
  }
  if (mode === "encode") {
    return Buffer.from(text, "utf8").toString("base64");
  }
  if (mode === "decode") {
    const cleaned = text.trim();
    // Validate it looks like base64 (allow standard + url-safe + padding).
    if (cleaned.length > 0 && !/^[A-Za-z0-9+/=_-]+$/.test(cleaned)) {
      throw new Error("base64: input is not valid base64.");
    }
    const buf = Buffer.from(cleaned, "base64");
    // Round-trip check guards against silently-truncated garbage input.
    const reencoded = buf
      .toString("base64")
      .replace(/=+$/, "");
    const normalizedInput = cleaned
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .replace(/=+$/, "");
    if (reencoded !== normalizedInput) {
      throw new Error("base64: input is not valid base64.");
    }
    return buf.toString("utf8");
  }
  throw new Error(`base64: unsupported mode "${mode}". Use "encode" or "decode".`);
}

// ---------------------------------------------------------------------------
// JWT decode (no signature verification — decode only)
// ---------------------------------------------------------------------------

export interface JwtDecoded {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string; // raw base64url signature segment (empty if none)
  /** Human-friendly interpretation of common time claims, if present. */
  claims: {
    issuedAt?: string;
    expiresAt?: string;
    notBefore?: string;
    isExpired?: boolean;
  };
}

/**
 * Decode (NOT verify) a JWT. Splits the three dot-separated segments,
 * base64url-decodes the header and payload, and surfaces common time claims.
 *
 * This performs NO signature verification — it is a decode utility only.
 */
export function jwtDecode(token: string): JwtDecoded {
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error("jwt_decode: 'token' must be a non-empty string.");
  }
  const parts = token.trim().split(".");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(
      "jwt_decode: malformed token — expected 2 or 3 dot-separated segments (header.payload[.signature]).",
    );
  }

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecodeToString(parts[0]));
  } catch {
    throw new Error("jwt_decode: header segment is not valid base64url-encoded JSON.");
  }
  try {
    payload = JSON.parse(base64UrlDecodeToString(parts[1]));
  } catch {
    throw new Error("jwt_decode: payload segment is not valid base64url-encoded JSON.");
  }

  const signature = parts[2] ?? "";

  const claims: JwtDecoded["claims"] = {};
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.iat === "number") {
    claims.issuedAt = new Date(payload.iat * 1000).toISOString();
  }
  if (typeof payload.nbf === "number") {
    claims.notBefore = new Date(payload.nbf * 1000).toISOString();
  }
  if (typeof payload.exp === "number") {
    claims.expiresAt = new Date(payload.exp * 1000).toISOString();
    claims.isExpired = payload.exp < nowSec;
  }

  return { header, payload, signature, claims };
}

function base64UrlDecodeToString(segment: string): string {
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

// ---------------------------------------------------------------------------
// Timestamp conversion
// ---------------------------------------------------------------------------

export interface UnixToIsoResult {
  input: number;
  unit: "seconds" | "milliseconds";
  iso: string;
  utc: string;
}

/**
 * Convert a Unix timestamp to ISO 8601 (UTC).
 *
 * Accepts seconds or milliseconds. Heuristic: values whose absolute magnitude
 * is < 1e12 are treated as seconds, otherwise milliseconds. The caller may
 * also be explicit by passing values that obviously belong to one unit.
 */
export function unixToIso(ts: number): UnixToIsoResult {
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    throw new Error("unix_to_iso: 'ts' must be a finite number.");
  }
  // Heuristic unit detection.
  const isMillis = Math.abs(ts) >= 1e12;
  const ms = isMillis ? ts : ts * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    throw new Error("unix_to_iso: timestamp produced an invalid date.");
  }
  return {
    input: ts,
    unit: isMillis ? "milliseconds" : "seconds",
    iso: date.toISOString(),
    utc: date.toUTCString(),
  };
}

export interface IsoToUnixResult {
  input: string;
  iso: string;
  seconds: number;
  milliseconds: number;
}

/**
 * Convert an ISO 8601 (or any Date-parseable) string to a Unix timestamp.
 * Returns both seconds and milliseconds.
 */
export function isoToUnix(iso: string): IsoToUnixResult {
  if (typeof iso !== "string" || iso.trim().length === 0) {
    throw new Error("iso_to_unix: 'iso' must be a non-empty string.");
  }
  const date = new Date(iso.trim());
  const ms = date.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(
      `iso_to_unix: could not parse "${iso}" as a date. Use ISO 8601, e.g. 2024-01-01T00:00:00Z.`,
    );
  }
  return {
    input: iso,
    iso: date.toISOString(),
    seconds: Math.floor(ms / 1000),
    milliseconds: ms,
  };
}
