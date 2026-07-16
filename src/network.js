import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";

const MAX_RESPONSE_BYTES = 2_000_000;
const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);
const PAGE_PATTERNS = {
  product: /product|products|item|p\/|منتج|المنتجات/i,
  category: /category|collections|shop|catalog|store|قسم|تصنيف/i,
  cart: /cart|basket|bag|سلة/i,
  checkout: /checkout|payment|الدفع|إتمام-الطلب/i,
  contact: /contact|book|appointment|demo|quote|تواصل|احجز|موعد/i,
  pricing: /pricing|plans|subscription|الأسعار|الباقات/i,
  signup: /signup|sign-up|register|trial|تسجيل|اشترك/i
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

export function isPrivateIp(ip) {
  const version = net.isIP(ip);
  if (!version) return false;
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0 ||
      parts[0] >= 224
    );
  }
  const lower = ip.toLowerCase();
  return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
}

export class ScanInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScanInputError";
  }
}

export async function validatePublicUrl(input) {
  if (!input || typeof input !== "string") throw new ScanInputError("Missing required field: url");
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new ScanInputError("Invalid URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) throw new ScanInputError("Only http and https URLs are supported");
  if (url.username || url.password) throw new ScanInputError("URLs containing credentials are not supported");
  if (PRIVATE_HOSTNAMES.has(url.hostname.toLowerCase()) || isPrivateIp(url.hostname)) {
    throw new ScanInputError("Private or local network URLs are not allowed");
  }

  let addresses;
  try {
    addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new ScanInputError("Hostname could not be resolved");
  }
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new ScanInputError("Private or local network targets are not allowed");
  }

  url.hash = "";
  return url;
}

async function readLimitedBody(response, maxBytes = MAX_RESPONSE_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, maxBytes);
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Response body exceeded scanner size limit");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

export async function safeFetchPage(inputUrl, options = {}) {
  const timeoutMs = clamp(Number(options.timeoutMs || 12000), 3000, 18000);
  const maxRedirects = clamp(Number(options.maxRedirects || 5), 0, 8);
  let current = await validatePublicUrl(String(inputUrl));
  const redirectChain = [];

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; KepixelTrackingScanner/3.0; +https://kepixel.online)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"
        }
      });
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect response ${response.status} did not include a location`);
      const next = new URL(location, current);
      redirectChain.push({ from: current.toString(), to: next.toString(), status: response.status });
      current = await validatePublicUrl(next.toString());
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    const body = await readLimitedBody(response);
    return {
      ok: response.ok,
      statusCode: response.status,
      finalUrl: current.toString(),
      contentType,
      headers: Object.fromEntries([...response.headers.entries()].slice(0, 100)),
      html: body,
      redirectChain
    };
  }
  throw new Error("Too many redirects");
}

export function parseSetCookie(headers) {
  const raw = headers?.["set-cookie"] || headers?.get?.("set-cookie") || "";
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;]+=)/).map((cookie) => {
    const parts = cookie.split(";").map((part) => part.trim());
    const [nameValue, ...attributes] = parts;
    const separator = nameValue.indexOf("=");
    const name = separator >= 0 ? nameValue.slice(0, separator).trim() : nameValue.trim();
    const domain = attributes.find((part) => /^domain=/i.test(part))?.slice(7) || "response-header";
    const maxAge = attributes.find((part) => /^max-age=/i.test(part));
    const expires = attributes.find((part) => /^expires=/i.test(part));
    let lifetimeDays = null;
    if (maxAge) {
      const seconds = Number(maxAge.split("=")[1]);
      if (Number.isFinite(seconds)) lifetimeDays = Math.round(seconds / 86400);
    }
    if (lifetimeDays === null && expires) {
      const timestamp = new Date(expires.slice(8)).getTime();
      if (!Number.isNaN(timestamp)) lifetimeDays = Math.max(0, Math.round((timestamp - Date.now()) / 86400000));
    }
    return { name, domain, lifetime_days: lifetimeDays };
  }).filter((cookie) => cookie.name);
}

export function absoluteUrl(value, baseUrl) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

export function extractPageData(html, baseUrl) {
  const $ = cheerio.load(html || "");
  const scripts = $("script").map((_, element) => ({
    src: $(element).attr("src") || "",
    inline_preview: ($(element).html() || "").slice(0, 4000)
  })).get().slice(0, 700);
  const links = $("link").map((_, element) => $(element).attr("href") || "").get().slice(0, 700);
  const iframes = $("iframe").map((_, element) => $(element).attr("src") || "").get().slice(0, 200);
  const anchors = $("a[href]").map((_, element) => ({
    href: $(element).attr("href") || "",
    text: $(element).text().replace(/\s+/g, " ").trim().slice(0, 150)
  })).get().slice(0, 1500);
  const forms = $("form").map((_, element) => ({
    action: $(element).attr("action") || "",
    method: ($(element).attr("method") || "get").toLowerCase(),
    field_types: $(element).find("input,select,textarea").map((__, field) => $(field).attr("type") || field.tagName || "").get().slice(0, 30)
  })).get().slice(0, 50);
  const title = $("title").first().text().replace(/\s+/g, " ").trim().slice(0, 300);
  const canonical = $("link[rel='canonical']").attr("href") || "";
  const metaGenerator = $("meta[name='generator']").attr("content") || "";
  const resourceUrls = unique([...scripts.map((item) => item.src), ...links, ...iframes].map((value) => absoluteUrl(value, baseUrl))).slice(0, 1500);
  return { scripts, links, iframes, anchors, forms, title, canonical, metaGenerator, resourceUrls };
}

export function discoverFunnelUrls(pageData, baseUrl, maxPages = 4) {
  const base = new URL(baseUrl);
  const candidates = [];
  for (const anchor of pageData.anchors || []) {
    const absolute = absoluteUrl(anchor.href, baseUrl);
    if (!absolute) continue;
    const url = new URL(absolute);
    if (url.origin !== base.origin) continue;
    url.hash = "";
    url.search = "";
    const haystack = `${url.pathname} ${anchor.text}`;
    let type = "other";
    for (const [name, pattern] of Object.entries(PAGE_PATTERNS)) {
      if (pattern.test(haystack)) {
        type = name;
        break;
      }
    }
    if (type !== "other") candidates.push({ type, url: url.toString() });
  }

  const preferredOrder = ["product", "category", "cart", "checkout", "contact", "pricing", "signup"];
  const selected = [];
  for (const type of preferredOrder) {
    const match = candidates.find((item) => item.type === type && !selected.some((selectedItem) => selectedItem.url === item.url));
    if (match) selected.push(match);
    if (selected.length >= Math.max(0, maxPages - 1)) break;
  }
  return selected;
}
