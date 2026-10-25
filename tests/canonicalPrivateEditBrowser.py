"""B03a: real loadTicketForEditing + CanonicalPrivateEditPanel under BookingWizardProvider.
Synthetic data only; every backend request is intercepted, nothing reaches a real backend."""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/canonical-edit"); OUT.mkdir(parents=True, exist_ok=True)
T, A1, A2, P1, P2, P3 = "t-syn", "a-syn-1", "a-syn-2", "p-lea", "p-tom", "p-mia"
TICKET = {"id": T, "ticket_number": "TEST-ONLY-1", "customer_id": "c-syn", "total_amount": 105, "paid_amount": 0, "notes": "",
          "customer": {"id": "c-syn", "first_name": "Synth", "last_name": "Kunde", "email": None},
          "ticket_items": [
              {"id": "i1", "date": "2026-12-26", "time_start": "10:00:00", "time_end": "11:00:00", "instructor_id": "x1", "meeting_point": "sammelplatz_gorfion",
               "participant_id": None, "product_id": "prod", "unit_price": 105, "quantity": 1, "line_total": 105, "discount_percent": 0, "appointment_id": A1,
               "internal_notes": "lesson one", "instructor_notes": "teacher one", "product": {"id": "prod", "name": "Privat", "type": "private"}, "instructor": None, "participant": None},
              {"id": "i2", "date": "2026-12-27", "time_start": "13:00:00", "time_end": "15:00:00", "instructor_id": "x2", "meeting_point": "malbipark",
               "participant_id": None, "product_id": "prod", "unit_price": 160, "quantity": 1, "line_total": 144, "discount_percent": 10, "appointment_id": A2,
               "internal_notes": "lesson two", "instructor_notes": "teacher two", "product": {"id": "prod", "name": "Privat", "type": "private"}, "instructor": None, "participant": None}]}
LEGACY = {**TICKET, "id": "t-legacy", "ticket_items": [{**TICKET["ticket_items"][0], "id": "li", "appointment_id": None, "participant_id": P1,
          "participant": {"id": P1, "first_name": "Lea", "last_name": "S"}}]}
APPTS = [{"id": A1, "date": "2026-12-26", "time_start": "10:00:00", "time_end": "11:00:00", "instructor_id": "x1", "meeting_point": "sammelplatz_gorfion", "status": "booked", "price": 105},
         {"id": A2, "date": "2026-12-27", "time_start": "13:00:00", "time_end": "15:00:00", "instructor_id": "x2", "meeting_point": "malbipark", "status": "booked", "price": 160}]
LINKS = [{"appointment_id": A1, "participant_id": P1}, {"appointment_id": A1, "participant_id": P2}, {"appointment_id": A2, "participant_id": P3}]
PEOPLE = [{"id": P1, "first_name": "Lea", "last_name": "S"}, {"id": P2, "first_name": "Tom", "last_name": "S"}, {"id": P3, "first_name": "Mia", "last_name": "S"}]
INSTR = [{"id": "x1", "first_name": "Anna", "last_name": "Eins"}, {"id": "x2", "first_name": "Ben", "last_name": "Zwei"}]

FIXTURE = r"""async () => {
  const Refresh = await import('/@react-refresh'); Refresh.default.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t; window.__vite_plugin_react_preamble_installed__ = true;
  const src = '/src/components/bookings/wizard/CanonicalPrivateEditPanel.tsx';
  const dep = async (s, name) => (await (await fetch(s)).text()).match(new RegExp('from "([^"]*/' + name + '[^"]*)"'))[1];
  const {default: React} = await import(await dep(src, 'deps/react.js'));
  const {default: {createRoot}} = await import('/node_modules/.vite/deps/react-dom_client.js');
  const {MemoryRouter} = await import(await dep(src, 'react-router-dom'));
  const {QueryClient, QueryClientProvider} = await import(await dep(src, '@tanstack_react-query'));
  const W = await import(await dep(src, 'BookingWizardContext'));
  const {CanonicalPrivateEditPanel} = await import(src);
  await import('/src/index.css');
  const h = React.createElement;
  function Probe() {
    const w = W.useBookingWizard(); window.wiz = w;
    window.readback = {canonical: w.state.canonicalEdit, people: w.state.selectedParticipants.map(p => p.first_name), edit: w.state.isEditMode,
      paymentDueDate: w.state.paymentDueDate, discountPercent: w.state.discountPercent};
    return w.state.canonicalEdit ? h(CanonicalPrivateEditPanel, {key: w.state.canonicalEdit.ticketId, snapshot: w.state.canonicalEdit}) : h('p', null, 'kein kanonischer Edit');
  }
  const qc = new QueryClient({defaultOptions: {queries: {retry: false}}});
  createRoot(document.getElementById('fixture')).render(h(QueryClientProvider, {client: qc}, h(MemoryRouter, null, h(W.BookingWizardProvider, null, h(Probe)))));
}"""

