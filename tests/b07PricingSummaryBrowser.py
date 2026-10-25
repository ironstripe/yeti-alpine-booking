"""B07-P2: real Step4Summary with the product-tariff path enabled via the DEV-only preview flag.
Server quote is intercepted (synthetic numbers shaped like the SQL result); no backend writes."""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/b07summary"); OUT.mkdir(parents=True, exist_ok=True)
FIXTURE = r"""async () => {
  const Refresh = await import('/@react-refresh'); Refresh.default.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t; window.__vite_plugin_react_preamble_installed__ = true;
  const {default: React} = await import((await (await fetch('/src/components/bookings/wizard/Step4Summary.tsx')).text()).match(/from "([^"]*\/deps\/react\.js[^"]*)"/)[1]);
  const {default: {createRoot}} = await import('/node_modules/.vite/deps/react-dom_client.js');
  // Use the exact dependency URLs Vite gave the app modules (same instances as Step4Summary).
  const dep = async (src, name) => (await (await fetch(src)).text()).match(new RegExp('from "([^"]*/' + name + '[^"]*)"'))[1];
  const {MemoryRouter} = await import(await dep('/src/components/bookings/wizard/Step4Summary.tsx', 'react-router-dom'));
  const {QueryClient, QueryClientProvider} = await import(await dep('/src/hooks/useBillingPartners.ts', '@tanstack_react-query'));
  const W = await import(await dep('/src/components/bookings/wizard/Step4Summary.tsx', 'BookingWizardContext'));
  const {Step4Summary} = await import('/src/components/bookings/wizard/Step4Summary.tsx');
  const {checkoutSubmitFlags} = await import('/src/lib/checkoutSubmitFlags.ts');
  const {checkoutPaymentDueDate} = await import('/src/lib/checkoutDueDate.ts');
  const {useCreateBooking} = await import('/src/hooks/useCreateBooking.ts');
  await import('/src/index.css');
  const h = React.createElement;
  function Probe() {
    const w = W.useBookingWizard();
    const create = useCreateBooking(); window.runCreate = (state) => create.mutateAsync(state);
    const [shown, setShown] = React.useState(true);
    window.wiz = w; window.readback = {...w.state, effective: checkoutSubmitFlags(w.state), effectiveDueDate: checkoutPaymentDueDate(w.state)};
    window.unmountSummary = () => setShown(false); window.mountSummary = () => setShown(true);
    return shown ? h(Step4Summary, {onEditStep: () => {}}) : h('p', null, 'Schritt 1');
  }
  const qc = new QueryClient({defaultOptions: {queries: {retry: false}}});
  createRoot(document.getElementById('fixture')).render(
    h(QueryClientProvider, {client: qc}, h(MemoryRouter, null, h(W.BookingWizardProvider, null, h(Probe)))));
}"""

fails = []
def check(cond, msg):
    print(("OK   " if cond else "FAIL ") + msg)
    if not cond: fails.append(msg)

