export const TOOL_SIGNATURES = [
  {
    id: "google_tag_manager",
    name: "Google Tag Manager",
    category: "tag_management",
    methods: ["client_side"],
    patterns: {
      resources: ["googletagmanager.com/gtm.js", "googletagmanager.com/ns.html"],
      html: ["google_tag_manager", "gtm.start"],
      globals: ["datalayer"],
      ids: ["GTM-"]
    }
  },
  {
    id: "server_side_gtm",
    name: "Server-side Google Tag Manager",
    category: "server_side_tracking",
    methods: ["server_side"],
    patterns: {
      headers: ["x-gtm-server-preview"],
      firstPartyPaths: ["/g/collect", "/collect", "/gtm.js", "/gtag/js"]
    }
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    category: "analytics",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["google-analytics.com/g/collect", "googletagmanager.com/gtag/js?id=g-", "analytics.google.com"],
      html: ["gtag('config'", "gtag(\"config\"", "measurement_id"],
      cookies: ["_ga", "_gid"],
      globals: ["gtag"],
      ids: ["G-"]
    }
  },
  {
    id: "google_ads",
    name: "Google Ads",
    category: "advertising",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["googleadservices.com/pagead/conversion", "googleads.g.doubleclick.net", "pagead/1p-conversion", "pagead/1p-user-list"],
      html: ["send_to", "google_conversion_id"],
      cookies: ["_gcl_aw", "_gcl_gb"],
      ids: ["AW-"]
    }
  },
  {
    id: "google_floodlight",
    name: "Google Floodlight",
    category: "advertising",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["fls.doubleclick.net", "ad.doubleclick.net/activity", "doubleclick.net/activity"],
      cookies: ["dc_pre"]
    }
  },
  {
    id: "meta_pixel",
    name: "Meta Pixel",
    category: "advertising",
    methods: ["client_side"],
    patterns: {
      resources: ["connect.facebook.net", "facebook.com/tr", "fbevents.js"],
      html: ["fbq('init'", "fbq(\"init\""],
      cookies: ["_fbp", "_fbc"],
      globals: ["fbq"]
    }
  },
  {
    id: "meta_capi",
    name: "Meta Conversions API",
    category: "server_side_tracking",
    methods: ["server_side"],
    patterns: {
      resources: ["graph.facebook.com", "/events?access_token="],
      headers: ["x-fb-debug"]
    }
  },
  {
    id: "tiktok_pixel",
    name: "TikTok Pixel",
    category: "advertising",
    methods: ["client_side"],
    patterns: {
      resources: ["analytics.tiktok.com/i18n/pixel", "analytics.tiktok.com/api/v2/pixel", "analytics.tiktok.com/i18n/pixel/events.js"],
      html: ["ttq.load", "ttq.track"],
      cookies: ["_ttp", "ttclid"],
      globals: ["ttq"]
    }
  },
  {
    id: "tiktok_events_api",
    name: "TikTok Events API",
    category: "server_side_tracking",
    methods: ["server_side"],
    patterns: {
      resources: ["business-api.tiktok.com/open_api", "business-api.tiktok.com/event/track"]
    }
  },
  {
    id: "snapchat_pixel",
    name: "Snap Pixel",
    category: "advertising",
    methods: ["client_side"],
    patterns: {
      resources: ["sc-static.net/scevent.min.js", "tr.snapchat.com"],
      html: ["snaptr('init'", "snaptr(\"init\""],
      cookies: ["_scid", "_scid_r", "sc_at"],
      globals: ["snaptr"]
    }
  },
  {
    id: "snapchat_capi",
    name: "Snap Conversions API",
    category: "server_side_tracking",
    methods: ["server_side"],
    patterns: {
      resources: ["tr.snapchat.com/v2/conversion", "adsapi.snapchat.com/v1/conversion"]
    }
  },
  {
    id: "linkedin_insight",
    name: "LinkedIn Insight Tag",
    category: "advertising",
    methods: ["client_side"],
    patterns: {
      resources: ["snap.licdn.com/li.lms-analytics/insight.min.js", "px.ads.linkedin.com"],
      cookies: ["li_fat_id", "bcookie", "bscookie", "lidc"]
    }
  },
  {
    id: "microsoft_ads",
    name: "Microsoft Advertising UET",
    category: "advertising",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["bat.bing.com/bat.js", "bat.bing.com/action"],
      cookies: ["_uetmsclkid", "_uetsid", "_uetvid", "uetsid", "uetvid"],
      globals: ["uetq"]
    }
  },
  {
    id: "pinterest_tag",
    name: "Pinterest Tag",
    category: "advertising",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["s.pinimg.com/ct/core.js", "ct.pinterest.com"],
      html: ["pintrk("],
      cookies: ["_pinterest_ct_ua", "_pin_unauth"]
    }
  },
  {
    id: "x_pixel",
    name: "X Pixel",
    category: "advertising",
    methods: ["client_side"],
    patterns: {
      resources: ["static.ads-twitter.com/uwt.js", "analytics.twitter.com/i/adsct"],
      html: ["twq("],
      cookies: ["personalization_id"]
    }
  },
  {
    id: "reddit_pixel",
    name: "Reddit Pixel",
    category: "advertising",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["alb.reddit.com/snoo.gif", "www.redditstatic.com/ads/pixel.js"],
      html: ["rdt("],
      cookies: ["_rdt_uuid"]
    }
  },
  {
    id: "criteo",
    name: "Criteo",
    category: "advertising",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["static.criteo.net/js/ld/ld.js", "gum.criteo.com", "dis.criteo.com"]
    }
  },
  {
    id: "taboola",
    name: "Taboola Pixel",
    category: "advertising",
    methods: ["client_side"],
    patterns: {
      resources: ["cdn.taboola.com/libtrc", "trc.taboola.com"],
      html: ["_tfa.push"]
    }
  },
  {
    id: "outbrain",
    name: "Outbrain Pixel",
    category: "advertising",
    methods: ["client_side"],
    patterns: {
      resources: ["amplify.outbrain.com/cp/obtp.js", "tr.outbrain.com"],
      html: ["obapi"]
    }
  },
  {
    id: "adobe_launch",
    name: "Adobe Experience Platform Tags",
    category: "tag_management",
    methods: ["client_side"],
    patterns: {
      resources: ["assets.adobedtm.com", "launch-"]
    }
  },
  {
    id: "adobe_analytics",
    name: "Adobe Analytics",
    category: "analytics",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["omtrdc.net", "2o7.net", "b/ss/"],
      html: ["adobe analytics", "s.t(", "s.tl("],
      cookies: ["s_vi", "s_fid", "s_ecid"]
    }
  },
  {
    id: "tealium",
    name: "Tealium iQ",
    category: "tag_management",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["tags.tiqcdn.com/utag", "collect.tealiumiq.com"],
      globals: ["utag", "utag_data"]
    }
  },
  {
    id: "segment",
    name: "Segment",
    category: "cdp",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["cdn.segment.com/analytics.js", "api.segment.io/v1", "cdn.segment.com/v1/projects"],
      globals: ["analytics"]
    }
  },
  {
    id: "rudderstack",
    name: "RudderStack",
    category: "cdp",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["cdn.rudderlabs.com", "rudderstack.com/v1", "rudderanalytics.com/v1"],
      globals: ["rudderanalytics"]
    }
  },
  {
    id: "mparticle",
    name: "mParticle",
    category: "cdp",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["jssdkcdns.mparticle.com", "jssdks.mparticle.com", "s2s.mparticle.com"],
      globals: ["mparticle"]
    }
  },
  {
    id: "snowplow",
    name: "Snowplow",
    category: "analytics",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["snowplow", "/com.snowplowanalytics.snowplow/", "/i?e="],
      globals: ["snowplow"]
    }
  },
  {
    id: "matomo",
    name: "Matomo Analytics",
    category: "analytics",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["matomo.js", "piwik.js", "matomo.php", "piwik.php"],
      globals: ["_paq"],
      cookies: ["_pk_id", "_pk_ses"]
    }
  },
  {
    id: "piwik_pro",
    name: "Piwik PRO",
    category: "analytics",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["piwik.pro", "ppms.js", "ppms.php"],
      globals: ["ppms"]
    }
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    category: "product_analytics",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["cdn.mxpnl.com", "api-js.mixpanel.com", "api.mixpanel.com/track"],
      globals: ["mixpanel"],
      cookies: ["mp_"]
    }
  },
  {
    id: "amplitude",
    name: "Amplitude",
    category: "product_analytics",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["cdn.amplitude.com", "api2.amplitude.com", "api.eu.amplitude.com"],
      globals: ["amplitude"]
    }
  },
  {
    id: "heap",
    name: "Heap",
    category: "product_analytics",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["cdn.heapanalytics.com", "heapanalytics.com/api/track"],
      globals: ["heap"]
    }
  },
  {
    id: "posthog",
    name: "PostHog",
    category: "product_analytics",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["app.posthog.com", "us.i.posthog.com", "eu.i.posthog.com", "/e/?ip="],
      globals: ["posthog"]
    }
  },
  {
    id: "plausible",
    name: "Plausible Analytics",
    category: "analytics",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["plausible.io/js/script", "plausible.io/api/event"],
      globals: ["plausible"]
    }
  },
  {
    id: "fathom",
    name: "Fathom Analytics",
    category: "analytics",
    methods: ["client_side"],
    patterns: {
      resources: ["cdn.usefathom.com/script.js", "usefathom.com/api/event"]
    }
  },
  {
    id: "microsoft_clarity",
    name: "Microsoft Clarity",
    category: "session_analytics",
    methods: ["client_side"],
    patterns: {
      resources: ["clarity.ms/tag", "clarity.ms/collect"],
      globals: ["clarity"],
      cookies: ["_clck", "_clsk"]
    }
  },
  {
    id: "hotjar",
    name: "Hotjar",
    category: "session_analytics",
    methods: ["client_side"],
    patterns: {
      resources: ["static.hotjar.com/c/hotjar-", "script.hotjar.com", "insights.hotjar.com"],
      globals: ["hj"],
      cookies: ["_hj"]
    }
  },
  {
    id: "fullstory",
    name: "FullStory",
    category: "session_analytics",
    methods: ["client_side"],
    patterns: {
      resources: ["edge.fullstory.com/s/fs.js", "fullstory.com/s/fs.js"],
      globals: ["fs"]
    }
  },
  {
    id: "contentsquare",
    name: "Contentsquare",
    category: "session_analytics",
    methods: ["client_side"],
    patterns: {
      resources: ["t.contentsquare.net", "contentsquare.net/uxa"]
    }
  },
  {
    id: "lucky_orange",
    name: "Lucky Orange",
    category: "session_analytics",
    methods: ["client_side"],
    patterns: {
      resources: ["cdn.luckyorange.com", "luckyorange.com/w.js"]
    }
  },
  {
    id: "onetrust",
    name: "OneTrust",
    category: "consent_management",
    methods: ["client_side"],
    patterns: {
      resources: ["cdn.cookielaw.org", "optanon.blob.core.windows.net"],
      globals: ["onetrust", "optanonwrapper"],
      cookies: ["OptanonConsent", "OptanonAlertBoxClosed"]
    }
  },
  {
    id: "cookiebot",
    name: "Cookiebot",
    category: "consent_management",
    methods: ["client_side"],
    patterns: {
      resources: ["consent.cookiebot.com", "consentcdn.cookiebot.com"],
      globals: ["cookiebot"],
      cookies: ["CookieConsent"]
    }
  },
  {
    id: "didomi",
    name: "Didomi",
    category: "consent_management",
    methods: ["client_side"],
    patterns: {
      resources: ["sdk.privacy-center.org", "api.privacy-center.org"],
      globals: ["didomi"],
      cookies: ["didomi_token", "euconsent-v2"]
    }
  },
  {
    id: "trustarc",
    name: "TrustArc",
    category: "consent_management",
    methods: ["client_side"],
    patterns: {
      resources: ["consent.trustarc.com", "trustarc.com/notice"],
      globals: ["truste"]
    }
  },
  {
    id: "complianz",
    name: "Complianz",
    category: "consent_management",
    methods: ["client_side"],
    patterns: {
      resources: ["complianz-gdpr", "cmplz-cookiebanner"],
      cookies: ["cmplz_"]
    }
  },
  {
    id: "kepixel",
    name: "KePixel",
    category: "tracking_and_attribution",
    methods: ["client_side", "server_side"],
    patterns: {
      resources: ["tag.kepixel.online", "static.kepixel.online", "kepixel-tag.web.app", "kpxcollect", "/v1/events"],
      html: ["window.kepixel", "kpx_pub_", "data-client-id", "data-site-id"],
      globals: ["kepixel", "kpxtag"],
      firstPartyPaths: ["/v1/events", "/kpxcollect"]
    }
  },
  {
    id: "stape",
    name: "Stape",
    category: "server_side_tracking",
    methods: ["server_side"],
    patterns: {
      resources: ["stape.io", "stape.network", "stape.cloud"],
      headers: ["x-stape"]
    }
  }
];

