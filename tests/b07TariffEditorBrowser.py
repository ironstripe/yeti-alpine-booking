"""B07-P2: real PrivateTariffRulesEditor mounted in the dev app; REST reads and the save function are
intercepted (synthetic config). Configures a 14-16 exact block without code change; checks payload + stale."""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/b07editor"); OUT.mkdir(parents=True, exist_ok=True)
PID = "00000000-0000-4000-8000-0000000000a0"
FIXTURE = r"""async () => {
  const Refresh = await import('/@react-refresh'); Refresh.default.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t; window.__vite_plugin_react_preamble_installed__ = true;
  const src = '/src/components/settings/PrivateTariffRulesEditor.tsx';
  const dep = async (s, name) => (await (await fetch(s)).text()).match(new RegExp('from "([^"]*/' + name + '[^"]*)"'))[1];
  const {default: React} = await import(await dep(src, 'deps/react.js'));
  const {default: {createRoot}} = await import('/node_modules/.vite/deps/react-dom_client.js');
  const {QueryClient, QueryClientProvider} = await import(await dep('/src/hooks/usePrivateTariffRules.ts', '@tanstack_react-query'));
  const {PrivateTariffRulesEditor} = await import(src);
  await import('/src/index.css');
  const qc = new QueryClient({defaultOptions: {queries: {retry: false}}});
  createRoot(document.getElementById('fixture')).render(React.createElement(QueryClientProvider, {client: qc},
    React.createElement(PrivateTariffRulesEditor, {productId: '%s'})));
}""" % PID
RULES = [
  {"rule_kind": "hourly", "window_start": "09:00:00", "window_end": "10:00:00", "price_chf": 75, "extra_person_chf": 20, "max_persons": 4, "max_block_minutes": None, "office_only": False, "provenance": "seed"},
  {"rule_kind": "exact_block", "window_start": "10:00:00", "window_end": "12:00:00", "price_chf": 190, "extra_person_chf": 40, "max_persons": 4, "max_block_minutes": None, "office_only": False, "provenance": "seed"},
]
fails = []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width, height in [(1280, 1800), (390, 900)]:
            ctx = await browser.new_context(viewport={"width": width, "height": height})
            page = await ctx.new_page(); tag = f"[{width}]"
            errors, saves, writes = [], [], []
            stale = {"on": False}
            page.on("pageerror", lambda e: errors.append(str(e)))
            async def intercept(route):
                req = route.request; url = req.url
                if url == "http://localhost:8080/editor-fixture":
                    return await route.fulfill(content_type="text/html", body='<html><body><div id="fixture"></div></body></html>')
                if url.startswith("http://localhost:8080"): return await route.continue_()
                if "/functions/v1/product-private-tariff-rules" in url and req.method == "POST":
                    saves.append(req.post_data_json)
                    if stale["on"]: return await route.fulfill(status=409, content_type="application/json", body=json.dumps({"error": "stale", "revision": 2}))
                    return await route.fulfill(content_type="application/json", body=json.dumps({"revision": 2, "rules": req.post_data_json["rules"]}))
                if "/rest/v1/product_private_tariff_revisions" in url:
                    return await route.fulfill(content_type="application/json", body=json.dumps({"revision": 1}))
                if "/rest/v1/product_private_tariff_rules" in url:
                    return await route.fulfill(content_type="application/json", body=json.dumps(RULES))
                if req.method not in ("GET", "HEAD", "OPTIONS"): writes.append(url); return await route.abort()
                await route.fulfill(content_type="application/json", body="[]")
            await page.route("**/*", intercept)
            await page.goto("http://localhost:8080/editor-fixture")
            await page.evaluate(FIXTURE)
            await page.get_by_label("Preis 2").wait_for()
            check(await page.get_by_label("Preis 2").input_value() == "190", f"{tag} configured 10-12 = 190 loaded")
            await page.get_by_role("button", name="Fixer Block").click()
            await page.get_by_label("Von 3").fill("14:00"); await page.get_by_label("Bis 3").fill("16:00")
            await page.get_by_label("Preis 3").fill("190"); await page.get_by_label("Zuschlag 3").fill("40")
            await page.get_by_label("Quelle 3").fill("Ivo DECISIONS 14-16")
            await page.screenshot(path=str(OUT / f"editor_{width}.png"))
            await page.get_by_role("button", name="Tarife speichern").click()
            await page.wait_for_timeout(500)
            check(len(saves) == 1 and saves[0]["expected_revision"] == 1, f"{tag} save is revision-checked (expected 1)")
            if saves:
                r3 = saves[0]["rules"][2]
                check(r3["rule_kind"] == "exact_block" and r3["window_start"] == "14:00" and r3["price_chf"] == 190 and r3["extra_person_chf"] == 40, f"{tag} 14-16 block sent as configuration")
            stale["on"] = True
            await page.get_by_role("button", name="Tarife speichern").click()
            await page.get_by_text("Tarife wurden inzwischen geändert", exact=False).wait_for(timeout=3000)
            check(True, f"{tag} stale save shows reload message")
            check(not writes, f"{tag} no other backend writes {writes[:2]}")
            check(not errors, f"{tag} no runtime errors {errors[:2]}")
            await ctx.close()
        await browser.close()
    print("FAILURES:", len(fails)); sys.exit(1 if fails else 0)

asyncio.run(main())
