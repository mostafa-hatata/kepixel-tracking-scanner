import { EVENT_ALIASES, PLATFORM_SIGNATURES, TOOL_SIGNATURES } from "./signatures.js";
import { clamp, normalizeText, unique } from "./network.js";

function channelText(evidence, channel) {
  const value = evidence[channel];
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\n").toLowerCase();
  return String(value || "").toLowerCase();
}

function findMatches(haystack, patterns = []) {
  const matches = [];
  for (const pattern of patterns) {
    const normalized = String(pattern).toLowerCase();
    if (normalized && haystack.includes(normalized)) matches.push(pattern);
  }
  return matches;
}

export function registrableDomain(hostname) {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const secondLevelTlds = new Set(["co.uk", "com.au", "com.sa", "com.eg", "com.jo", "co.za", "com.br", "co.in"]);
  const lastTwo = parts.slice(-2).join(".");
  return secondLevelTlds.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

function detectFirstPartyEndpoints(resourceUrls, pageUrl, paths = []) {
  if (!paths.length) return [];
  const pageDomain = registrableDomain(new URL(pageUrl).hostname);
  return resourceUrls.filter((raw) => {
    try {
      const url = new URL(raw);
      return registrableDomain(url.hostname) === pageDomain && paths.some((path) => url.pathname.toLowerCase().includes(path.toLowerCase()));
    } catch {
      return false;
    }
  });
}

export function sanitizeEvidenceUrl(raw) {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`.slice(0, 300);
  } catch {
    return String(raw || "").slice(0, 300);
  }
}

export function detectTechnologies(evidence, pageUrl) {
  const channels = {
    html: channelText(evidence, "html"),
    resources: channelText(evidence, "resourceUrls"),
    requests: channelText(evidence, "requestUrls"),
    cookies: channelText(evidence, "cookieNames"),
    globals: channelText(evidence, "globals"),
    headers: channelText(evidence, "headers"),
    events: channelText(evidence, "eventNames"),
    ids: channelText(evidence, "ids")
  };
  const weights = { requests: 42, resources: 32, globals: 32, cookies: 22, headers: 26, html: 12, events: 28, ids: 18, first_party_endpoint: 20 };

  return TOOL_SIGNATURES.map((tool) => {
    const foundEvidence = [];
    for (const [channel, patterns] of Object.entries(tool.patterns || {})) {
      if (channel === "firstPartyPaths") continue;
      const matches = findMatches(channels[channel] || "", patterns);
      for (const match of matches) {
        foundEvidence.push({ type: channel, match: String(match).slice(0, 160), weight: weights[channel] || 10 });
      }
    }
    const firstPartyMatches = detectFirstPartyEndpoints(evidence.resourceUrls || [], pageUrl, tool.patterns?.firstPartyPaths || []);
    for (const match of firstPartyMatches.slice(0, 5)) {
      foundEvidence.push({ type: "first_party_endpoint", match: sanitizeEvidenceUrl(match), weight: weights.first_party_endpoint });
    }

    const confidence = clamp(foundEvidence.reduce((sum, item) => sum + item.weight, 0), 0, 100);
    const hasFirstPartyOrHeaderEvidence = foundEvidence.some((item) => ["first_party_endpoint", "headers"].includes(item.type));
    const hasPublicClientEvidence = foundEvidence.some((item) => !["first_party_endpoint", "headers"].includes(item.type));
    const detectedMethods = [];
    if (tool.methods.includes("client_side") && hasPublicClientEvidence) detectedMethods.push("client_side");
    if (tool.methods.includes("server_side") && (tool.category === "server_side_tracking" || hasFirstPartyOrHeaderEvidence)) detectedMethods.push("server_side");

    return {
      id: tool.id,
      name: tool.name,
      platform: tool.name,
      category: tool.category,
      methods: tool.methods,
      detected_methods: detectedMethods,
      method: (detectedMethods.length ? detectedMethods : tool.methods).map((method) => method === "client_side" ? "Client-side" : "Server-side").join(" / "),
      status: confidence >= 25 ? "detected" : confidence > 0 ? "possible" : "not_detected",
      legacy_status: confidence >= 25 ? "Found" : confidence > 0 ? "Possible" : "Not publicly detected",
      confidence,
      confidence_label: confidence >= 75 ? "High" : confidence >= 35 ? "Medium" : confidence > 0 ? "Low" : "None",
      evidence: foundEvidence.sort((a, b) => b.weight - a.weight).slice(0, 12).map(({ type, match }) => ({ type, value: match }))
    };
  });
}

export function extractTrackingIds(text) {
  const source = String(text || "");
  return {
    gtm: unique(source.match(/GTM-[A-Z0-9]+/gi) || []).slice(0, 20),
    ga4: unique(source.match(/G-[A-Z0-9]{5,}/gi) || []).slice(0, 20),
    google_ads: unique(source.match(/AW-[0-9]+/gi) || []).slice(0, 20),
    meta_pixel: unique([...source.matchAll(/fbq\s*\(\s*['"]init['"]\s*,\s*['"]([0-9]{5,})['"]/gi)].map((match) => match[1])).slice(0, 20),
    tiktok_pixel: unique([...source.matchAll(/ttq\.load\s*\(\s*['"]([A-Z0-9]+)['"]/gi)].map((match) => match[1])).slice(0, 20),
    snapchat_pixel: unique([...source.matchAll(/snaptr\s*\(\s*['"]init['"]\s*,\s*['"]([A-Z0-9-]+)['"]/gi)].map((match) => match[1])).slice(0, 20),
    linkedin_partner: unique([...source.matchAll(/_linkedin_partner_id\s*=\s*['"]?([0-9]+)/gi)].map((match) => match[1])).slice(0, 20)
  };
}

export function detectPlatform(text) {
  const lower = normalizeText(text);
  const results = PLATFORM_SIGNATURES.map((platform) => {
    const high = platform.high.filter((pattern) => lower.includes(pattern.toLowerCase()));
    const medium = platform.medium.filter((pattern) => lower.includes(pattern.toLowerCase()));
    const confidence = clamp(high.length * 40 + medium.length * 15, 0, 100);
    return { ...platform, confidence, evidence: unique([...high, ...medium]) };
  }).sort((a, b) => b.confidence - a.confidence);

  const top = results[0];
  if (!top || top.confidence < 20) return { id: "custom", name: "Custom / Unknown Website", confidence: 20, funnelType: inferFunnelType(lower), evidence: [] };
  if (top.id === "wordpress" && /woocommerce|wc-ajax|add-to-cart/.test(lower)) {
    return { id: "woocommerce", name: "WooCommerce", confidence: Math.max(top.confidence, 80), funnelType: "ecommerce", evidence: unique([...top.evidence, "woocommerce"]) };
  }
  return top;
}

function inferFunnelType(text) {
  const ecommerce = /add[-_ ]?to[-_ ]?cart|checkout|product|woocommerce|shopify|salla|zid|price|currency/.test(text);
  if (ecommerce) return "ecommerce";
  const saas = /pricing|free trial|start trial|subscription|sign up|signup|register/.test(text);
  if (saas) return "saas";
  const lead = /contact|book appointment|request quote|lead|form_submit|form submit|whatsapp/.test(text);
  if (lead) return "lead_generation";
  return "content";
}

export function detectCanonicalEvents(evidenceText, runtimeEvents = [], requestParamKeys = []) {
  const lower = normalizeText(evidenceText);
  const runtimeLower = runtimeEvents.map(normalizeText);
  const requestKeysLower = requestParamKeys.map(normalizeText);
  const result = {};
  for (const [canonical, aliases] of Object.entries(EVENT_ALIASES)) {
    const runtimeMatches = runtimeEvents.filter((eventName) => aliases.some((alias) => normalizeText(eventName).includes(normalizeText(alias))));
    const declaredMatches = aliases.filter((alias) => lower.includes(normalizeText(alias)));
    const requestMatches = requestKeysLower.includes("event_name") || requestKeysLower.includes("en")
      ? runtimeLower.filter((eventName) => aliases.some((alias) => eventName.includes(normalizeText(alias))))
      : [];
    let status = "not_detected";
    let confidence = 0;
    if (runtimeMatches.length || requestMatches.length) {
      status = "observed";
      confidence = 95;
    } else if (declaredMatches.length) {
      status = "declared";
      confidence = Math.min(70, 25 + declaredMatches.length * 12);
    }
    result[canonical] = {
      canonical_event: canonical,
      status,
      confidence,
      evidence: unique([...runtimeMatches, ...declaredMatches]).slice(0, 10)
    };
  }
  return result;
}

export function detectParameterPresence(text, allKeys) {
  const lower = normalizeText(text);
  const keySet = new Set(allKeys.map(normalizeText));
  const check = (...patterns) => patterns.some((pattern) => {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keyPattern = new RegExp(`(?:[\"']${escaped}[\"']|\\b${escaped}\\b)\\s*(?::|=)`, "i");
    return keySet.has(pattern) || keyPattern.test(lower);
  });
  return {
    event_id: check("event_id", "eventid"),
    value: check("value", "revenue", "amount", "total"),
    currency: check("currency"),
    transaction_id: check("transaction_id", "transactionid", "order_id", "orderid"),
    content_ids: check("content_ids", "contentids", "item_ids", "items", "contents", "product_id"),
    click_ids: check("gclid", "gbraid", "wbraid", "fbclid", "fbc", "ttclid", "sccid", "msclkid"),
    user_hashes: check("hashed_email", "email_hash", "em", "hashed_phone", "phone_hash", "ph", "external_id")
  };
}