export const PLATFORM_SIGNATURES = [
  { id: "salla", name: "Salla", funnelType: "ecommerce", high: ["cdn.salla.network", "salla.sa", "salla.store", "window.salla", "salla.config"], medium: ["salla", "data-salla"] },
  { id: "zid", name: "Zid", funnelType: "ecommerce", high: ["zid.store", "zid.sa", "cdn.zid.store", "window.zid"], medium: ["zid"] },
  { id: "shopify", name: "Shopify", funnelType: "ecommerce", high: ["cdn.shopify.com", "shopify.theme", "shopify-payment-button", "myshopify.com"], medium: ["shopify"] },
  { id: "woocommerce", name: "WooCommerce", funnelType: "ecommerce", high: ["woocommerce", "wc-ajax", "wp-content/plugins/woocommerce"], medium: ["add-to-cart", "woocommerce-page"] },
  { id: "magento", name: "Magento / Adobe Commerce", funnelType: "ecommerce", high: ["mage/cookies", "magento_", "x-magento-vary", "static/version"], medium: ["magento"] },
  { id: "bigcommerce", name: "BigCommerce", funnelType: "ecommerce", high: ["cdn11.bigcommerce.com", "stencil-utils", "bigcommerce"], medium: ["bigcommerce"] },
  { id: "webflow", name: "Webflow", funnelType: "lead_generation", high: ["webflow.js", "data-wf-page", "data-wf-site"], medium: ["webflow"] },
  { id: "wordpress", name: "WordPress", funnelType: "content", high: ["wp-content", "wp-includes", "wordpress"], medium: ["wp-json"] }
];