fails = []
def check(cond, msg):
    print(("OK   " if cond else "FAIL ") + msg)
    if not cond: fails.append(msg)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width, height in [(1280, 1800), (390, 800)]:
            ctx = await browser.new_context(viewport={"width": width, "height": height})
            page = await ctx.new_page()
            errors, writes, sent = [], [], []
            mode = {"edit": "ok"}
            page.on("pageerror", lambda e: errors.append(str(e)))
            async def intercept(route):
                req = route.request; url = req.url
                if url == "http://localhost:8080/edit-fixture":
                    return await route.fulfill(content_type="text/html", body='<html><body><div id="fixture"></div></body></html>')
                if url.startswith("http://localhost:8080"): return await route.continue_()
                if "/functions/v1/private-appointments" in url and req.method == "POST":
                    b = req.post_data_json; sent.append(b)
                    if mode["edit"] == "stale":
                        return await route.fulfill(status=409, content_type="application/json", body=json.dumps({"error":"conflict", "conflicts":[{"kind":"stale","ref_id":A1}]}))
                    if mode["edit"] == "old":
                        return await route.fulfill(status=400, content_type="application/json", body=json.dumps({"error": "invalid", "fields": {"action": ["Invalid discriminator value"]}}))
                    q = {"appointments": [{"appointment_id": A1, "old_price": 105, "new_price": 125, "participants_changed": True}], "old_total": 249, "new_total": 269, "changed": True}
                    return await route.fulfill(content_type="application/json", body=json.dumps({"quote": q} if b.get("mode") == "quote" else {"changed": True, "quote": q, "total": 269}))
                if req.method not in ("GET", "HEAD", "OPTIONS"): writes.append(f"{req.method} {url}"); return await route.abort()
                if "/rest/v1/tickets" in url: body = LEGACY if "t-legacy" in url else TICKET
                elif "/rest/v1/private_appointments" in url: body = APPTS
                elif "/rest/v1/private_appointment_participants" in url: body = LINKS
                elif "/rest/v1/customer_participants" in url: body = PEOPLE
                elif "/rest/v1/instructors" in url: body = INSTR
                else: body = []
                await route.fulfill(content_type="application/json", body=json.dumps(body))
            await page.route("**/*", intercept)
            await page.goto("http://localhost:8080/edit-fixture")
            await page.evaluate(FIXTURE)
            tag = f"[{width}]"
            await page.evaluate("window.wiz.loadTicketForEditing('t-syn')")
            panel = page.get_by_test_id("canonical-private-edit"); await panel.wait_for()
            r = await page.evaluate("window.readback")
            check(sorted(r["people"]) == ["Lea", "Mia", "Tom"], f"{tag} names hydrated from canonical links")
            check(r["canonical"]["appointments"][0]["participantIds"] == sorted([P1, P2]) and r["canonical"]["appointments"][1]["participantIds"] == [P3], f"{tag} per-appointment people")
            check([a["instructorName"] for a in r["canonical"]["appointments"]] == ["Anna Eins", "Ben Zwei"], f"{tag} per-date teachers")
            check(await page.get_by_test_id(f"appointment-{A1}").get_by_text("2 Person(en) · CHF 105.00").count() == 1, f"{tag} shows 2 people / CHF 105 stored")
            check(await page.get_by_text("−10% Rabatt bleibt").count() == 1, f"{tag} stored discount shown")
            check(r["paymentDueDate"] is None and r["discountPercent"] == 0, f"{tag} no checkout finance defaults carried")
            await page.screenshot(path=str(OUT / f"panel_{width}.png"))

            check(await page.locator(f"#ce-int-{A1}").input_value() == "lesson one" and await page.locator(f"#ce-int-{A2}").input_value() == "lesson two", f"{tag} separate lesson notes hydrated")
            # Unchanged save: no request at all.
            await page.get_by_role("button", name="Änderungen speichern").click(); await page.wait_for_timeout(200)
            check(sent == [], f"{tag} unchanged save sends nothing")
            check((await page.evaluate("window.readback"))["canonical"] is None, f"{tag} save/leave resets wizard state")

            # Add a person: needs server quote, then explicit acknowledgement.
            await page.evaluate("window.wiz.loadTicketForEditing('t-syn')"); await panel.wait_for()
            await page.get_by_label(f"Mia S für 2026-12-26").click()
            check(await page.get_by_role("button", name="Änderungen speichern").count() == 0, f"{tag} save hidden until price checked")
            await page.get_by_role("button", name="Neuen Preis prüfen").click()
            await page.get_by_test_id("price-change").wait_for()
            check(sent[-1]["mode"] == "quote" and sent[-1]["action"] == "edit", f"{tag} quote request")
            check(await page.get_by_text("CHF 269.00").count() >= 1, f"{tag} new total shown before saving")
            await page.screenshot(path=str(OUT / f"quote_{width}.png"))
            await page.get_by_role("button", name="Änderungen speichern").click(); await page.wait_for_timeout(300)
            a = sent[-1]
            check(a["mode"] == "apply" and a["acknowledged_total"] == 269 and a["expected_total"] == 105, f"{tag} apply acknowledges quoted total")
            check(len(a["appointments"]) == 1 and a["appointments"][0]["appointment_id"] == A1 and a["appointments"][0]["acknowledged_price"] == 125
                  and sorted(a["appointments"][0]["participant_ids"]) == sorted([P1, P2, P3]), f"{tag} only explicitly changed appointment sent")
            original=a["appointments"][0]["expected"]
            check(original["date"] == "2026-12-26" and original["time_start"] == "10:00:00" and original["instructor_id"] == "x1" and original["line"]["internal_notes"] == "lesson one", f"{tag} original schedule/notes/line payload")
            check(not any(k in a for k in ("payment_method", "payment_due_date", "discount_percent")), f"{tag} no finance fields in edit payload")

            # Notes-only: one apply, no quote, no participants.
            n0 = len(sent)
            await page.evaluate("window.wiz.loadTicketForEditing('t-syn')"); await panel.wait_for()
            await page.locator(f"#ce-int-{A1}").fill("Synthetische Notiz")
            await page.get_by_role("button", name="Änderungen speichern").click(); await page.wait_for_timeout(300)
            check(len(sent) == n0 + 1 and sent[-1]["mode"] == "apply" and len(sent[-1]["appointments"]) == 1 and sent[-1]["appointments"][0]["internal_notes"] == "Synthetische Notiz", f"{tag} notes-only single apply")

            check(sent[-1]["appointments"][0]["expected"]["line"]["internal_notes"] == "lesson one" and not any(x["appointment_id"] == A2 for x in sent[-1]["appointments"]), f"{tag} note edit carries original and leaves other lesson out")
            # Real controls send ticket-note original too, then surface stale rejection (no fallback).
            mode["edit"] = "stale"
            await page.evaluate("window.wiz.loadTicketForEditing('t-syn')"); await panel.wait_for()
            await page.locator("#ce-cust").fill("my customer note")
            await page.get_by_role("button", name="Änderungen speichern").click()
            await page.get_by_role("alert").wait_for()
            check(sent[-1]["expected_customer_notes"] is None and sent[-1]["customer_notes"] == "my customer note", f"{tag} customer note original supplied")
            check("inzwischen geändert" in await page.get_by_role("alert").inner_text() and (await page.evaluate("window.readback"))["canonical"] is not None, f"{tag} stale rejected and edit retained")
            await page.get_by_role("alert").screenshot(path=str(OUT / f"stale_{width}.png"))
            # Old deployed function: clear unavailability, no fallback.
            mode["edit"] = "old"
            await page.evaluate("window.wiz.loadTicketForEditing('t-syn')"); await panel.wait_for()
            await page.locator(f"#ce-ins-{A1}").fill("x")
            await page.get_by_role("button", name="Änderungen speichern").click()
            await page.get_by_role("alert").wait_for()
            check("noch nicht freigeschaltet" in (await page.get_by_role("alert").inner_text()), f"{tag} unavailable message")
            mode["edit"] = "ok"

            # Switching to a legacy ticket clears canonical data.
            await page.evaluate("window.wiz.loadTicketForEditing('t-legacy')"); await page.wait_for_timeout(200)
            r = await page.evaluate("window.readback")
            check(r["canonical"] is None and r["people"] == ["Lea"], f"{tag} legacy ticket switch clears canonical edit")
            check(writes == [], f"{tag} no direct table writes ({writes})")
            check(errors == [], f"{tag} no page errors ({errors[:2]})")
            await ctx.close()
        await browser.close()
    print(f"{'FAILED' if fails else 'PASSED'}: {len(fails)} failures")
    sys.exit(1 if fails else 0)

asyncio.run(main())
