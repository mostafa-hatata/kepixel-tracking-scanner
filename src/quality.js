import { FUNNEL_DEFINITIONS } from "./signatures.js";
import { clamp, unique } from "./network.js";
import { registrableDomain, sanitizeEvidenceUrl } from "./detection.js";

export const MARKETING_COOKIE_HINT = /^(?:_gcl|_ga|_gid|_fbp|_fbc|li_|bcookie|bscookie|lidc|_hj|_uet|uetsid|uetvid|_uet|ttclid|_ttp|_scid|sc_at|_pin|_pinterest|_rdt|_tfa|_clck|_clsk|mp_|_pk_|s_vi|s_fid)/i;

export function buildFunnel(funnelType, events, pages, parameterSignals) {
  const steps = FUNNEL_DEFINITIONS[funnelType] || FUNNEL_DEFINITIONS.unknown;
  const pageText = pages.map((page) => `${page.type || "home"} ${page.url || ""} ${page.title || ""}`).join(" ").toLowerCase();
  const pageHints = {
    page_view: true,
    view_list: /category|collection|shop|catalog/.test(pageText),
    search: /search/.test(pageText),
    view_item: /product|item/.test(pageText),
    add_to_cart: false,
    view_cart: /cart|basket|bag/.test(pageText),
    begin_checkout: /checkout|payment/.test(pageText),
    add_shipping_info: false,
    add_payment_info: /payment/.test(pageText),
    purchase: false,
    form_start: pages.some((page) => Number(page.forms_count || 0) > 0),
    form_submit: false,
    lead: false,
    contact: /contact|book|appointment|quote|whatsapp/.test(pageText),
    book_appointment: /book|appointment/.test(pageText),
    sign_up: /signup|register/.test(pageText),
    trial_start: /trial/.test(pageText),
    subscribe: /subscribe|subscription|pricing/.test(pageText)
  };

  const funnelSteps = steps.map((step) => {
    const event = events[step] || { status: "not_detected", confidence: 0, evidence: [] };
    let status = event.status;
    let confidence = event.confidence;
    const evidence = [...event.evidence];
    if (status === "not_detected" && pageHints[step]) {
      status = "page_detected";
      confidence = 35;
      evidence.push("relevant_page_detected");
    }
    const testability = ["add_to_cart", "add_shipping_info", "purchase", "form_submit", "lead"].includes(step) && status === "not_detected"
      ? "not_tested"
      : "assessed";
    if (testability === "not_tested") status = "not_tested";
    return { step, status, confidence, evidence: unique(evidence).slice(0, 10) };
  });

  const assessable = funnelSteps.filter((step) => step.status !== "not_tested");
  const earned = assessable.reduce((sum, step) => {
    if (step.status === "observed") return sum + 1;
    if (step.status === "declared") return sum + 0.75;
    if (step.status === "page_detected") return sum + 0.4;
    return sum;
  }, 0);

  return {
    type: funnelType,
    steps: funnelSteps,
    coverage_score: assessable.length ? Math.round((earned / assessable.length) * 100) : null,
    confidence: Math.round((assessable.length / funnelSteps.length) * 100),
    parameter_signals: parameterSignals
  };
}

export function analyzeCookies(cookies) {
  const marketing = cookies.filter((cookie) => MARKETING_COOKIE_HINT.test(cookie.name || ""));
  const short = marketing.filter((cookie) => Number.isFinite(cookie.lifetime_days) && cookie.lifetime_days > 0 && cookie.lifetime_days <= 30);
  return {
    marketing_cookies_count: marketing.length,
    short_lifetime_cookies_count: short.length,
    short_lifetime_cookies: short.map((cookie) => ({ name: cookie.name, domain: cookie.domain, lifetime_days: cookie.lifetime_days })),
    cookie_lifetime_risk: short.length ? "High" : marketing.length ? "Medium" : "Unknown"
  };
}

function dimension(score, assessable = true, confidence = 100) {
  return { score: assessable ? clamp(Math.round(score), 0, 100) : null, assessable, confidence: clamp(Math.round(confidence), 0, 100) };
}

