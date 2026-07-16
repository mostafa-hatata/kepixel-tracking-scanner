import dns from "node:dns/promises";
import net from "node:net";

const TRACKING_URL_HINT = /analytics|collect|pixel|track|event|conversion|facebook|google|doubleclick|tiktok|snapchat|linkedin|bing|pinterest|reddit|criteo|taboola|outbrain|segment|rudder|mparticle|snowplow|matomo|piwik|mixpanel|amplitude|heap|posthog|plausible|fathom|clarity|hotjar|fullstory|contentsquare|luckyorange|kepixel|stape/i;
const SENSITIVE_KEY = /email|phone|name|address|token|secret|password|authorization|cookie|card|pan|cvv/i;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeUrlParts(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return {
      url: `${url.origin}${url.pathname}`,
      query_keys: unique([...url.searchParams.keys()].filter((key) => !SENSITIVE_KEY.test(key))).slice(0, 30)
    };
  } catch {
    return { url: String(rawUrl || "").slice(0, 500), query_keys: [] };
  }
}

function isPrivateIp(ip) {
  const version = net.isIP(ip);
  if (!version) return false;
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
  }
  const lower = ip.toLowerCase();
  return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
}

async function isBlockedBrowserTarget(rawUrl, cache) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (!["http:", "https:"].includes(url.protocol)) return true;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "metadata.google.internal") return true;
    if (isPrivateIp(host)) return true;
    if (cache.has(host)) return cache.get(host);
    let blocked = true;
    try {
      const addresses = await dns.lookup(host, { all: true, verbatim: true });
      blocked = !addresses.length || addresses.some((entry) => isPrivateIp(entry.address));
    } catch {
      blocked = true;
    }
    cache.set(host, blocked);
    return blocked;
  } catch {
    return true;
  }
}

function safePostKeys(postData) {
  if (!postData) return [];
  try {
    const parsed = JSON.parse(postData);
    if (parsed && typeof parsed === "object") {
      return Object.keys(parsed).filter((key) => !SENSITIVE_KEY.test(key)).slice(0, 40);
    }
  } catch {
    // Continue with form/query parsing.
  }

  try {
    return unique([...new URLSearchParams(postData).keys()].filter((key) => !SENSITIVE_KEY.test(key))).slice(0, 40);
  } catch {
    return [];
  }
}

export async function scanWithBrowser(targetUrl, options = {}) {
  const maxWaitMs = Math.max(1500, Math.min(Number(options.waitMs || 4500), 7000));
  const navigationTimeoutMs = Math.max(8000, Math.min(Number(options.navigationTimeoutMs || 18000), 22000));

  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
    import("@sparticuz/chromium"),
    import("puppeteer-core")
  ]);

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 KepixelTrackingScanner/3.0"
    );
    page.setDefaultNavigationTimeout(navigationTimeoutMs);

    const requests = [];
    const failedRequests = [];
    const responses = new Map();
    const hostSafetyCache = new Map();

    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      if (await isBlockedBrowserTarget(request.url(), hostSafetyCache)) {
        await request.abort("blockedbyclient").catch(() => {});
        return;
      }
      await request.continue().catch(() => {});

      const rawUrl = request.url();
      if (!TRACKING_URL_HINT.test(rawUrl)) return;
      const safe = safeUrlParts(rawUrl);
      requests.push({
        ...safe,
        method: request.method(),
        resource_type: request.resourceType(),
        post_keys: safePostKeys(request.postData())
      });
    });

    page.on("requestfailed", (request) => {
      const rawUrl = request.url();
      if (!TRACKING_URL_HINT.test(rawUrl)) return;
      const safe = safeUrlParts(rawUrl);
      failedRequests.push({
        ...safe,
        method: request.method(),
        resource_type: request.resourceType(),
        error: request.failure()?.errorText || "request_failed"
      });
    });

    page.on("response", (response) => {
      const rawUrl = response.url();
      if (!TRACKING_URL_HINT.test(rawUrl)) return;
      const safe = safeUrlParts(rawUrl);
      responses.set(`${safe.url}|${response.status()}`, {
        ...safe,
        status: response.status(),
        ok: response.ok()
      });
    });

    const navigation = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeoutMs
    });

    await new Promise((resolve) => setTimeout(resolve, maxWaitMs));

    const [html, scripts, cookies, runtime] = await Promise.all([
      page.content(),
      page.$$eval("script", (els) => els.slice(0, 500).map((el) => ({
        src: el.src || "",
        inline_preview: (el.innerHTML || "").slice(0, 2500)
      }))),
      page.cookies().then((items) => items.map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires || null,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite || null
      }))),
      page.evaluate(() => {
        const win = window;
        const globals = [];
        const candidates = [
          "dataLayer", "gtag", "fbq", "ttq", "snaptr", "uetq", "hj", "clarity",
          "analytics", "mixpanel", "amplitude", "heap", "posthog", "_paq", "utag",
          "utag_data", "rudderanalytics", "mParticle", "snowplow", "Cookiebot",
          "OneTrust", "Didomi", "kepixel", "kpxTag"
        ];
        for (const key of candidates) {
          if (typeof win[key] !== "undefined") globals.push(key);
        }

        const dataLayer = Array.isArray(win.dataLayer) ? win.dataLayer.slice(-100) : [];
        const dataLayerEvents = [];
        const dataLayerKeys = [];
        for (const entry of dataLayer) {
          if (!entry || typeof entry !== "object") continue;
          if (typeof entry.event === "string") dataLayerEvents.push(entry.event.slice(0, 120));
          dataLayerKeys.push(...Object.keys(entry).filter((key) => !/email|phone|name|address|token|secret|password|cookie|card/i.test(key)));
        }

        const pageText = (document.body?.innerText || "").slice(0, 12000);
        const consentTextDetected = /cookie|consent|privacy preferences|accept all|reject all|إعدادات الخصوصية|ملفات تعريف الارتباط/i.test(pageText);
        const forms = [...document.forms].slice(0, 30).map((form) => ({
          action: form.action ? new URL(form.action, location.href).origin + new URL(form.action, location.href).pathname : "",
          method: (form.method || "get").toLowerCase(),
          field_types: [...form.elements].map((field) => String(field.type || field.tagName || "").toLowerCase()).filter(Boolean).slice(0, 30)
        }));

        return {
          globals,
          data_layer_length: dataLayer.length,
          data_layer_events: [...new Set(dataLayerEvents)].slice(0, 100),
          data_layer_keys: [...new Set(dataLayerKeys)].slice(0, 150),
          consent_text_detected: consentTextDetected,
          forms
        };
      })
    ]);

    return {
      ok: true,
      finalUrl: page.url(),
      statusCode: navigation?.status() || 0,
      html,
      scripts,
      cookies,
      requests: requests.slice(0, 500),
      responses: [...responses.values()].slice(0, 500),
      failedRequests: failedRequests.slice(0, 200),
      runtime
    };
  } finally {
    await browser.close();
  }
}
