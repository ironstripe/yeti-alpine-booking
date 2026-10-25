"""B07b: real Step4Summary multi-item cart against intercepted office-booking (DEV preview flags).
Also the accessible L1 price dialog. Synthetic data, every backend call intercepted; no writes."""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/b07b"); OUT.mkdir(parents=True, exist_ok=True)
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
  const {PriceAckDialogHost} = await import('/src/components/PriceAckDialogHost.tsx');
  window.PA = await import('/src/lib/privateAppointmentsApi.ts');
  await import('/src/index.css');
  const h = React.createElement;
  function Probe() {
    const w = W.useBookingWizard();
    const [shown, setShown] = React.useState(true);
    window.wiz = w; window.readback = {...w.state, effective: checkoutSubmitFlags(w.state), effectiveDueDate: checkoutPaymentDueDate(w.state)};
    window.unmountSummary = () => setShown(false); window.mountSummary = () => setShown(true);
    return shown ? h(Step4Summary, {onEditStep: () => {}}) : h('p', null, 'Schritt 1');
  }
  const qc = new QueryClient({defaultOptions: {queries: {retry: false}}});
  createRoot(document.getElementById('fixture')).render(
    h(QueryClientProvider, {client: qc}, h(MemoryRouter, null, h(W.BookingWizardProvider, null, h(Probe), h(PriceAckDialogHost)))));
}"""

fails = []
def check(cond, msg):
    print(("OK   " if cond else "FAIL ") + msg)
    if not cond: fails.append(msg)

SKI = "3646f155-8a66-53e3-b512-749f3a42c1ae"; SB = "0e8e8669-d8f4-5b19-8e6d-36ff588fdee1"
ANNA = "00000000-0000-4000-8000-0000000000e1"; T1 = "00000000-0000-4000-8000-00000000f001"; T2 = "00000000-0000-4000-8000-00000000f002"
D1, D2 = "a" * 32, "b" * 32
def quote(digest, total, existing=1):
    return {"quote": {"lines": [], "total": total, "quote_digest": digest, "existing_same_day_appointments": existing, "private": [
        {"item": 0, "index": 0, "date": "2026-12-21", "time_start": "10:00:00", "time_end": "12:00:00", "participants": ["p1"], "gross": 190,
         "discount_source": "automatic", "discount_percent": 10, "discount_reason": None, "persons": 1, "eligible": 1, "net": 171},
        {"item": 1, "index": 0, "date": "2026-12-21", "time_start": "14:00:00", "time_end": "16:00:00", "participants": ["p1"], "gross": 190,
         "discount_source": "automatic", "discount_percent": 10, "discount_reason": None, "persons": 1, "eligible": 1, "net": total - 171}]}}

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width, height in [(1280, 1800), (390, 900)]:
            tag = f"[{width}]"
            ctx = await browser.new_context(viewport={"width": width, "height": height})
            page = await ctx.new_page()
            errors, writes, quotes, creates, confirms, single = [], [], [], [], [], []
            plan = {"create": ["unknown", "stale", "ok"]}
            page.on("pageerror", lambda e: errors.append(str(e)))
            async def intercept(route):
                req = route.request; url = req.url
                if url == "http://localhost:8080/checkout-fixture":
                    return await route.fulfill(content_type="text/html", body='<html><body><div id="fixture"></div></body></html>')
                if url.startswith("http://localhost:8080"): return await route.continue_()
                if "/functions/v1/office-booking" in url and req.method == "POST":
                    b = req.post_data_json
                    if b["action"] == "quote":
                        quotes.append(b)
                        stale = any(c for c in creates if c.get("_stale"))
                        return await route.fulfill(content_type="application/json", body=json.dumps(quote(D2 if len(creates) >= 2 else D1, 342 if len(creates) < 2 else 361)))
                    creates.append(b); step = plan["create"].pop(0)
                    if step == "unknown": return await route.fulfill(status=502, content_type="application/json", body=json.dumps({"error": "internal_error"}))
                    if step == "stale": return await route.fulfill(status=409, content_type="application/json", body=json.dumps({"error": "quote_changed", "quote": None}))
                    return await route.fulfill(content_type="application/json", body=json.dumps({"ticket_id": "synthetic-ticket", "ticket_number": "TEST-ONLY", "total": 361, "quote_digest": D2}))
                if "/functions/v1/staff-booking-confirmation" in url:
                    confirms.append(req.post_data_json)
                    return await route.fulfill(content_type="application/json", body=json.dumps({"success": False, "outcome": "failed"}))
                if "/functions/v1/private-appointments" in url:
                    b = req.post_data_json; single.append(b)
                    if b.get("action") == "move" and not b.get("acknowledged_quote_digest"):
                        return await route.fulfill(status=409, content_type="application/json", body=json.dumps({"error": "quote_changed", "quote": {
                          "quote_digest": "c" * 32, "old_total": 190, "new_total": 150, "items": [{"date": "2026-12-21", "time_start": "12:00", "time_end": "14:00", "old_net": 190, "net": 150, "price_changed": True, "discount_percent": 0}]}}))
                    return await route.fulfill(content_type="application/json", body=json.dumps({"price": 150, "confirmation_reset": False}))
                if "/functions/v1/" in url:
                    return await route.fulfill(content_type="application/json", body=json.dumps({}))
                if req.method not in ("GET", "HEAD", "OPTIONS"): writes.append(url); return await route.abort()
                await route.fulfill(content_type="application/json", body="[]")
            await page.route("**/*", intercept)
            await page.goto("http://localhost:8080/checkout-fixture")
            await page.evaluate("localStorage.setItem('yeti.privateTariffPreview','1')")
            await page.evaluate(FIXTURE)
            await page.get_by_text("Buchung abschliessen").wait_for()
            await page.evaluate("""async () => {
              const {supabase} = await import('/src/integrations/supabase/client.ts');
              supabase.auth.getUser = async () => ({data:{user:{id:'synthetic-user'}},error:null});
            }""")
            # Item 1 (Ski) then item 2 (Snowboard, active, never stashed before submit)
            setup = f"""
              const w = () => window.wiz;
              w().setCustomer({{id:'00000000-0000-4000-8000-0000000000c1',first_name:'Synthetic',last_name:'Payer',email:null,phone:null}});
              w().setSelectedParticipants([{{id:'{ANNA}',first_name:'Anna',last_name:'Synth',birth_date:'2016-02-02'}}]);
              w().setProductType('private'); w().setProductId('{SKI}'); w().setSelectedDates(['2026-12-21']);
              w().setAppointments([{{date:'2026-12-21', startTime:'10:00', durationMinutes:120, instructorId:'{T1}'}}]);
              w().setCartItemParticipants(w().state.activeCartItemId, ['{ANNA}']);
            """
            await page.evaluate(f"() => {{ {setup} }}")
            await page.wait_for_timeout(200)
            check(await page.get_by_text("Im Warenkorb sind mehrere", exact=False).count() == 0, f"{tag} single item: no multi block")
            await page.evaluate("() => window.wiz.addCartItem()")
            await page.wait_for_timeout(200)
            await page.evaluate(f"""() => {{ const w = window.wiz; w.setProductType('private'); w.setProductId('{SB}'); w.setSelectedDates(['2026-12-21']);
              w.setAppointments([{{date:'2026-12-21', startTime:'14:00', durationMinutes:120, instructorId:'{T2}'}}]);
              w.setCartItemParticipants(w.state.activeCartItemId, ['{ANNA}']);
              w.setCheckoutOptions({{paymentMethod:'cash',settlement:'pay_later',sendCustomerEmail:false}}); }}""")
            await page.wait_for_timeout(300)
            check(await page.get_by_text("Im Warenkorb sind mehrere", exact=False).count() == 1, f"{tag} multi switch OFF: cart stays blocked")
            check(await page.get_by_test_id("office-cart-quote").count() == 0 and not quotes, f"{tag} switch OFF: no office-booking call")
            await page.evaluate("localStorage.setItem('yeti.officeMultiPreview','1'); window.wiz.setCheckoutOptions({createAnother:false})")
            # re-render via harmless state change
            await page.evaluate("window.wiz.setCustomerNotes('')"); await page.wait_for_timeout(100)
            await page.evaluate("window.wiz.setCustomerNotes('Synth')")
            box = page.get_by_test_id("office-cart-quote")
            await box.get_by_test_id("office-quote-total").wait_for(timeout=8000)
            check(await box.get_by_test_id("office-quote-total").inner_text() == "CHF 342.00", f"{tag} combined total from server")
            check(await box.get_by_test_id("office-quote-line").count() == 2, f"{tag} every lesson line shown")
            check(await box.get_by_text("Tagesrabatt 10%", exact=False).count() == 2, f"{tag} per-person day discount shown per line")
            check(await box.get_by_test_id("office-quote-existing").count() == 1, f"{tag} same-day history context shown")
            q = quotes[-1]
            check([i["product_id"] for i in q["items"]] == [SKI, SB], f"{tag} both items sent, active item not lost")
            check([i["appointments"][0]["instructor_id"] for i in q["items"]] == [T1, T2], f"{tag} actual teachers per item")
            check(q["participants"] == [{"ref": "p1", "participant_id": ANNA}] and all(i["participants"] == ["p1"] for i in q["items"]), f"{tag} one stable person ref across items")
            check(all("discount_override" not in i for i in q["items"]), f"{tag} untouched discount = automatic (no override)")
            check("total" not in json.dumps(q) and "price" not in json.dumps(q), f"{tag} no client money in request")
            check(q.get("finalization", {}).get("payment_method") == "cash", f"{tag} finalization (B02) in the same request")
            await page.screenshot(path=str(OUT / f"quote_{width}.png"))
            btn = page.get_by_role("button", name="Buchung erstellen", exact=True)
            # 1) unknown outcome
            await btn.click(); await page.wait_for_timeout(700)
            check(await page.get_by_test_id("submit-error").get_by_text("Ergebnis unbekannt", exact=False).count() == 1, f"{tag} unknown outcome shown")
            # 2) retry -> stale quote
            await btn.click(); await page.wait_for_timeout(900)
            check(len(creates) == 2 and creates[0]["submission_key"] == creates[1]["submission_key"], f"{tag} retry keeps submission key")
            check(creates[1]["acknowledged_quote_digest"] == D1 and creates[1]["confirmation_requested"] is False, f"{tag} create bound to shown digest, mail OFF kept")
            check(await page.get_by_test_id("submit-error").get_by_text("Preis hat sich", exact=False).count() == 1, f"{tag} stale price shown")
            await box.get_by_test_id("office-quote-total").wait_for(timeout=8000)
            check(await box.get_by_test_id("office-quote-total").inner_text() == "CHF 361.00", f"{tag} refreshed quote visible")
            check(len(creates) == 2, f"{tag} no automatic resubmit after stale quote")
            await page.screenshot(path=str(OUT / f"stale_{width}.png"))
            # 3) reconfirm -> success, B05 post-success with mail failure shown separately
            await btn.click(); await page.wait_for_timeout(1200)
            check(len(creates) == 3 and creates[2]["acknowledged_quote_digest"] == D2, f"{tag} reconfirmed create bound to new digest")
            check(creates[2]["submission_key"] == creates[0]["submission_key"], f"{tag} same key through unknown + stale")
            check(len(confirms) == 1 and confirms[0].get("ticket_id") == "synthetic-ticket", f"{tag} one B05 post-success call")
            check(await page.get_by_text("TEST-ONLY", exact=False).count() >= 1, f"{tag} one success result shown")
            await page.screenshot(path=str(OUT / f"success_{width}.png"))
            # L1 accessible price dialog: decline then accept
            res = await page.evaluate("""async () => { const r = window.PA.paMove({appointment_id:'x',date:'2026-12-21',time_start:'12:00',time_end:'14:00',instructor_id:'y'}).then(()=>'saved',e=>e.code); window.__mv = r; return 'started'; }""")
            dlg = page.get_by_role("alertdialog")
            await dlg.wait_for(timeout=5000)
            check(await dlg.get_by_text("CHF 190.00 → CHF 150.00", exact=False).count() >= 1, f"{tag} price dialog shows old -> new")
            await page.keyboard.press("Escape"); r1 = await page.evaluate("window.__mv")
            check(r1 == "price_declined", f"{tag} Escape declines, nothing saved ({r1})")
            await page.evaluate("""() => { window.__mv = window.PA.paMove({appointment_id:'x',date:'2026-12-21',time_start:'12:00',time_end:'14:00',instructor_id:'y'}).then(()=>'saved',e=>e.code); }""")
            await dlg.wait_for(timeout=5000)
            await page.screenshot(path=str(OUT / f"pricedialog_{width}.png"))
            await dlg.get_by_role("button", name="Neuen Preis übernehmen").click()
            r2 = await page.evaluate("window.__mv")
            acks = [b for b in single if b.get("acknowledged_quote_digest")]
            check(r2 == "saved" and len(acks) == 1 and acks[0]["acknowledged_quote_digest"] == "c" * 32, f"{tag} accept re-sends bound to quote digest")
            check(not writes, f"{tag} no backend writes ({writes[:2]})")
            check(not errors, f"{tag} no runtime errors ({errors[:2]})")
            await ctx.close()
        await browser.close()
    print("FAILURES:", len(fails)); sys.exit(1 if fails else 0)

asyncio.run(main())
