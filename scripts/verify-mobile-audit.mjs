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

const allowedUnpatched = new Set(["ghsa-86w9-cpqp-85rv"]);
const blocking = [];

for (const [name, item] of Object.entries(report.vulnerabilities ?? {})) {
  const severity = String(item.severity ?? "").toLowerCase();
  if (!["high", "critical"].includes(severity)) continue;

  const via = Array.isArray(item.via) ? item.via : [];
  const advisories = via
    .filter(v => v && typeof v === "object")
    .map(v => ({ id: (String(v.url ?? "").split("/").pop() || String(v.source ?? "")).toLowerCase(), severity: String(v.severity ?? "").toLowerCase() }));

  const highAdvisories = advisories.filter(v => ["high", "critical"].includes(v.severity));
  const inheritedFromNodeForge = via.some(v => typeof v === "string" && v === "node-forge");
  const onlyKnownUnpatched = (name === "node-forge" &&
    highAdvisories.length > 0 &&
    highAdvisories.every(v => allowedUnpatched.has(v.id))) ||
    (inheritedFromNodeForge && ["@expo/cli", "@expo/code-signing-certificates", "expo", "expo-router"].includes(name));

  if (!onlyKnownUnpatched) {
    blocking.push({ name, severity, advisories });
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