def quote_for(body):
    # Synthetic server answer: 2 lessons 190 each, 1 person, automatic 10% unless overridden.
    ov = body.get("discount_override")
    items = []
    for i, a in enumerate(body["appointments"]):
        pct = ov["percent"] if ov else 10
        amt = round(190 * pct / 100, 2)
        items.append({"index": i, "price": 190, "mode": "exact_block", "persons": body["persons"], "eligible": body["persons"],
          "automatic_discount_amount": 19, "discount_source": "manual" if ov else "automatic", "discount_percent": pct,
          "discount_reason": None, "discount_amount": amt, "net": 190 - amt})
    disc = sum(x["discount_amount"] for x in items)
    return {"revision": 7, "discount_rule_revision": 3, "gross_total": 190 * len(items), "discount_total": disc,
      "automatic_discount_total": 19 * len(items), "total": 190 * len(items) - disc,
      "discount_source": "manual" if ov else "automatic", "discount_rule": {"percent": 10, "threshold_minutes": 240}, "items": items}

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width, height in [(1280, 1800), (390, 900)]:
            ctx = await browser.new_context(viewport={"width": width, "height": height})
            page = await ctx.new_page()
            errors, writes, quotes, creates = [], [], [], []
            page.on("pageerror", lambda e: errors.append(str(e)))
            async def intercept(route):
                req = route.request; url = req.url
                if url == "http://localhost:8080/checkout-fixture":
                    return await route.fulfill(content_type="text/html", body='<html><body><div id="fixture"></div></body></html>')
                if url.startswith("http://localhost:8080"): return await route.continue_()
                if "/functions/v1/private-appointments" in url and req.method == "POST":
                    b = req.post_data_json
                    if b["action"] == "quote":
                        quotes.append(b); return await route.fulfill(content_type="application/json", body=json.dumps(quote_for(b)))
                    creates.append(b)
                    return await route.fulfill(content_type="application/json", body=json.dumps({"ticket_id":"synthetic-ticket","ticket_number":"TEST-ONLY","appointment_ids":[],"total":342}))
                if "/functions/v1/" in url:
                    return await route.fulfill(content_type="application/json", body=json.dumps({"success": False, "outcome": "not_requested"}))
                if req.method not in ("GET", "HEAD", "OPTIONS"): writes.append(url); return await route.abort()
                await route.fulfill(content_type="application/json", body="[]")
            await page.route("**/*", intercept)
            await page.goto("http://localhost:8080/checkout-fixture")
            await page.evaluate("localStorage.setItem('yeti.privateTariffPreview','1')")
            await page.evaluate(FIXTURE)
            await page.get_by_text("Buchung abschliessen").wait_for()
            tag = f"[{width}]"
            await page.evaluate("""async () => {
              const {supabase} = await import('/src/integrations/supabase/client.ts');
              supabase.auth.getUser = async () => ({data:{user:{id:'synthetic-user'}},error:null});
              window.wiz.setProductType('private'); window.wiz.setProductId('00000000-0000-4000-8000-0000000000a0');
            }""")
            await page.evaluate("window.wiz.setSelectedDates(['2026-12-21']); window.wiz.setAppointments([{date:'2026-12-21', startTime:'10:00', durationMinutes:120},{date:'2026-12-21', startTime:'14:00', durationMinutes:120}]); window.wiz.setAssignLater(true)")
            await page.evaluate("window.wiz.setSelectedParticipants([{id:'guest-synthetic-1',isGuest:true,first_name:'Anna',last_name:'Synth',birth_date:'2010-01-01'}])")
            await page.evaluate("window.wiz.setCartItemParticipants(window.wiz.state.activeCartItemId,['guest-synthetic-1'])")
            await page.evaluate("window.wiz.setCustomer({id:'synthetic-customer',first_name:'Synthetic',last_name:'Payer',email:null,phone:null}); window.wiz.setCheckoutOptions({paymentMethod:'cash',settlement:'pay_later',sendCustomerEmail:false})")
            qbox = page.get_by_test_id("private-server-quote")
            await qbox.get_by_test_id("quote-total").wait_for()
            check(await qbox.get_by_test_id("quote-total").inner_text() == "CHF 342.00", f"{tag} automatic quote total shown")
            check(await qbox.get_by_text("Automatischer Tagesrabatt 10 %", exact=False).count() == 1, f"{tag} automatic discount line shown")
            check(await qbox.get_by_test_id("quote-line").count() == 2, f"{tag} one line per lesson")
            check(quotes and "discount_override" not in quotes[-1], f"{tag} default 0 is NOT sent as override")
            await page.screenshot(path=str(OUT / f"auto_{width}.png"))

            # explicit manual 5% replaces automatic, shows the replaced amount
            await page.get_by_label("Manueller Rabatt in Prozent").fill("5")
            await page.get_by_label("Grund für manuellen Rabatt").fill("Stammkunde")
            await qbox.get_by_test_id("override-note").wait_for()
            check(await qbox.get_by_test_id("quote-total").inner_text() == "CHF 361.00", f"{tag} manual 5% replaces automatic (not added)")
            check(quotes[-1].get("discount_override") == {"percent": 5}, f"{tag} quote carries explicit override")
            await page.screenshot(path=str(OUT / f"manual_{width}.png"))
            # explicit 0
            await page.get_by_label("Manueller Rabatt in Prozent").fill("0")
            await page.wait_for_timeout(300)
            check(await qbox.get_by_test_id("quote-total").inner_text() == "CHF 380.00", f"{tag} explicit 0 removes automatic discount")
            check(quotes[-1].get("discount_override") == {"percent": 0}, f"{tag} explicit 0 sent as override")
            # submit binds to shown revisions and the override
            await page.get_by_role("button", name="Buchung erstellen", exact=True).click()
            await page.wait_for_timeout(600)
            check(len(creates) == 1, f"{tag} submit reaches intercepted create")
            if creates:
                c = creates[0]
                check(c.get("quote_revision") == 7 and c.get("discount_rule_revision") == 3, f"{tag} create bound to shown revisions")
                check(c.get("discount_override") == {"percent": 0, "reason": "Stammkunde"} and "discount_percent" not in c, f"{tag} create carries explicit override only")
            # clear override returns automatic
            await page.evaluate("window.wiz.setCheckoutOptions({discountPercent:0, discountReason:'', discountExplicit:false})")
            await page.wait_for_timeout(400)
            check(await qbox.get_by_test_id("quote-total").inner_text() == "CHF 342.00", f"{tag} clearing override returns automatic")
            check(not writes, f"{tag} no backend writes ({writes[:2]})")
            check(not errors, f"{tag} no runtime errors ({errors[:2]})")
            await ctx.close()
        await browser.close()
    print("FAILURES:", len(fails)); sys.exit(1 if fails else 0)

asyncio.run(main())