export function calculateScores({ pages, technologies, funnel, parameterSignals, serverSide, consent, failedRequests, ids }) {
  const detected = technologies.filter((tool) => tool.status === "detected");
  const advertising = detected.filter((tool) => tool.category === "advertising");
  const tagManagers = detected.filter((tool) => tool.category === "tag_management");
  const pageOkRatio = pages.length ? pages.filter((page) => page.ok).length / pages.length : 0;
  const duplicateTagPenalty = Math.max(0, tagManagers.length - 1) * 10;
  const installation = dimension(pageOkRatio * 75 + (detected.length ? 20 : 5) - duplicateTagPenalty, true, pages.length ? 90 : 30);
  const funnelCoverage = funnel.coverage_score === null ? dimension(0, false, funnel.confidence) : dimension(funnel.coverage_score, true, funnel.confidence);

  const conversionSeen = ["purchase", "lead", "form_submit", "sign_up", "subscribe"].some((event) => ["observed", "declared"].includes(funnel.steps.find((step) => step.step === event)?.status));
  const parameterCount = Object.values(parameterSignals).filter(Boolean).length;
  const parameterQuality = conversionSeen ? dimension((parameterCount / Object.keys(parameterSignals).length) * 100, true, 65) : dimension(0, false, 20);
  const eventCorrectness = conversionSeen
    ? dimension(40 + (parameterSignals.event_id ? 20 : 0) + (parameterSignals.transaction_id ? 15 : 0) + (parameterSignals.value ? 15 : 0) + (parameterSignals.currency ? 10 : 0), true, 60)
    : dimension(0, false, 20);

  const clientConversionTools = detected.filter((tool) => tool.detected_methods.includes("client_side") && ["advertising", "analytics", "tracking_and_attribution"].includes(tool.category));
  const duplicateRisk = clientConversionTools.length > 6;
  const deduplication = conversionSeen
    ? dimension((parameterSignals.event_id ? 75 : 35) - (duplicateRisk ? 15 : 0), true, 55)
    : dimension(0, false, 15);
  const server = serverSide.status === "not_publicly_verifiable"
    ? dimension(0, false, 20)
    : dimension(serverSide.status === "verified" ? 95 : serverSide.status === "strong_evidence" ? 80 : 60, true, serverSide.confidence);
  const attributionSignals = [parameterSignals.click_ids, Object.values(ids || {}).flat().length > 0].filter(Boolean).length;
  const attribution = dimension(35 + attributionSignals * 30 + (parameterSignals.user_hashes ? 5 : 0), true, 55);
  const consentScore = consent.cmp_detected ? 80 : advertising.length ? 40 : 70;
  const consentDimension = dimension(consentScore - Math.min(20, failedRequests.length * 2), true, consent.cmp_detected ? 70 : 40);

  const dimensions = {
    installation,
    funnel_coverage: funnelCoverage,
    event_correctness: eventCorrectness,
    parameter_quality: parameterQuality,
    deduplication,
    server_side: server,
    attribution,
    consent: consentDimension
  };
  const weights = {
    installation: 15,
    funnel_coverage: 25,
    event_correctness: 20,
    parameter_quality: 15,
    deduplication: 10,
    server_side: 5,
    attribution: 5,
    consent: 5
  };
  let earned = 0;
  let available = 0;
  let confidenceWeighted = 0;
  for (const [key, value] of Object.entries(dimensions)) {
    if (!value.assessable) continue;
    earned += value.score * weights[key];
    available += weights[key];
    confidenceWeighted += value.confidence * weights[key];
  }
  const overall = available ? Math.round(earned / available) : 0;
  const confidence = available ? Math.round(confidenceWeighted / available) : 0;
  return { overall, confidence, dimensions, assessable_weight: available };
}

export function buildServerSideAssessment(technologies, resourceUrls, pageUrl) {
  const detectedServer = technologies.filter((tool) => tool.status === "detected" && tool.detected_methods.includes("server_side"));
  const specificServer = detectedServer.filter((tool) => tool.category === "server_side_tracking" || tool.id === "kepixel");
  const pageDomain = registrableDomain(new URL(pageUrl).hostname);
  const firstPartyCollectors = resourceUrls.filter((raw) => {
    try {
      const url = new URL(raw);
      const sameDomain = registrableDomain(url.hostname) === pageDomain;
      return sameDomain && /\/(collect|event|events|track|tracking|conversion|analytics|v1\/events|g\/collect)(\/|\?|$)/i.test(url.pathname + url.search);
    } catch {
      return false;
    }
  }).map(sanitizeEvidenceUrl);

  if (specificServer.some((tool) => tool.confidence >= 80)) {
    return { status: "strong_evidence", confidence: Math.max(...specificServer.map((tool) => tool.confidence)), tools: specificServer.map((tool) => tool.name), first_party_collectors: unique(firstPartyCollectors).slice(0, 20) };
  }
  if (specificServer.length || firstPartyCollectors.length) {
    return { status: "possible_evidence", confidence: clamp(35 + specificServer.length * 15 + firstPartyCollectors.length * 10, 0, 75), tools: specificServer.map((tool) => tool.name), first_party_collectors: unique(firstPartyCollectors).slice(0, 20) };
  }
  return { status: "not_publicly_verifiable", confidence: 20, tools: [], first_party_collectors: [] };
}

export function buildConsentAssessment(technologies, browserRuntime, text) {
  const cmpTools = technologies.filter((tool) => tool.status === "detected" && tool.category === "consent_management");
  return {
    cmp_detected: cmpTools.length > 0,
    cmp_tools: cmpTools.map((tool) => tool.name),
    banner_evidence: Boolean(browserRuntime?.consent_text_detected || /cookie consent|privacy preferences|accept all|reject all|ملفات تعريف الارتباط|إعدادات الخصوصية/i.test(text)),
    behavior_tested: false,
    note: "Consent behavior requires an explicit before/after interaction test; this scan only detects public CMP and banner evidence."
  };
}

