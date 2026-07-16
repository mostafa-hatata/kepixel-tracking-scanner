import crypto from "node:crypto";
import {
  clamp,
  discoverFunnelUrls,
  extractPageData,
  normalizeText,
  parseSetCookie,
  safeFetchPage,
  ScanInputError,
  unique,
  validatePublicUrl
} from "./network.js";
import {
  detectCanonicalEvents,
  detectParameterPresence,
  detectPlatform,
  detectTechnologies,
  extractTrackingIds,
  sanitizeEvidenceUrl
} from "./detection.js";
import {
  analyzeCookies,
  buildConsentAssessment,
  buildFunnel,
  buildIssues,
  buildServerSideAssessment,
  calculateScores,
  MARKETING_COOKIE_HINT,
  recommendationsFromIssues,
  trackingHealth,
  uniqueCookieObjects
} from "./quality.js";

const TRACKING_RESOURCE_HINT = /analytics|collect|pixel|track|event|conversion|tag|facebook|google|doubleclick|tiktok|snapchat|linkedin|bing|pinterest|reddit|criteo|taboola|outbrain|segment|rudder|mparticle|snowplow|matomo|piwik|mixpanel|amplitude|heap|posthog|plausible|fathom|clarity|hotjar|fullstory|contentsquare|luckyorange|kepixel|stape|cookielaw|cookiebot|privacy-center/i;

export { ScanInputError } from "./network.js";
export { detectCanonicalEvents, detectPlatform, detectTechnologies, extractTrackingIds } from "./detection.js";
export { buildFunnel, calculateScores } from "./quality.js";

