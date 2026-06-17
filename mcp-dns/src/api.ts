/**
 * Core DNS-over-HTTPS logic for mcp-dns.
 *
 * Talks to Cloudflare's public DoH JSON endpoint:
 *   https://cloudflare-dns.com/dns-query  (Accept: application/dns-json)
 *
 * No API key required. This module has ZERO MCP dependencies so it can be
 * unit-tested / reused independently. All logging is left to the caller;
 * this module only throws Errors with clear messages.
 */

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const DEFAULT_TIMEOUT_MS = 10_000;

/** DNS record types we accept for resolve(). */
export const SUPPORTED_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "NS",
  "TXT",
  "SOA",
  "SRV",
  "PTR",
  "CAA",
  "DS",
  "DNSKEY",
] as const;

export type RecordType = (typeof SUPPORTED_TYPES)[number];

/** Numeric DNS rcode -> human meaning (subset that matters for users). */
const RCODES: Record<number, string> = {
  0: "NOERROR",
  1: "FORMERR",
  2: "SERVFAIL",
  3: "NXDOMAIN",
  4: "NOTIMP",
  5: "REFUSED",
};

/** Numeric DNS type -> name, for decoding the `type` field in answers. */
const TYPE_NAMES: Record<number, string> = {
  1: "A",
  2: "NS",
  5: "CNAME",
  6: "SOA",
  12: "PTR",
  15: "MX",
  16: "TXT",
  28: "AAAA",
  33: "SRV",
  43: "DS",
  48: "DNSKEY",
  257: "CAA",
};

/** A single decoded DNS answer record. */
export interface DnsAnswer {
  name: string;
  type: string;
  TTL: number;
  data: string;
}

export interface ResolveResult {
  name: string;
  type: RecordType;
  status: string;
  answers: DnsAnswer[];
}

export interface ReverseResult {
  ip: string;
  ptr: string;
  status: string;
  hostnames: string[];
}

/** Raw shape returned by the Cloudflare DoH JSON API. */
interface DohResponse {
  Status: number;
  TC?: boolean;
  RD?: boolean;
  RA?: boolean;
  AD?: boolean;
  Question?: { name: string; type: number }[];
  Answer?: { name: string; type: number; TTL: number; data: string }[];
  Authority?: { name: string; type: number; TTL: number; data: string }[];
}

function statusText(code: number): string {
  return RCODES[code] ?? `RCODE${code}`;
}

function typeText(code: number): string {
  return TYPE_NAMES[code] ?? `TYPE${code}`;
}

/** Perform a DoH JSON query with a hard timeout. */
async function dohQuery(name: string, type: string): Promise<DohResponse> {
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/dns-json" },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `DNS query for "${name}" (${type}) timed out after ${DEFAULT_TIMEOUT_MS}ms`,
      );
    }
    throw new Error(
      `Network error querying DNS for "${name}" (${type}): ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(
      `DoH endpoint returned HTTP ${res.status} ${res.statusText} for "${name}" (${type})`,
    );
  }

  let json: DohResponse;
  try {
    json = (await res.json()) as DohResponse;
  } catch (err) {
    throw new Error(
      `Failed to parse DoH JSON response for "${name}" (${type}): ${(err as Error).message}`,
    );
  }

  return json;
}

/** Validate & normalize a user-supplied record type. */
export function normalizeType(input: string): RecordType {
  const upper = input.trim().toUpperCase();
  if ((SUPPORTED_TYPES as readonly string[]).includes(upper)) {
    return upper as RecordType;
  }
  throw new Error(
    `Unsupported record type "${input}". Supported: ${SUPPORTED_TYPES.join(", ")}`,
  );
}

/**
 * Resolve a domain name to DNS records of a given type.
 */
export async function resolve(
  name: string,
  type: string = "A",
): Promise<ResolveResult> {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error("resolve(): `name` must be a non-empty domain name");
  }
  const recordType = normalizeType(type);

  const json = await dohQuery(cleanName, recordType);
  const status = statusText(json.Status);

  if (json.Status !== 0 && (!json.Answer || json.Answer.length === 0)) {
    // Surface authoritative failures clearly (e.g. NXDOMAIN).
    if (json.Status === 3) {
      throw new Error(`NXDOMAIN: "${cleanName}" does not exist`);
    }
    throw new Error(
      `DNS query for "${cleanName}" (${recordType}) failed with status ${status}`,
    );
  }

  const answers: DnsAnswer[] = (json.Answer ?? []).map((a) => ({
    name: a.name,
    type: typeText(a.type),
    TTL: a.TTL,
    data: a.data,
  }));

  return { name: cleanName, type: recordType, status, answers };
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Build the in-addr.arpa / ip6.arpa PTR name for an IP address. */
export function ptrName(ip: string): string {
  const cleanIp = ip.trim();

  const v4 = cleanIp.match(IPV4_RE);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some((o) => o < 0 || o > 255)) {
      throw new Error(`Invalid IPv4 address: "${ip}"`);
    }
    return `${octets.reverse().join(".")}.in-addr.arpa`;
  }

  if (cleanIp.includes(":")) {
    return ipv6ToArpa(cleanIp);
  }

  throw new Error(`"${ip}" is not a valid IPv4 or IPv6 address`);
}

/** Expand an IPv6 address and produce its ip6.arpa reverse name. */
function ipv6ToArpa(ip: string): string {
  // Split on "::" to expand zero-compression.
  const parts = ip.split("::");
  if (parts.length > 2) {
    throw new Error(`Invalid IPv6 address: "${ip}"`);
  }

  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const missing = 8 - (head.length + tail.length);

  if (missing < 0 || (parts.length === 1 && head.length !== 8)) {
    throw new Error(`Invalid IPv6 address: "${ip}"`);
  }

  const groups = [
    ...head,
    ...Array(parts.length === 2 ? missing : 0).fill("0"),
    ...tail,
  ];

  // Pad each group to 4 hex digits, validate hex.
  const nibbles: string[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) {
      throw new Error(`Invalid IPv6 address: "${ip}"`);
    }
    const padded = g.padStart(4, "0").toLowerCase();
    for (const ch of padded) nibbles.push(ch);
  }

  if (nibbles.length !== 32) {
    throw new Error(`Invalid IPv6 address: "${ip}"`);
  }

  return `${nibbles.reverse().join(".")}.ip6.arpa`;
}

/**
 * Reverse-resolve an IP address (IPv4 or IPv6) to PTR hostnames.
 */
export async function reverse(ip: string): Promise<ReverseResult> {
  const cleanIp = ip.trim();
  if (!cleanIp) {
    throw new Error("reverse(): `ip` must be a non-empty IP address");
  }

  const ptr = ptrName(cleanIp);
  const json = await dohQuery(ptr, "PTR");
  const status = statusText(json.Status);

  if (json.Status !== 0 && (!json.Answer || json.Answer.length === 0)) {
    if (json.Status === 3) {
      throw new Error(`No PTR record found for ${cleanIp} (NXDOMAIN)`);
    }
    throw new Error(
      `Reverse lookup for ${cleanIp} failed with status ${status}`,
    );
  }

  const hostnames = (json.Answer ?? [])
    .filter((a) => typeText(a.type) === "PTR")
    .map((a) => a.data);

  return { ip: cleanIp, ptr, status, hostnames };
}
