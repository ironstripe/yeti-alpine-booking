"""B01: real Step4Summary unmount/remount under a retained BookingWizardProvider.
Synthetic data only; all backend requests are intercepted (synthetic hotel, empty lists), no submit."""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

HOTEL = {"id": "hotel-synthetic", "name": "Synthetic Hotel", "partner_type": "hotel", "is_active": True}
OUT = Path("/tmp/browser/checkout"); OUT.mkdir(parents=True, exist_ok=True)

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

async def rb(page): return await page.evaluate("window.readback")
async def remount(page):
    # 3 -> 1 -> 2 -> 3: summary is unmounted while the provider stays.
    await page.evaluate("window.unmountSummary()"); await page.wait_for_timeout(100)
    await page.evaluate("window.wiz.setCurrentStep(1)"); await page.evaluate("window.wiz.setCurrentStep(2)")
    await page.evaluate("window.wiz.setCurrentStep(3)"); await page.evaluate("window.mountSummary()")
    await page.get_by_text("Buchung abschliessen").wait_for()

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width, height in [(1280, 1800), (390, 800)]:
            ctx = await browser.new_context(viewport={"width": width, "height": height})
            page = await ctx.new_page()
            errors, writes, captured = [], [], []
            page.on("pageerror", lambda e: errors.append(str(e)))
            async def intercept(route):
                req = route.request; url = req.url
                if url == "http://localhost:8080/checkout-fixture":
                    return await route.fulfill(content_type="text/html", body='<html><body><div id="fixture"></div></body></html>')
                if url.startswith("http://localhost:8080"): return await route.continue_()
                if "/functions/v1/staff-booking-confirmation" in url:
                    check(req.post_data_json == {"ticket_id":"synthetic-ticket","action":"process"}, f"{tag} confirmation uses saved ticket only")
                    return await route.fulfill(content_type="application/json",body=json.dumps({"success":False,"outcome":"failed"}))
                if ("/functions/v1/private-appointments" in url or "/functions/v1/staff-group-booking" in url) and req.method == "POST":
                    captured.append(req.post_data_json)
                    return await route.fulfill(content_type="application/json", body=json.dumps({"ticket_id":"synthetic-ticket", "ticket_number":"TEST-ONLY", "appointment_ids":[], "total":100}))
                if "/rest/v1/tickets" in url and req.method == "POST":
                    captured.append({"legacy":req.post_data_json})
                    return await route.fulfill(status=400,content_type="application/json",body=json.dumps({"message":"synthetic stop after capturing insert"}))
                if req.method not in ("GET", "HEAD", "OPTIONS") and "/rest/v1/rpc/instructors_ops_list" not in url: writes.append(url); return await route.abort()
                body = [HOTEL] if "/rest/v1/billing_partners" in url else ([{"id":"synthetic-product", "type":"private", "price":100, "is_active":True}] if "/rest/v1/products" in url else [])
                await route.fulfill(content_type="application/json", body=json.dumps(body))
            await page.route("**/*", intercept)
            await page.goto("http://localhost:8080/checkout-fixture")
            await page.evaluate(FIXTURE)
            await page.get_by_text("Buchung abschliessen").wait_for()
            tag = f"[{width}]"

            # B02: defaults stay derived, explicit dates persist through date/method/navigation changes.
            await page.evaluate("window.wiz.setSelectedDates(['2026-12-22','2026-12-21'])")
            for label in ["Bar", "Karte", "TWINT", "Gutschein", "Rechnung", "Hotel"]:
                await page.get_by_role("button", name=label, exact=True).click()
                await page.locator("#settle-later").click()
                await remount(page)
                check(await page.locator("#due-date").input_value() == "2026-12-14" and (await rb(page))["effectiveDueDate"] == "2026-12-14", f"{tag} {label} default display/effective match")
                check((await rb(page))["paymentDueDate"] is None, f"{tag} {label} default not mistaken for explicit date")
            await page.evaluate("window.wiz.setSelectedDates(['2027-01-04'])")
            check(await page.locator("#due-date").input_value() == "2026-12-28", f"{tag} date change follows default")
            await page.locator("#due-date").fill("2026-12-01")
            await page.evaluate("window.wiz.setSelectedDates(['2027-02-01'])")
            await remount(page)
            check(await page.locator("#due-date").input_value() == "2026-12-01", f"{tag} explicit date ignores course change")
            await page.evaluate("window.wiz.resetWizard()")

            # paid_now/pay_later for every immediate method survives remount
            for label, method in [("Bar", "cash"), ("Karte", "card"), ("TWINT", "twint"), ("Gutschein", "voucher")]:
                for settle, radio in [("paid_now", "#settle-now"), ("pay_later", "#settle-later")]:
                    await page.get_by_role("button", name=label, exact=True).click()
                    await page.locator(radio).click()
                    await remount(page)
                    r = await rb(page)
                    check(r["paymentMethod"] == method and r["settlement"] == settle, f"{tag} {method}/{settle} kept")
                    check(await page.locator(radio).get_attribute("data-state") == "checked", f"{tag} {method}/{settle} radio shown")

            # invoice forces pay_later and stays open; manual date persists
            await page.get_by_role("button", name="Karte", exact=True).click(); await page.locator("#settle-now").click()
            await page.get_by_role("button", name="Rechnung", exact=True).click()
            await page.locator("#due-date").fill("2026-12-01")
            await remount(page); r = await rb(page)
            check(r["paymentMethod"] == "invoice" and r["settlement"] == "pay_later", f"{tag} invoice stays pay_later")
            check(r["paymentDueDate"] == "2026-12-01" and await page.locator("#due-date").input_value() == "2026-12-01", f"{tag} manual due date kept")

            # hotel with synthetic partner survives; leaving hotel clears partner
            await page.get_by_role("button", name="Hotel", exact=True).click()
            await page.locator("#billing-hotel").click(); await page.get_by_role("option", name="Synthetic Hotel").click()
            await remount(page); r = await rb(page)
            check(r["paymentMethod"] == "hotel" and r["billingPartnerId"] == "hotel-synthetic" and r["settlement"] == "pay_later", f"{tag} hotel+partner kept")
            check(await page.locator("#billing-hotel").inner_text() == "Synthetic Hotel", f"{tag} hotel shown after remount")
            await page.get_by_role("button", name="TWINT", exact=True).click()
            r = await rb(page); check(r["billingPartnerId"] is None, f"{tag} hotel->twint clears partner")

            # discount + reason via the real handler, and confirmation toggles
            await page.evaluate("window.wiz.setCheckoutOptions({discountPercent: 15, discountReason: 'Synthetisch'})")
            await page.evaluate("window.wiz.setCustomer({id:'c1', first_name:'Syn', last_name:'Test', email:'syn@example.invalid', phone:null})")
            await page.locator("#create-another").click()
            await page.screenshot(path=str(OUT / f"before_{width}.png"))
            await page.locator("#send-email").click()  # real UI: email OFF
            await page.evaluate("window.wiz.setCheckoutOptions({sendCustomerWhatsApp: true, notifyInstructor: false})")
            await remount(page); r = await rb(page)
            check(r["discountPercent"] == 15 and r["discountReason"] == "Synthetisch", f"{tag} discount+reason kept")
            check(await page.locator("#send-email").get_attribute("data-state") == "unchecked" and r["sendCustomerEmail"] is False and r["effective"]["sendCustomerEmail"] is False, f"{tag} email OFF kept (customer has email)")
            check(r["sendCustomerWhatsApp"] is True and r["notifyInstructor"] is False, f"{tag} WhatsApp/instructor kept")
            check(r["effective"]["sendCustomerWhatsApp"] is True and r["effective"]["notifyInstructor"] is False, f"{tag} effective flags kept")
            check(r["createAnother"] is True and await page.locator("#create-another").get_attribute("data-state") == "checked", f"{tag} createAnother kept")
            check(await page.get_by_text("15", exact=False).count() > 0, f"{tag} discount visible")

            # NULL email: choice ON still cannot send
            await page.evaluate("window.wiz.setCheckoutOptions({sendCustomerEmail: true})")
            await page.evaluate("window.wiz.setCustomer({id:'c2', first_name:'No', last_name:'Mail', email:null, phone:null})")
            await remount(page); r = await rb(page)
            check(r["effective"]["sendCustomerEmail"] is False, f"{tag} NULL email never sends")

            # explicit reset starts clean
            await page.evaluate("window.wiz.resetWizard()"); await remount(page); r = await rb(page)
            clean = dict(paymentMethod=None, settlement="pay_later", billingPartnerId=None, paymentDueDate=None, discountPercent=0,
                         discountReason="", sendCustomerEmail=True, sendCustomerWhatsApp=False, notifyInstructor=True, createAnother=False)
            check(all(r[k] == v for k, v in clean.items()), f"{tag} reset restores new-booking defaults")

            # Real summary click -> real useCreateBooking -> intercepted outgoing private create.
            # Auth is replaced locally; no managed session or real business data is used.
            await page.evaluate("""async () => {
              const {supabase} = await import('/src/integrations/supabase/client.ts');
              supabase.auth.getUser = async () => ({data:{user:{id:'synthetic-user'}},error:null});
              window.wiz.setProductType('private');
            }""")
            await page.evaluate("window.wiz.setSelectedDates(['2026-12-21']); window.wiz.setAppointments([{date:'2026-12-21', startTime:'10:00', durationMinutes:60}]); window.wiz.setAssignLater(true)")
            await page.evaluate("window.wiz.setSelectedParticipants([{id:'guest-synthetic',isGuest:true,first_name:'Synthetic',last_name:'Child',birth_date:'2015-01-01'}])")
            await page.evaluate("window.wiz.setCartItemParticipants(window.wiz.state.activeCartItemId,['guest-synthetic'])")
            await page.evaluate("window.wiz.setCustomer({id:'synthetic-customer',first_name:'Synthetic',last_name:'Payer',email:null,phone:null}); window.wiz.setCheckoutOptions({paymentMethod:'cash',settlement:'pay_later',sendCustomerEmail:false})")
            await page.get_by_role("button", name="Buchung erstellen", exact=True).click()
            await page.wait_for_timeout(500)
            check(len(captured) == 1, f"{tag} real summary submit reaches intercepted private create")
            if captured:
                check(captured[0]["finalization"]["payment_due_date"] == "2026-12-14", f"{tag} outgoing private due date matches displayed default")
            for method in ["cash","card","twint","voucher","invoice","hotel"]:
                for manual in [None,"2026-12-01"]:
                    await page.evaluate("""async ([method,date]) => {
                      await window.runCreate({...window.wiz.state,paymentMethod:method,settlement:'pay_later',paymentDueDate:date,billingPartnerId:method==='hotel'?'hotel-synthetic':null});
                    }""", [method,manual])
                    check(captured[-1]["finalization"]["payment_due_date"] == (manual or "2026-12-14"),f"{tag} real hook private {method} default/manual payload")
            for method in ["cash","card","twint","voucher"]:
                await page.evaluate("async method => window.runCreate({...window.wiz.state,paymentMethod:method,settlement:'paid_now',paymentDueDate:null})", method)
                check(captured[-1]["finalization"]["payment_due_date"] is None and captured[-1]["finalization"]["settlement"] == "paid_now",f"{tag} real hook {method} paid_now unchanged")
            await page.evaluate("""async () => window.runCreate({...window.wiz.state,productType:'group',sport:'ski',paymentMethod:'cash',settlement:'pay_later',paymentDueDate:null,
              groupPlan:{server:{courseId:'synthetic-course',productId:'synthetic-group',block:'am',unitPrice:100},meetingPoint:'malbipark',blocks:[{date:'2026-12-21',startTime:'10:00',endTime:'12:00'}]},meetingPoint:'malbipark'})""")
            check(captured[-1]["booking"]["finalization"]["payment_due_date"] == "2026-12-14",f"{tag} real hook group payload same date")
            await page.evaluate("async () => {try {await window.runCreate({...window.wiz.state,productType:null,selectedParticipants:[],paymentMethod:'cash',settlement:'pay_later',paymentDueDate:null})} catch {}}")
            check(captured[-1].get("legacy",{}).get("payment_due_date") == "2026-12-14",f"{tag} real hook legacy insert same date (synthetic rejection)")
            await page.screenshot(path=str(OUT / f"after_reset_{width}.png"))
            check(not writes, f"{tag} no backend writes ({writes[:2]})")
            check(not errors, f"{tag} no runtime errors ({errors[:2]})")
            await ctx.close()
        await browser.close()
    print("FAILURES:", len(fails)); sys.exit(1 if fails else 0)

asyncio.run(main())
