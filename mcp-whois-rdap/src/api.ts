// Core RDAP lookup logic. No MCP imports — pure, testable, reusable.
// Uses Node's global fetch (Node 18+). Logs nothing here; callers log to stderr.

const RDAP_BASE = "https://rdap.org/domain/";
const DEFAULT_TIMEOUT_MS = 10_000;

/** A flattened, human-friendly view of an RDAP domain response. */
export interface DomainInfo {
  domain: string;
  handle?: string;
  status: string[];
  registrar?: string;
  registrarIanaId?: string;
  abuseEmail?: string;
  nameservers: string[];
  secureDns?: boolean;
  events: { action: string; date: string }[];
  entities: { roles: string[]; name?: string }[];
  rdapServer?: string;
  raw: unknown;
}

export class RdapError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "TIMEOUT"
      | "NETWORK"
      | "HTTP_ERROR"
      | "PARSE_ERROR"
  ) {
    super(message);
    this.name = "RdapError";
  }
}

/** Normalize and validate a domain name. Throws RdapError on invalid input. */
export function normalizeDomain(input: string): string {
  if (typeof input !== "string") {
    throw new RdapError("Domain must be a string", "INVALID_INPUT");
  }
  let d = input.trim().toLowerCase();
  // Strip a scheme + path if the user pasted a URL.
  d = d.replace(/^[a-z]+:\/\//, "").split("/")[0];
  // Strip a trailing dot (FQDN form) and any leading "www." is kept as-is
  // because RDAP works on the exact label set; only trim the root dot.
  d = d.replace(/\.$/, "");
  // Strip port if present.
  d = d.split(":")[0];

  if (d.length === 0) {
    throw new RdapError("Domain is empty", "INVALID_INPUT");
  }
  // A registrable domain must have at least one dot.
  if (!d.includes(".")) {
    throw new RdapError(
      `"${input}" does not look like a domain name (no TLD)`,
      "INVALID_INPUT"
    );
  }
  // Basic character validation (LDH + dots + unicode handled loosely).
  if (!/^[a-z0-9.\-¡-￿]+$/i.test(d)) {
    throw new RdapError(
      `"${input}" contains invalid characters for a domain`,
      "INVALID_INPUT"
    );
  }
  return d;
}

interface VCardEntity {
  vcardArray?: [string, unknown[]];
  roles?: string[];
  handle?: string;
  publicIds?: { type?: string; identifier?: string }[];
  entities?: VCardEntity[];
}

/** Extract the "fn" (full name) from a jCard vcardArray. */
function vcardFullName(entity: VCardEntity): string | undefined {
  const arr = entity.vcardArray?.[1];
  if (!Array.isArray(arr)) return undefined;
  for (const field of arr) {
    if (Array.isArray(field) && field[0] === "fn" && typeof field[3] === "string") {
      return field[3];
    }
  }
  return undefined;
}

/** Extract an email from a jCard vcardArray. */
function vcardEmail(entity: VCardEntity): string | undefined {
  const arr = entity.vcardArray?.[1];
  if (!Array.isArray(arr)) return undefined;
  for (const field of arr) {
    if (Array.isArray(field) && field[0] === "email" && typeof field[3] === "string") {
      return field[3];
    }
  }
  return undefined;
}

/** Recursively search entities for one matching a given role. */
function findEntityByRole(
  entities: VCardEntity[] | undefined,
  role: string
): VCardEntity | undefined {
  if (!entities) return undefined;
  for (const e of entities) {
    if (e.roles?.includes(role)) return e;
    const nested = findEntityByRole(e.entities, role);
    if (nested) return nested;
  }
  return undefined;
}

function parseRdapResponse(domain: string, data: any): DomainInfo {
  const ldhName: string =
    typeof data?.ldhName === "string" ? data.ldhName.toLowerCase() : domain;

  const nameservers: string[] = Array.isArray(data?.nameservers)
    ? data.nameservers
        .map((ns: any) => (typeof ns?.ldhName === "string" ? ns.ldhName.toLowerCase() : null))
        .filter((x: string | null): x is string => !!x)
    : [];

  const events = Array.isArray(data?.events)
    ? data.events
        .filter((e: any) => e && typeof e.eventAction === "string")
        .map((e: any) => ({
          action: e.eventAction as string,
          date: typeof e.eventDate === "string" ? e.eventDate : "",
        }))
    : [];

  const entitiesRaw: VCardEntity[] = Array.isArray(data?.entities) ? data.entities : [];

  const registrarEntity = findEntityByRole(entitiesRaw, "registrar");
  const abuseEntity = findEntityByRole(entitiesRaw, "abuse");

  let registrarIanaId: string | undefined;
  if (registrarEntity?.publicIds) {
    const iana = registrarEntity.publicIds.find(
      (p) => p.type === "IANA Registrar ID"
    );
    registrarIanaId = iana?.identifier;
  }

  const entities = entitiesRaw.map((e) => ({
    roles: Array.isArray(e.roles) ? e.roles : [],
    name: vcardFullName(e),
  }));

  // secureDNS may be { delegationSigned: bool, ... }
  let secureDns: boolean | undefined;
  if (data?.secureDNS && typeof data.secureDNS.delegationSigned === "boolean") {
    secureDns = data.secureDNS.delegationSigned;
  }

  return {
    domain: ldhName,
    handle: typeof data?.handle === "string" ? data.handle : undefined,
    status: Array.isArray(data?.status) ? data.status : [],
    registrar: registrarEntity ? vcardFullName(registrarEntity) : undefined,
    registrarIanaId,
    abuseEmail: abuseEntity ? vcardEmail(abuseEntity) : undefined,
    nameservers,
    secureDns,
    events,
    entities,
    raw: data,
  };
}

/**
 * Look up a domain via rdap.org (which redirects to the authoritative RDAP
 * server for the TLD). Returns a normalized DomainInfo or throws RdapError.
 */
export async function lookupDomain(
  domainInput: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<DomainInfo> {
  const domain = normalizeDomain(domainInput);
  const url = RDAP_BASE + encodeURIComponent(domain);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/rdap+json, application/json",
        "User-Agent": "mcp-whois-rdap/1.0 (+https://rdap.org)",
      },
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new RdapError(
        `RDAP lookup for "${domain}" timed out after ${timeoutMs}ms`,
        "TIMEOUT"
      );
    }
    throw new RdapError(
      `Network error contacting rdap.org for "${domain}": ${err?.message ?? err}`,
      "NETWORK"
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new RdapError(
      `Domain "${domain}" not found in RDAP (it may be unregistered or its TLD has no RDAP service)`,
      "NOT_FOUND"
    );
  }
  if (!res.ok) {
    throw new RdapError(
      `RDAP server returned HTTP ${res.status} ${res.statusText} for "${domain}"`,
      "HTTP_ERROR"
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (err: any) {
    throw new RdapError(
      `Failed to parse RDAP JSON for "${domain}": ${err?.message ?? err}`,
      "PARSE_ERROR"
    );
  }

  const info = parseRdapResponse(domain, data);
  // Record which authoritative server answered (after redirects).
  info.rdapServer = res.url;
  return info;
}

/** Render a DomainInfo as a compact, human-readable text block. */
export function formatDomainInfo(info: DomainInfo): string {
  const lines: string[] = [];
  lines.push(`Domain: ${info.domain}`);
  if (info.handle) lines.push(`Handle: ${info.handle}`);
  if (info.registrar) {
    lines.push(
      `Registrar: ${info.registrar}${
        info.registrarIanaId ? ` (IANA ${info.registrarIanaId})` : ""
      }`
    );
  }
  if (info.status.length) lines.push(`Status: ${info.status.join(", ")}`);
  if (typeof info.secureDns === "boolean") {
    lines.push(`DNSSEC signed: ${info.secureDns ? "yes" : "no"}`);
  }
  if (info.events.length) {
    lines.push("Events:");
    for (const e of info.events) {
      lines.push(`  - ${e.action}: ${e.date}`);
    }
  }
  if (info.nameservers.length) {
    lines.push(`Nameservers: ${info.nameservers.join(", ")}`);
  }
  if (info.abuseEmail) lines.push(`Abuse contact: ${info.abuseEmail}`);
  if (info.rdapServer) lines.push(`RDAP source: ${info.rdapServer}`);
  return lines.join("\n");
}
