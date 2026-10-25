"""B07b: REAL wizard steps 1->2->3 (BookingWizard page) desktop+mobile, every backend call intercepted.
Two concrete 26/27 private products (Ski + Snowboard), new participant shared across items, active item
unsaved, back navigation, mail OFF, one atomic create. Synthetic data only; no writes reach a backend."""
import asyncio, json, sys, urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path("/tmp/browser/b07b-wizard"); OUT.mkdir(parents=True, exist_ok=True)
fails = []
def check(c, m):
  print(("OK   " if c else "FAIL ") + m)
  if not c: fails.append(m)

SKI="3646f155-8a66-53e3-b512-749f3a42c1ae"; SB="0e8e8669-d8f4-5b19-8e6d-36ff588fdee1"; SEASON="f185b448-e6aa-46b8-94ae-0875a7a6c166"
T1="00000000-0000-4000-8000-00000000f001"; CUST="00000000-0000-4000-8000-0000000000c1"
Q={"quote":{"lines":[],"private":[],"total":342,"quote_digest":"a"*32,"existing_same_day_appointments":0}}
APPTS=urllib.parse.quote(json.dumps([{"date":"2026-12-21","startTime":"10:00","durationMinutes":120}]))
FIX = r"""async (url) => {
  const Refresh = await import('/@react-refresh'); Refresh.default.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t; window.__vite_plugin_react_preamble_installed__ = true;
  const dep = async (src, name) => (await (await fetch(src)).text()).match(new RegExp('from "([^"]*/' + name + '[^"]*)"'))[1];
  const {default: React} = await import(await dep('/src/pages/BookingWizard.tsx', 'deps/react.js'));
  const {default: {createRoot}} = await import('/node_modules/.vite/deps/react-dom_client.js');
  const {MemoryRouter, Routes, Route} = await import(await dep('/src/pages/BookingWizard.tsx', 'react-router-dom'));
  const {QueryClient, QueryClientProvider} = await import(await dep('/src/pages/BookingWizard.tsx', '@tanstack_react-query'));
  const {default: BookingWizard} = await import('/src/pages/BookingWizard.tsx');
  await import('/src/index.css');
  const h = React.createElement;
  const qc = new QueryClient({defaultOptions: {queries: {retry: false}}});
  createRoot(document.getElementById('fixture')).render(h(QueryClientProvider, {client: qc},
    h(MemoryRouter, {initialEntries: [url]}, h(Routes, null, h(Route, {path: '/bookings/new', element: h(BookingWizard)}), h(Route, {path: '*', element: h('p', null, 'NAV-AWAY')})))));
}"""
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(headless=True)
    for W, H in [(1280, 1800), (390, 900)]:
     tag = f"[{W}]"
     ctx = await b.new_context(viewport={"width":W,"height":H}); page = await ctx.new_page()
     reqs=[]; errs=[]; office=[]; confirms=[]; single=[]
     page.on("pageerror", lambda e: errs.append(str(e)))
     async def route(r):
       u=r.request.url
       if u=="http://localhost:8080/fx": return await r.fulfill(content_type="text/html", body='<html><body><div id="fixture"></div></body></html>')
       if u.startswith("http://localhost:8080"): return await r.continue_()
       reqs.append(r.request.method+" "+u[:160])
       if "/functions/v1/office-booking" in u:
           b=r.request.post_data_json; office.append(b)
           if b["action"]=="quote": return await r.fulfill(content_type="application/json", body=json.dumps(Q))
           return await r.fulfill(content_type="application/json", body=json.dumps({"ticket_id":"synthetic-ticket","ticket_number":"TEST-ONLY","total":342,"quote_digest":"a"*32}))
       if "/functions/v1/staff-booking-confirmation" in u:
           confirms.append(r.request.post_data_json); return await r.fulfill(content_type="application/json", body=json.dumps({"success":True,"outcome":"not_requested"}))
       if "/functions/v1/private-appointments" in u or "/functions/v1/staff-group-booking" in u:
           single.append((u, r.request.post_data_json)); return await r.fulfill(status=500, content_type="application/json", body="{}")
       if "/rpc/search_customers" in u: return await r.fulfill(content_type="application/json", body=json.dumps([{"id":CUST,"first_name":"Synthetic","last_name":"Payer","email":"synthetic@example.invalid","phone":None,"customer_number":"TEST","participant_names":[]}]))
       if "/rest/v1/customers" in u: return await r.fulfill(content_type="application/json", body=json.dumps({"id":CUST,"first_name":"Synthetic","last_name":"Payer","email":"synthetic@example.invalid","phone":None,"customer_number":"TEST"}))
       if r.request.method not in ("GET","HEAD","OPTIONS") and "/functions/" not in u and "/rpc/" not in u: return await r.abort()
       if "/rest/v1/seasons" in u: return await r.fulfill(content_type="application/json", body=json.dumps({"id":SEASON,"name":"Winter 26/27","is_current":True,"start_date":"2026-12-01","end_date":"2027-04-15"} if "is_current" in u else []))
       if "/rest/v1/products" in u: return await r.fulfill(content_type="application/json", body=json.dumps([
           {"id":SKI,"name":"Privatunterricht Ski","type":"private","duration_minutes":55,"is_active":True,"season_id":SEASON,"price":0,"sort_order":1},
           {"id":SB,"name":"Privatunterricht Snowboard","type":"private","duration_minutes":60,"is_active":True,"season_id":SEASON,"price":0,"sort_order":2}]))
       if "/rest/v1/instructors" in u or "/rpc/instructors_ops_list" in u:
           row={"id":T1,"first_name":"Tina","last_name":"Test","status":"active","specialization":"ski","role":"teacher","roles":["teacher"],"is_active":True,"color":"#3366ff","sort_order":1}
           return await r.fulfill(content_type="application/json", body=json.dumps(row if "single" in (r.request.headers.get("accept") or "") or "object" in (r.request.headers.get("accept") or "") else [row]))
       await r.fulfill(content_type="application/json", body="[]")
     await page.route("**/*", route)
     await page.goto("http://localhost:8080/fx")
     await page.evaluate("localStorage.setItem('yeti.privateTariffPreview','1'); localStorage.setItem('yeti.officeMultiPreview','1')")
     await page.evaluate(FIX, f"/bookings/new?instructor={T1}&appointments={APPTS}")
     await page.wait_for_timeout(3000)
     await page.get_by_role("radio", name="Ski", exact=False).first.click(); await page.wait_for_timeout(800)
     await page.screenshot(path=str(OUT/"s1.png"))
     await page.get_by_role("button", name="Teilnehmer hinzufügen").first.click(); await page.wait_for_timeout(800)
     await page.get_by_role("button", name="Neuen Teilnehmer erstellen").click(); await page.wait_for_timeout(600)
     await page.screenshot(path=str(OUT/"s2.png"))
     dlg = page.get_by_role("dialog")
     await dlg.get_by_placeholder("Vorname *").fill("Anna"); await dlg.get_by_placeholder("Nachname").fill("Synth")
     bd = dlg.get_by_placeholder("Geburtsdatum"); print("bd type", await bd.get_attribute("type"))
     await bd.fill("2016-02-02" if (await bd.get_attribute("type"))=="date" else "02.02.2016")
     await dlg.get_by_role("button", name="Erstellen").click(); await page.wait_for_timeout(500)
     await page.screenshot(path=str(OUT/"s3.png"))
     await dlg.get_by_role("button", name="Teilnehmer übernehmen").click(); await page.wait_for_timeout(600)
     await page.screenshot(path=str(OUT/"s4.png"))
     await page.get_by_role("button", name="Weiteres Produkt hinzufügen").click(); await page.wait_for_timeout(700)
     await page.locator("label[for=private]").click(); await page.wait_for_timeout(300)
     await page.get_by_role("radio", name="Snowboard", exact=False).first.click(); await page.wait_for_timeout(300)
     nxt = page.locator("button[name=next-month], button[aria-label*='next' i], button[aria-label*='nächst' i]").first
     for _ in range(2): await nxt.click(); await page.wait_for_timeout(200)
     await page.get_by_text("Dezember 2026").wait_for(timeout=3000)
     await page.get_by_role("gridcell", name="21").or_(page.locator("button:text-is('21')")).first.click(); await page.wait_for_timeout(400)
     await page.get_by_role("combobox").filter(has_text="Start").first.click(); await page.get_by_role("option", name="14:00").click(); await page.wait_for_timeout(300)
     await page.get_by_role("combobox").filter(has_text="Ende").first.click(); await page.get_by_role("option", name="16:00").click(); await page.wait_for_timeout(500)
     await page.get_by_text("Später zuweisen", exact=True).first.click(); await page.wait_for_timeout(500)
     await page.screenshot(path=str(OUT/"s5.png"))
     await page.get_by_role("button", name="Teilnehmer hinzufügen").first.click(); await page.wait_for_timeout(600)
     dlg = page.get_by_role("dialog")
     await page.screenshot(path=str(OUT/"s5b.png"))
     await dlg.get_by_role("checkbox").first.click(); await page.wait_for_timeout(300)
     await page.screenshot(path=str(OUT/"s5c.png"))
     await dlg.get_by_role("button", name="Teilnehmer übernehmen").click(); await page.wait_for_timeout(600)
     await page.get_by_role("button", name="Weiter zum zahlungspflichtigen Kunden").click(); await page.wait_for_timeout(1000)
     await page.screenshot(path=str(OUT/"s6.png"))
     await page.get_by_placeholder("Name, Kundennummer", exact=False).fill("Synth"); await page.wait_for_timeout(900)
     await page.get_by_text("Synthetic Payer").first.click(); await page.wait_for_timeout(800)
     await page.get_by_role("button", name="Weiter zur Prüfung").click(); await page.wait_for_timeout(1500)
     await page.screenshot(path=str(OUT/"s7.png"))
     q = [o for o in office if o["action"] == "quote"]
     check(len(q) >= 1, f"{tag} summary requested one combined quote")
     req = q[-1]
     check([it["product_id"] for it in req["items"]] == [SKI, SB], f"{tag} concrete 26/27 Ski + Snowboard products (no generic fallback)")
     check(len(req["participants"]) == 1 and all(it["participants"] == ["p1"] for it in req["items"]), f"{tag} new participant entered once, shared ref across items")
     check(req["items"][0]["appointments"][0].get("instructor_id") == T1 and req["items"][1]["appointments"][0].get("assign_later") is True, f"{tag} actual teacher / explicit assign-later per item")
     check(req["items"][1]["appointments"][0]["time_start"] == "14:00", f"{tag} active unsaved item (Snowboard 14-16) included")
     check(req["finalization"]["payment_due_date"] == "2026-12-14", f"{tag} due date from earliest cart date")
     await page.screenshot(path=str(OUT/f"summary_{W}.png"))
     # mail OFF, then back to step 1 and forward again: choices + cart persist
     await page.locator("#send-email").click(); await page.wait_for_timeout(200)
     check(await page.locator("#send-email").get_attribute("data-state") == "unchecked", f"{tag} mail switched OFF")
     await page.get_by_role("button", name="Zurück").click(); await page.wait_for_timeout(500)
     await page.get_by_role("button", name="Zurück").click(); await page.wait_for_timeout(800)
     check(await page.get_by_text("Warenkorb (2)").count() == 1, f"{tag} back in step 1: both positions kept")
     check(await page.get_by_role("radio", name="Snowboard", exact=False).first.get_attribute("data-state") == "on", f"{tag} active position still Snowboard")
     await page.screenshot(path=str(OUT/f"back_{W}.png"))
     await page.get_by_role("button", name="Weiter zum zahlungspflichtigen Kunden").click(); await page.wait_for_timeout(800)
     await page.get_by_role("button", name="Weiter zur Prüfung").click(); await page.wait_for_timeout(1500)
     check(await page.locator("#send-email").get_attribute("data-state") == "unchecked", f"{tag} mail OFF kept across navigation")
     q2 = [o for o in office if o["action"] == "quote"][-1]
     check(q2["items"] == req["items"] and q2["submission_key"] == req["submission_key"], f"{tag} same request + key after navigation")
     await page.get_by_test_id("office-quote-total").wait_for(timeout=8000)
     await page.get_by_text("Rechnung", exact=True).first.click(); await page.wait_for_timeout(800)
     await page.get_by_test_id("office-quote-total").wait_for(timeout=8000)
     btn = page.get_by_role("button", name="Buchung erstellen", exact=True)
     await btn.scroll_into_view_if_needed(); await btn.click(); await page.wait_for_timeout(1500)
     c = [o for o in office if o["action"] == "create"]
     check(len(c) == 1 and c[0]["confirmation_requested"] is False and c[0]["acknowledged_quote_digest"] == "a"*32, f"{tag} one create, mail OFF, bound to shown digest")
     check(len(c) == 1 and c[0]["items"] == req["items"], f"{tag} create = quoted cart")
     check(len(confirms) == 1, f"{tag} one B05 post-success call")
     check(await page.get_by_text("TEST-ONLY", exact=False).count() >= 1, f"{tag} success shown")
     check(not [x for x in single if (x[1] or {}).get("action") not in ("options", "blocks", "quote", None)], f"{tag} no single-item create ({[x[1] for x in single][:2]})")
     check(not [x for x in reqs if x.startswith(("POST","PATCH","DELETE","PUT")) and "/functions/" not in x and "/rpc/" not in x], f"{tag} no table writes")
     check(not errs, f"{tag} no runtime errors {errs[:2]}")
     await page.screenshot(path=str(OUT/f"success_{W}.png"))
     await ctx.close()
    await b.close()
    print("FAILURES:", len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