export function buildIssues({ pages, technologies, funnel, parameterSignals, serverSide, consent, failedRequests, ids }) {
  const issues = [];
  const add = (issue) => issues.push(issue);
  if (!pages[0]?.ok) add({ id: "homepage_fetch_failed", severity: "critical", scope: "installation", title: "The homepage could not be fetched successfully", impact: "Tracking code and funnel readiness could not be evaluated reliably.", recommended_fix: "Verify that the URL is public, reachable, and not blocking the scanner." });
  const detected = technologies.filter((tool) => tool.status === "detected");
  if (!detected.length) add({ id: "no_tracking_tools_detected", severity: "high", scope: "installation", title: "No public tracking technology was detected", impact: "Analytics and advertising measurement may be missing, blocked by consent, or implemented only server-side.", recommended_fix: "Verify the tracking implementation in a browser debugger and confirm that expected tags load after consent." });

  const duplicateIds = Object.entries(ids || {}).filter(([, values]) => values.length > 1);
  for (const [type, values] of duplicateIds) {
    add({ id: `multiple_${type}_ids`, severity: "medium", scope: "installation", title: `Multiple ${type.replaceAll("_", " ")} identifiers were detected`, evidence: values, impact: "Multiple identifiers can be intentional, but may also create duplicate events or split reporting.", recommended_fix: "Confirm that every identifier is intentional and that conversion events are not fired more than once." });
  }

  const purchase = funnel.steps.find((step) => step.step === "purchase");
  if (["observed", "declared"].includes(purchase?.status)) {
    if (!parameterSignals.value) add({ id: "purchase_missing_value_evidence", severity: "high", scope: "purchase", title: "Purchase value was not detected", impact: "Revenue reporting and bidding optimization may be incomplete.", recommended_fix: "Send a numeric value with every purchase event." });
    if (!parameterSignals.currency) add({ id: "purchase_missing_currency_evidence", severity: "high", scope: "purchase", title: "Purchase currency was not detected", impact: "Revenue can be interpreted incorrectly across advertising and analytics platforms.", recommended_fix: "Send a valid three-letter ISO currency code with every purchase event." });
    if (!parameterSignals.transaction_id) add({ id: "purchase_missing_transaction_id_evidence", severity: "high", scope: "purchase", title: "Transaction ID was not detected", impact: "Purchase deduplication and reconciliation may be unreliable.", recommended_fix: "Send a stable, unique transaction or order ID with every purchase." });
    if (!parameterSignals.event_id) add({ id: "conversion_missing_event_id_evidence", severity: "medium", scope: "deduplication", title: "A conversion event ID was not detected", impact: "Browser and server copies of the same conversion may be counted twice.", recommended_fix: "Use a stable event ID shared by browser-side and server-side versions of the same event." });
  }
  if (serverSide.status === "not_publicly_verifiable") add({ id: "server_side_not_publicly_verifiable", severity: "info", scope: "server_side", title: "Server-side tracking could not be verified publicly", impact: "This is a visibility limitation and does not prove that server-side tracking is absent.", recommended_fix: "Verify backend delivery in each destination's test-events or diagnostics interface." });
  if (!consent.cmp_detected && detected.some((tool) => tool.category === "advertising")) add({ id: "cmp_not_detected", severity: "medium", scope: "consent", title: "Advertising tags were detected but no public CMP was found", impact: "Consent requirements may not be enforced consistently in applicable regions.", recommended_fix: "Review consent requirements and test tag behavior before and after user consent." });
  if (failedRequests.length) add({ id: "failed_tracking_requests", severity: "high", scope: "reliability", title: `${failedRequests.length} tracking request(s) failed during the browser scan`, evidence: failedRequests.slice(0, 10), impact: "Some events may not reach their destination.", recommended_fix: "Review blocked, cancelled, DNS, CSP, and HTTP errors for the affected endpoints." });

  const priority = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return issues.sort((a, b) => priority[a.severity] - priority[b.severity]).map((issue, index) => ({ priority: index + 1, evidence: [], ...issue }));
}

export function recommendationsFromIssues(issues) {
  return unique(issues.filter((issue) => issue.severity !== "info").map((issue) => issue.recommended_fix)).slice(0, 12);
}

export function trackingHealth(score) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 45) return "Needs Fix";
  return "Poor";
}

export function uniqueCookieObjects(cookies) {
  const map = new Map();
  for (const cookie of cookies) {
    if (!cookie?.name) continue;
    const key = `${cookie.name}|${cookie.domain || ""}`;
    if (!map.has(key)) map.set(key, {
      name: cookie.name,
      domain: cookie.domain || "",
      lifetime_days: cookie.lifetime_days ?? lifetimeFromExpires(cookie.expires),
      secure: cookie.secure ?? null,
      httpOnly: cookie.httpOnly ?? null,
      sameSite: cookie.sameSite ?? null
    });
  }
  return [...map.values()];
}

function lifetimeFromExpires(expires) {
  if (!expires) return null;
  const milliseconds = Number(expires) > 10_000_000_000 ? Number(expires) : Number(expires) * 1000;
  if (!Number.isFinite(milliseconds)) return null;
  return Math.max(0, Math.round((milliseconds - Date.now()) / 86400000));
}