function scanId() {
  return `scan_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

async function fetchAdditionalPages(discovered, options) {
  return Promise.all(discovered.map(async (candidate) => {
    try {
      const result = await safeFetchPage(candidate.url, { timeoutMs: options.pageTimeoutMs || 7000, maxRedirects: 3 });
      const pageData = extractPageData(result.html, result.finalUrl);
      return {
        type: candidate.type,
        url: result.finalUrl,
        status_code: result.statusCode,
        ok: result.ok,
        title: pageData.title,
        forms_count: pageData.forms.length,
        html: result.html,
        pageData,
        headers: result.headers,
        cookies: parseSetCookie(result.headers)
      };
    } catch (error) {
      return {
        type: candidate.type,
        url: candidate.url,
        status_code: 0,
        ok: false,
        title: "",
        forms_count: 0,
        html: "",
        pageData: { resourceUrls: [], scripts: [], anchors: [], forms: [] },
        headers: {},
        cookies: [],
        error: error.message
      };
    }
  }));
}

export async function runScan(input, browserScan = null) {
  const mode = ["quick", "smart", "funnel", "deep"].includes(input.mode) ? input.mode : "smart";
  const maxPages = mode === "quick" ? 1 : clamp(Number(input.max_pages || (mode === "funnel" || mode === "deep" ? 4 : 2)), 1, 6);
  const target = await validatePublicUrl(input.url);
  const homeResult = await safeFetchPage(target.toString(), { timeoutMs: 7000, maxRedirects: 5 });
  const homeData = extractPageData(homeResult.html, homeResult.finalUrl);
  const homeCookies = parseSetCookie(homeResult.headers);
  const discovered = discoverFunnelUrls(homeData, homeResult.finalUrl, maxPages);
  const extraPages = maxPages > 1 ? await fetchAdditionalPages(discovered, { pageTimeoutMs: 4500 }) : [];
  const pages = [{
    type: "home",
    url: homeResult.finalUrl,
    status_code: homeResult.statusCode,
    ok: homeResult.ok,
    title: homeData.title,
    forms_count: homeData.forms.length,
    html: homeResult.html,
    pageData: homeData,
    headers: homeResult.headers,
    cookies: homeCookies
  }, ...extraPages];

  let browser = null;
  let browserError = null;
  const shouldUseBrowser = Boolean(browserScan) && mode !== "quick";
  if (shouldUseBrowser) {
    try {
      browser = await browserScan(homeResult.finalUrl, {
        waitMs: mode === "funnel" || mode === "deep" ? 3500 : 2500,
        navigationTimeoutMs: mode === "funnel" || mode === "deep" ? 13000 : 11000
      });
    } catch (error) {
      browserError = error.message;
    }
  }

  const allHtml = pages.map((page) => page.html).join("\n");
  const allPageData = pages.map((page) => page.pageData);
  const resourceUrls = unique([
    ...allPageData.flatMap((data) => data.resourceUrls || []),
    ...(browser?.scripts || []).map((script) => script.src),
    ...(browser?.requests || []).map((request) => request.url),
    ...(browser?.responses || []).map((response) => response.url)
  ]).slice(0, 2500);
  const scripts = unique(allPageData.flatMap((data) => data.scripts || []).map((script) => script.src).filter(Boolean));
  const cookies = uniqueCookieObjects([...pages.flatMap((page) => page.cookies || []), ...(browser?.cookies || [])]);
  const runtime = browser?.runtime || { globals: [], data_layer_events: [], data_layer_keys: [], forms: [], consent_text_detected: false };
  const requestParamKeys = unique((browser?.requests || []).flatMap((request) => [...(request.query_keys || []), ...(request.post_keys || [])]));
  const ids = extractTrackingIds(`${allHtml}\n${resourceUrls.join("\n")}`);
  const evidence = {
    html: allHtml,
    resourceUrls,
    requestUrls: (browser?.requests || []).map((request) => request.url),
    cookieNames: cookies.map((cookie) => cookie.name),
    globals: runtime.globals || [],
    headers: pages.map((page) => JSON.stringify(page.headers || {})).join("\n"),
    eventNames: runtime.data_layer_events || [],
    ids: Object.values(ids).flat()
  };

  const technologies = detectTechnologies(evidence, homeResult.finalUrl);
  const platform = detectPlatform(`${allHtml}\n${resourceUrls.join("\n")}\n${homeData.metaGenerator}`);
  const events = detectCanonicalEvents(
    `${allHtml}\n${resourceUrls.join("\n")}\n${runtime.data_layer_keys?.join("\n") || ""}`,
    runtime.data_layer_events || [],
    requestParamKeys
  );
  const parameterSignals = detectParameterPresence(`${allHtml}\n${runtime.data_layer_keys?.join("\n") || ""}`, requestParamKeys);
  const publicPages = pages.map(({ html, pageData, headers, cookies: pageCookies, ...page }) => page);
  const funnel = buildFunnel(platform.funnelType, events, publicPages, parameterSignals);
  const serverSide = buildServerSideAssessment(technologies, resourceUrls, homeResult.finalUrl);
  const consent = buildConsentAssessment(technologies, runtime, allHtml);
  const failedRequests = browser?.failedRequests || [];
  const scores = calculateScores({ pages: publicPages, technologies, funnel, parameterSignals, serverSide, consent, failedRequests, ids });
  const issues = buildIssues({ pages: publicPages, technologies, funnel, parameterSignals, serverSide, consent, failedRequests, ids });
  const recommendations = recommendationsFromIssues(issues);
  const detectedTools = technologies.filter((tool) => tool.status === "detected");
  const cookieRisk = analyzeCookies(cookies);

  const legacyTrackers = technologies.map((tool) => ({
    platform: tool.name,
    category: tool.category,
    method: tool.method,
    status: tool.legacy_status,
    confidence: tool.confidence_label,
    confidence_score: tool.confidence,
    evidence: tool.evidence.map((item) => `${item.type}:${item.value}`)
  }));

  return {
    schema_version: "3.0",
    scanner_version: "3.0-universal-tracking-funnel-auditor",
    scan_id: scanId(),
    status: homeResult.ok ? (browserError ? "completed_with_fallback" : "completed") : "partial",
    url: target.toString(),
    final_url: homeResult.finalUrl,
    scan_mode: browser ? `${mode}_browser` : `${mode}_static`,
    requested_mode: mode,
    overall_score: scores.overall,
    tracking_health: trackingHealth(scores.overall),
    scores,
    site: {
      platform: platform.id,
      platform_name: platform.name,
      platform_confidence: platform.confidence,
      platform_evidence: platform.evidence,
      funnel_type: platform.funnelType
    },
    technology_summary: {
      detected_tools: detectedTools.length,
      possible_tools: technologies.filter((tool) => tool.status === "possible").length,
      client_side_tools: detectedTools.filter((tool) => tool.detected_methods.includes("client_side")).length,
      server_side_tools_with_public_evidence: detectedTools.filter((tool) => tool.detected_methods.includes("server_side")).length,
      advertising_tools: detectedTools.filter((tool) => tool.category === "advertising").length,
      analytics_tools: detectedTools.filter((tool) => tool.category.includes("analytics")).length,
      consent_tools: detectedTools.filter((tool) => tool.category === "consent_management").length
    },
    technologies,
    trackers_detected: legacyTrackers,
    trackers_found_count: detectedTools.length,
    tracking_ids: ids,
    funnel,
    events,
    parameter_quality: parameterSignals,
    server_side: serverSide,
    server_side_detected: ["verified", "strong_evidence"].includes(serverSide.status),
    server_side_note: serverSide.status === "not_publicly_verifiable"
      ? "No public server-side evidence was available. This does not prove server-side tracking is absent."
      : "Public evidence suggests that a server-side or first-party collection layer may be present; destination-side diagnostics are required for verification.",
    consent,
    issues,
    recommendations,
    pages_scanned: publicPages,
    scripts_detected: scripts.filter((url) => TRACKING_RESOURCE_HINT.test(url)).map(sanitizeEvidenceUrl).slice(0, 300),
    tracking_resources: resourceUrls.filter((url) => TRACKING_RESOURCE_HINT.test(url)).map(sanitizeEvidenceUrl).slice(0, 500),
    network_requests_detected: (browser?.requests || []).map((request) => request.url).slice(0, 500),
    network_capture_mode: browser ? "browser_runtime" : "static_resource_discovery",
    failed_tracking_requests: failedRequests,
    cookies_detected: cookies.filter((cookie) => MARKETING_COOKIE_HINT.test(cookie.name || "")),
    cookie_risk: cookieRisk,
    risk_assessment: {
      adblocker_risk: detectedTools.some((tool) => tool.detected_methods.includes("client_side")) && serverSide.status === "not_publicly_verifiable" ? "High" : "Medium",
      itp_risk: cookieRisk.cookie_lifetime_risk === "High" ? "High" : serverSide.status === "not_publicly_verifiable" ? "Unknown" : "Medium",
      attribution_loss_risk: parameterSignals.click_ids ? "Low" : "Medium",
      duplicate_risk: issues.some((issue) => issue.id.startsWith("multiple_")) ? "Medium" : "Unknown"
    },
    browser_signals: {
      attempted: shouldUseBrowser,
      available: Boolean(browser),
      globals: runtime.globals || [],
      dataLayerLength: runtime.data_layer_length || 0,
      dataLayerEvents: runtime.data_layer_events || [],
      hasDataLayer: (runtime.globals || []).map(normalizeText).includes("datalayer") || /datalayer/i.test(allHtml),
      hasGtag: (runtime.globals || []).map(normalizeText).includes("gtag") || /gtag\s*\(/i.test(allHtml),
      hasFbq: (runtime.globals || []).map(normalizeText).includes("fbq") || /fbq\s*\(/i.test(allHtml),
      hasTtq: (runtime.globals || []).map(normalizeText).includes("ttq") || /\bttq\b/i.test(allHtml),
      hasSnaptr: (runtime.globals || []).map(normalizeText).includes("snaptr") || /snaptr\s*\(/i.test(allHtml),
      hasUetq: (runtime.globals || []).map(normalizeText).includes("uetq") || /\buetq\b/i.test(allHtml),
      hasHj: (runtime.globals || []).map(normalizeText).includes("hj") || /hj\s*\(/i.test(allHtml)
    },
    limitations: [
      "Backend-to-backend events with no public browser, DNS, cookie, header, or endpoint evidence cannot be verified by a public scanner.",
      "Events marked declared were found in public code or configuration but were not necessarily fired during this scan.",
      "Purchase, lead submission, payment, and consent interactions are not executed automatically to avoid creating real transactions or submissions.",
      ...(browserError ? [`Browser runtime scan failed and static analysis was used: ${browserError}`] : [])
    ],
    browser_error: browserError
  };
}
