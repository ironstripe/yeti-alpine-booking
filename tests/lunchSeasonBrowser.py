"""B09: real useLunchProduct hook in the running app, REST intercepted (synthetic, no network/business writes).
Switching the booked course product between seasons must re-resolve (no stale cache); duplicates/missing fail."""
import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright

PRODUCTS = {"p26": "s26", "p25": "s25", "pdup": "sdup", "pnone": "snone"}
SEASONS = {"s26": ("2026-12-01", "2027-04-15"), "s25": ("2025-12-20", "2026-04-06"), "sdup": ("2026-12-01", "2027-04-15"), "snone": ("2026-12-01", "2027-04-15")}
LUNCH = {"s26": [{"id": "lunch-26", "price": 30}], "s25": [{"id": "lunch-25", "price": 30}], "sdup": [{"id": "a", "price": 30}, {"id": "b", "price": 30}], "snone": []}

async def main():
    out = Path("/tmp/browser/b09"); out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await (await browser.new_context(viewport={"width": 1280, "height": 1800})).new_page()
        calls = []
        async def intercept(route):
            url = route.request.url
            if "/rest/v1/" in url:
                calls.append(url)
                single = "object" in (route.request.headers.get("accept") or "")
                def eq(k):
                    m = re.search(rf"[?&]{k}=eq\.([^&]+)", url); return m.group(1) if m else None
                if "/rest/v1/seasons" in url:
                    s = eq("id"); a, b = SEASONS[s]; body = [{"id": s, "start_date": a, "end_date": b}]
                elif eq("type") == "lunch":
                    body = LUNCH[eq("season_id")]
                else:
                    body = [{"season_id": PRODUCTS[eq("id")]}]
                await route.fulfill(content_type="application/json", body=json.dumps(body[0] if single else body))
            elif not url.startswith("http://localhost:8080"):
                await route.abort()
            elif url == "http://localhost:8080/b09-fixture":
                await route.fulfill(content_type="text/html", body='<html><body><div id="fixture"></div></body></html>')
            else:
                await route.continue_()
        await page.route("**/*", intercept)
        await page.goto("http://localhost:8080/b09-fixture")
        await page.evaluate("""async () => {
          const Refresh = await import("/@react-refresh"); Refresh.default.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t; window.__vite_plugin_react_preamble_installed__ = true;
          const {default: React} = await import('/node_modules/.vite/deps/react.js');
          const {default: {createRoot}} = await import('/node_modules/.vite/deps/react-dom_client.js');
          const {QueryClient, QueryClientProvider} = await import('/node_modules/.vite/deps/@tanstack_react-query.js');
          const {useLunchProduct} = await import('/src/hooks/useLunchProduct.ts');
          function Probe() {
            const [ctx, setCtx] = React.useState({ productId: 'p26', dates: ['2026-12-21'] });
            window.setCtx = setCtx;
            const q = useLunchProduct(ctx);
            return React.createElement('div', { id: 'out' }, q.isLoading ? 'loading' : (q.data ? q.data.id + ':' + q.data.price : 'none'));
          }
          createRoot(document.getElementById('fixture')).render(React.createElement(QueryClientProvider, { client: new QueryClient() }, React.createElement(Probe)));
        }""")
        out_el = page.locator("#out")
        async def expect(v):
            await page.wait_for_function("v => document.getElementById('out')?.textContent === v", arg=v, timeout=5000)
        await expect("lunch-26:30"); print("26/27 course -> lunch-26")
        await page.evaluate("window.setCtx({ productId: 'p25', dates: ['2026-01-05'] })"); await expect("lunch-25:30"); print("switch to 25/26 course -> lunch-25 (no stale cache)")
        await page.evaluate("window.setCtx({ productId: 'p25', dates: ['2026-12-21'] })"); await expect("none"); print("25/26 product with 26/27 date -> none")
        await page.evaluate("window.setCtx({ productId: 'pdup', dates: ['2026-12-21'] })"); await expect("none"); print("same-season duplicate -> none")
        await page.evaluate("window.setCtx({ productId: 'pnone', dates: ['2026-12-21'] })"); await expect("none"); print("missing -> none")
        await page.evaluate("window.setCtx({ productId: 'p26', dates: ['2026-12-21'] })"); await expect("lunch-26:30"); print("back to 26/27 -> lunch-26")
        assert not any("type=eq.lunch" in c and "season_id" not in c for c in calls), "global lunch query issued"
        await out_el.screenshot(path=str(out / "final.png"))
        print("rest calls:", len(calls), "all lunch queries season-filtered")
        await browser.close()
asyncio.run(main())
