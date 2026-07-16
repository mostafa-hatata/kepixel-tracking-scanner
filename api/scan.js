import { runScan, ScanInputError } from "../src/scanner-core.js";
import { scanWithBrowser } from "../src/browser-scan.js";

const requestBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;

function clientKey(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.socket?.remoteAddress || req.headers?.["x-real-ip"] || "unknown");
}

function allowRequest(req) {
  const key = clientKey(req);
  const now = Date.now();
  if (requestBuckets.size > 5000) {
    for (const [bucketKey, bucket] of requestBuckets.entries()) {
      if (now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) requestBuckets.delete(bucketKey);
    }
  }
  const bucket = requestBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT_MAX;
}

function setCors(req, res) {
  const origin = String(req.headers?.origin || "*");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed. Use POST." });
  if (!allowRequest(req)) return res.status(429).json({ error: "Rate limit exceeded. Retry in one minute." });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (!body.url) return res.status(400).json({ error: "Missing required field: url" });

  try {
    const result = await runScan({
      url: body.url,
      mode: body.mode || "smart",
      max_pages: body.max_pages
    }, scanWithBrowser);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ScanInputError) {
      return res.status(400).json({
        status: "failed",
        error: "Invalid scan target",
        message: error.message,
        schema_version: "3.0",
        scanner_version: "3.0-universal-tracking-funnel-auditor"
      });
    }

    return res.status(200).json({
      status: "failed",
      error: "Scan failed",
      message: error?.message || "Unknown scanner error",
      schema_version: "3.0",
      scanner_version: "3.0-universal-tracking-funnel-auditor",
      scan_mode: "error",
      trackers_detected: [],
      technologies: [],
      issues: [{
        id: "scan_failed",
        severity: "critical",
        scope: "scanner",
        title: "The scanner could not complete the audit",
        impact: "No reliable tracking assessment was produced.",
        recommended_fix: "Retry with the full public https URL and verify that the website does not block automated browsers."
      }],
      recommendations: ["Retry with the full public https URL and verify that the website does not block automated browsers."]
    });
  }
}