export const EVENT_ALIASES = {
  page_view: ["pageview", "page_view", "page view"],
  view_list: ["view_item_list", "viewcategory", "view_category", "product_list", "view list"],
  search: ["search", "view_search_results", "searchresult"],
  view_item: ["viewcontent", "view_content", "view_item", "product_view", "productdetail"],
  add_to_cart: ["addtocart", "add_to_cart", "add to cart"],
  remove_from_cart: ["removefromcart", "remove_from_cart"],
  view_cart: ["viewcart", "view_cart", "cart_view"],
  begin_checkout: ["initiatecheckout", "begin_checkout", "start_checkout", "checkout_started"],
  add_shipping_info: ["addshippinginfo", "add_shipping_info"],
  add_payment_info: ["addpaymentinfo", "add_payment_info"],
  purchase: ["purchase", "order_completed", "ordercompleted", "checkout_completed", "completepayment", "transaction"],
  form_start: ["form_start", "formstart"],
  form_submit: ["form_submit", "formsubmit", "submit_form"],
  lead: ["lead", "generate_lead", "qualifiedlead", "qualified_lead"],
  contact: ["contact", "contact_us", "click_to_call", "whatsapp_click"],
  sign_up: ["signup", "sign_up", "complete_registration", "registration"],
  trial_start: ["trial_start", "start_trial"],
  subscribe: ["subscribe", "subscription", "paid_subscription"],
  book_appointment: ["book_appointment", "bookingcompleted", "booking_success", "schedule"]
};

export const FUNNEL_DEFINITIONS = {
  ecommerce: ["page_view", "view_list", "search", "view_item", "add_to_cart", "view_cart", "begin_checkout", "add_shipping_info", "add_payment_info", "purchase"],
  lead_generation: ["page_view", "form_start", "form_submit", "lead", "contact", "book_appointment"],
  saas: ["page_view", "view_item", "sign_up", "trial_start", "subscribe", "purchase"],
  content: ["page_view", "search", "form_submit", "subscribe"],
  unknown: ["page_view"]
};
