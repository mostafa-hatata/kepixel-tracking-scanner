import test from "node:test";
import assert from "node:assert/strict";
import { buildFunnel, calculateScores, detectCanonicalEvents, detectPlatform, detectTechnologies, extractTrackingIds } from "../src/scanner-core.js";

test("detects multiple tracking technologies with evidence", () => {
  const evidence = {
    html: "fbq('init','123456'); gtag('config','G-ABC123'); window.dataLayer=[];",
    resourceUrls: [
      "https://connect.facebook.net/en_US/fbevents.js",
      "https://www.googletagmanager.com/gtm.js?id=GTM-TEST123",
      "https://www.googletagmanager.com/gtag/js?id=G-ABC123"
    ],
    requestUrls: ["https://www.facebook.com/tr"],
    cookieNames: ["_fbp", "_ga"],
    globals: ["dataLayer", "gtag", "fbq"],
    headers: "",
    eventNames: ["page_view"],
    ids: ["GTM-TEST123", "G-ABC123"]
  };
  const tools = detectTechnologies(evidence, "https://example.com");
  assert.equal(tools.find((tool) => tool.id === "meta_pixel").status, "detected");
  assert.equal(tools.find((tool) => tool.id === "google_tag_manager").status, "detected");
  assert.equal(tools.find((tool) => tool.id === "ga4").status, "detected");
});

test("classifies Shopify ecommerce sites", () => {
  const platform = detectPlatform("cdn.shopify.com Shopify.theme shopify-payment-button");
  assert.equal(platform.id, "shopify");
  assert.equal(platform.funnelType, "ecommerce");
});

test("normalizes cross-platform event names", () => {
  const events = detectCanonicalEvents("fbq('track','ViewContent'); gtag('event','add_to_cart')", ["page_view", "purchase"], ["event_id", "currency"]);
  assert.equal(events.page_view.status, "observed");
  assert.equal(events.purchase.status, "observed");
  assert.equal(events.view_item.status, "declared");
  assert.equal(events.add_to_cart.status, "declared");
});

test("extracts tracking identifiers", () => {
  const ids = extractTrackingIds("GTM-ABC123 G-ABCDEFG AW-123456 fbq('init','987654321')");
  assert.deepEqual(ids.gtm, ["GTM-ABC123"]);
  assert.deepEqual(ids.google_ads, ["AW-123456"]);
  assert.deepEqual(ids.meta_pixel, ["987654321"]);
});

test("does not penalize unassessable server-side evidence in overall score", () => {
  const events = detectCanonicalEvents("page_view", ["page_view"], []);
  const funnel = buildFunnel("content", events, [{ type: "home", url: "https://example.com", title: "Home", ok: true, forms_count: 0 }], {
    event_id: false, value: false, currency: false, transaction_id: false, content_ids: false, click_ids: false, user_hashes: false
  });
  const technologies = [];
  const result = calculateScores({
    pages: [{ ok: true }],
    technologies,
    funnel,
    parameterSignals: { event_id: false, value: false, currency: false, transaction_id: false, content_ids: false, click_ids: false, user_hashes: false },
    serverSide: { status: "not_publicly_verifiable", confidence: 20 },
    consent: { cmp_detected: false },
    failedRequests: [],
    ids: {}
  });
  assert.equal(result.dimensions.server_side.assessable, false);
  assert.ok(result.overall >= 0 && result.overall <= 100);
});
