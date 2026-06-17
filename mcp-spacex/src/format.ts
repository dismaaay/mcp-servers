/**
 * Human-readable formatting of SpaceX API objects for MCP text content.
 * No MCP imports here either — pure string helpers.
 */
import type { SpaceXLaunch, SpaceXRocket } from "./api.js";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function outcome(launch: SpaceXLaunch): string {
  if (launch.upcoming) return "Upcoming";
  if (launch.success === true) return "Success";
  if (launch.success === false) return "Failure";
  return "Unknown";
}

/** Format one launch. rocketName is optional (resolved id -> name). */
export function formatLaunch(
  launch: SpaceXLaunch,
  rocketName?: string,
): string {
  const lines = [
    `🚀 ${launch.name}  (flight #${launch.flight_number})`,
    `Date:    ${fmtDate(launch.date_utc)}`,
    `Outcome: ${outcome(launch)}`,
  ];
  if (rocketName) lines.push(`Rocket:  ${rocketName}`);
  if (launch.details) lines.push(`Details: ${launch.details}`);
  const webcast = launch.links?.webcast;
  if (webcast) lines.push(`Webcast: ${webcast}`);
  const article = launch.links?.article;
  if (article) lines.push(`Article: ${article}`);
  return lines.join("\n");
}

/** Format a compact one-line summary of a launch for lists. */
export function formatLaunchLine(
  launch: SpaceXLaunch,
  rocketName?: string,
): string {
  const rocket = rocketName ? ` [${rocketName}]` : "";
  return `#${launch.flight_number} ${launch.name}${rocket} — ${fmtDate(
    launch.date_utc,
  )} — ${outcome(launch)}`;
}

function fmtUsd(n: number | null): string {
  if (n == null) return "n/a";
  return `$${n.toLocaleString("en-US")}`;
}

/** Format a rocket with key specs. */
export function formatRocket(r: SpaceXRocket): string {
  const lines = [
    `🛰️  ${r.name}  (${r.type})`,
    `Status:         ${r.active ? "Active" : "Inactive"}`,
    `First flight:   ${r.first_flight ?? "n/a"}`,
    `Country:        ${r.country ?? "n/a"}`,
    `Company:        ${r.company ?? "n/a"}`,
    `Stages:         ${r.stages}`,
    `Boosters:       ${r.boosters}`,
    `Success rate:   ${r.success_rate_pct == null ? "n/a" : `${r.success_rate_pct}%`}`,
    `Cost / launch:  ${fmtUsd(r.cost_per_launch)}`,
  ];
  if (r.height?.meters != null) lines.push(`Height:         ${r.height.meters} m`);
  if (r.diameter?.meters != null)
    lines.push(`Diameter:       ${r.diameter.meters} m`);
  if (r.mass?.kg != null)
    lines.push(`Mass:           ${r.mass.kg.toLocaleString("en-US")} kg`);
  if (r.description) lines.push(`\n${r.description}`);
  return lines.join("\n");
}
