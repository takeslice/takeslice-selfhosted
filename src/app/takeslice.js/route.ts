import { env } from "@/lib/env";
import { getProgramSettings } from "@/features/program/server/settings";

function script(appUrl: string, attributionDays: number): string {
  return `(function () {
  "use strict";
  if (window.TakeSlice && window.TakeSlice.version) return;
  var current = document.currentScript;
  var appUrl = (current && current.getAttribute("data-app-url")) || ${JSON.stringify(appUrl)};
  var configuredDays = Number(current && current.getAttribute("data-window-days"));
  var days = configuredDays >= 1 && configuredDays <= 365 ? configuredDays : ${attributionDays};
  var cookieName = "ts_click";
  var clickPattern = /^clk_[A-Za-z0-9_-]{6,80}$/;

  function readCookie() {
    var parts = document.cookie ? document.cookie.split("; ") : [];
    for (var i = 0; i < parts.length; i += 1) {
      var pair = parts[i].split("=");
      if (pair[0] === cookieName) {
        try { return decodeURIComponent(pair.slice(1).join("=")); } catch (error) { return null; }
      }
    }
    return null;
  }

  function writeCookie(value) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = cookieName + "=" + encodeURIComponent(value) + "; Path=/; Max-Age=" + (days * 86400) + "; SameSite=Lax" + secure;
  }

  function clickId() {
    var value = readCookie();
    return value && clickPattern.test(value) ? value : null;
  }

  function lookUpRef(ref) {
    fetch(appUrl + "/api/track/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({
        ref: ref,
        landingUrl: location.href,
        referrer: document.referrer || undefined,
        mode: new URLSearchParams(location.search).get("ts_mode") === "test" ? "test" : "live"
      })
    }).then(function (response) {
      return response.ok ? response.json() : null;
    }).then(function (data) {
      if (data && data.clickId && clickPattern.test(data.clickId)) writeCookie(data.clickId);
    }).catch(function () {});
  }

  var params = new URLSearchParams(location.search);
  var fromUrl = params.get("tscid");
  if (fromUrl && clickPattern.test(fromUrl)) {
    writeCookie(fromUrl);
  } else {
    var ref = params.get("ref");
    if (ref && /^[a-z0-9]{4,32}$/.test(ref) && !clickId()) lookUpRef(ref);
  }

  function stripeCheckout(link) {
    try {
      var host = new URL(link.href, location.href).hostname.toLowerCase();
      return host === "buy.stripe.com" || host === "checkout.stripe.com" || host === "invoice.stripe.com";
    } catch (error) {
      return false;
    }
  }

  function decorate(url) {
    var id = clickId();
    if (!id) return url;
    try {
      var parsed = new URL(url, location.href);
      if (!parsed.searchParams.get("client_reference_id")) parsed.searchParams.set("client_reference_id", id);
      return parsed.toString();
    } catch (error) {
      return url;
    }
  }

  document.addEventListener("click", function (event) {
    var node = event.target;
    var link = node && node.closest ? node.closest("a[href]") : null;
    if (!link || !stripeCheckout(link)) return;
    var decorated = decorate(link.href);
    if (decorated !== link.href) link.href = decorated;
  }, true);

  window.TakeSlice = {
    version: "1",
    clickId: clickId,
    decorate: decorate
  };
})();
`;
}

export async function GET() {
  const settings = await getProgramSettings();
  const body = script(env.APP_URL, settings?.attributionDays ?? 30);
  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
