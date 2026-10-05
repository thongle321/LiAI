/**
 * Red-capable repro for the route-tree crash.
 *
 * Replicates expo-router's own check (getRoutesCore.js:534) verbatim:
 * a route file may not begin with '+' unless it is exactly '+not-found'.
 * That check is what throws before the app renders, so this goes red on
 * exactly this bug and green once the offending files are gone.
 *
 * Run: node scripts/check-route-filenames.mjs
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP = "app";
const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    const withoutExtension = entry.replace(/\.[^.]+$/, "");
    if (entry.startsWith("+") && withoutExtension !== "+not-found") {
      const renamed = relative(".", full).replace(/\+/, "");
      offenders.push(`Invalid route ${relative(".", full)}. Route nodes cannot start with '+' character. "Rename it to ${renamed}"`);
    }
  }
}

walk(APP);

if (offenders.length > 0) {
  console.error("ERROR  [Error: " + offenders[0] + "]");
  process.exit(1);
}
console.log("route filenames ok");
