import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});

let report;
try {
  report = JSON.parse(result.stdout || "{}");
} catch {
  console.error("Mobile dependency audit did not return valid JSON.");
  console.error(result.stderr || result.stdout || "");
  process.exit(result.status || 1);
}

const allowedUnpatched = new Set([
  "ghsa-86w9-cpqp-85rv", // node-forge: no patched release published
  "ghsa-vfj7-8cjw-p6xm"  // braces: no patched release published
]);
const blocking = [];

function advisoryIdsFor(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const item = report.vulnerabilities?.[name];
  if (!item) return [];
  const ids = [];
  for (const entry of Array.isArray(item.via) ? item.via : []) {
    if (entry && typeof entry === "object") {
      const id = (String(entry.url ?? "").split("/").pop() || String(entry.source ?? "")).toLowerCase();
      if (id) ids.push(id);
    } else if (typeof entry === "string") {
      ids.push(...advisoryIdsFor(entry, new Set(seen)));
    }
  }
  return [...new Set(ids)];
}

for (const [name, item] of Object.entries(report.vulnerabilities ?? {})) {
  const severity = String(item.severity ?? "").toLowerCase();
  if (!["high", "critical"].includes(severity)) continue;

  const via = Array.isArray(item.via) ? item.via : [];
  const advisories = via
    .filter(v => v && typeof v === "object")
    .map(v => ({ id: (String(v.url ?? "").split("/").pop() || String(v.source ?? "")).toLowerCase(), severity: String(v.severity ?? "").toLowerCase() }));
  const resolvedIds = advisoryIdsFor(name);
  const unresolvedHigh = advisories.filter(v => ["high", "critical"].includes(v.severity) && !allowedUnpatched.has(v.id));
  const hasUnknownHigh = resolvedIds.length === 0 && advisories.length === 0;
  const onlyKnownUnpatched = resolvedIds.length > 0 && resolvedIds.every(id => allowedUnpatched.has(id));

  if (unresolvedHigh.length > 0 || hasUnknownHigh || !onlyKnownUnpatched) {
    blocking.push({ name, severity, advisories, resolvedIds });
  }
}

if (blocking.length) {
  console.error(JSON.stringify({ blocking }, null, 2));
  process.exit(1);
}

const total = Number(report.metadata?.vulnerabilities?.total ?? 0);
console.log(`Mobile audit passed: no unapproved high/critical production vulnerabilities (${total} total findings including moderate/low).`);
if (report.vulnerabilities?.["node-forge"]) {
  console.log("Note: node-forge's current GHSA-86w9-cpqp-85rv finding remains allowlisted because the advisory currently has no published patched version.");
}
