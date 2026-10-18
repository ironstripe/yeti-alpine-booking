"""Actual optional lunch control with synthetic data; no external requests or business writes."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    out = Path("/tmp/browser/lunch")
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width, height in [(1280, 1800), (390, 700)]:
            context = await browser.new_context(viewport={"width": width, "height": height})
            page = await context.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            async def intercept(route):
                url = route.request.url
                if not url.startswith("http://localhost:8080"):
                    await route.abort()
                elif url == "http://localhost:8080/lunch-fixture":
                    await route.fulfill(content_type="text/html", body='<html><body><div id="fixture"></div></body></html>')
                else:
                    await route.continue_()
            await page.route("**/*", intercept)
            await page.goto("http://localhost:8080/lunch-fixture")
            await page.evaluate("""async () => {
              const Refresh = await import("/@react-refresh"); Refresh.default.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
              const React = await import('/node_modules/.vite/deps/react.js');
              const {createRoot} = await import('/node_modules/.vite/deps/react-dom_client.js');
              const {LunchSupervisionAddon} = await import('/src/components/bookings/wizard/LunchSupervisionAddon.tsx');
              const {groupLunchEligible} = await import('/src/lib/groupLunch.ts');
              await import('/src/index.css');
              const dates = ['2026-12-14','2026-12-15'];
              const blocks = dates.flatMap(date => [{date,startTime:'10:00',endTime:'12:00'}, {date,startTime:'14:00',endTime:'16:00'}]);
              const server = {courseId:'synthetic',productId:'synthetic',block:null,unitPrice:200};
              function Fixture() {
                const [mode,setMode] = React.useState('full');
                const [lunch,setLunch] = React.useState({});
                const [veg,setVeg] = React.useState({});
                window.lunchReadback = {lunch,veg,mode};
                const plan = {server:{...server,block:mode === 'half' ? 'am' : null},blocks};
                return React.createElement('main', {className:'p-4 max-w-3xl'},
                  React.createElement('select', {'aria-label':'Synthetic course',value:mode,onChange:e=>setMode(e.target.value)},
                    React.createElement('option',{value:'full'},'Full day'), React.createElement('option',{value:'half'},'Half day')),
                  groupLunchEligible(plan,dates) ? React.createElement(LunchSupervisionAddon,{
                    selectedDates:dates, participants:[{id:'a',first_name:'Anna'},{id:'b',first_name:'Ben'}],
                    lunchSelections:lunch,vegetarianSelections:veg,lunchPricePerDay:30,
                    onLunchDaysChange:(id,days)=>setLunch(v=>({...v,[id]:days})),
                    onVegetarianChange:(id,value)=>setVeg(v=>({...v,[id]:value}))
                  }) : null);
              }
              createRoot(document.getElementById('fixture')).render(React.createElement(Fixture));
            }""")
            switch = page.get_by_role("switch")
            await switch.wait_for()
            assert not await switch.is_checked()
            await switch.click()
            await page.get_by_role("button", name="Keine", exact=True).first.wait_for()
            assert await page.evaluate("window.lunchReadback.lunch.a.length + window.lunchReadback.lunch.b.length") == 4
            await page.screenshot(path=str(out / f"{width}-selected.png"))
            await page.get_by_role("button", name="Keine", exact=True).first.click()
            await page.wait_for_timeout(150)
            assert await page.evaluate("window.lunchReadback.lunch.a.length") == 0
            assert await page.evaluate("window.lunchReadback.lunch.b.length") == 2
            await page.screenshot(path=str(out / f"{width}-optional.png"))
            await switch.click()
            assert await page.evaluate("Object.values(window.lunchReadback.lunch).flat().length") == 0
            await page.get_by_label("Synthetic course").select_option("half")
            assert await page.get_by_role("switch").count() == 0
            await page.get_by_label("Synthetic course").select_option("full")
            await page.get_by_role("switch").wait_for()
            assert not await page.get_by_role("switch").is_checked()
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            assert not errors, errors
            print(f"{width}: optional selection/readback, empty selection stays empty, full-day only, no runtime errors")
            await context.close()
        await browser.close()

asyncio.run(main())
