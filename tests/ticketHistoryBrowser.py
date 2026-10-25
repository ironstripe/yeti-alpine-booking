"""B11: real TicketTimeline in the running app, REST intercepted (synthetic history, no writes)."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
T = "00000000-0000-4000-8000-0000000000aa"
H = [
  {"id": "h1", "ticket_id": T, "created_at": "2026-10-25T10:00:00Z", "created_by_user_id": None, "event_type": "PRIVATE_APPOINTMENT_CHANGED", "details": {"change": "created", "appointment_ids": ["a1", "a2"], "persons": 2, "unassigned": 1, "ticket_total_after_create": 190}},
  {"id": "h0", "ticket_id": T, "created_at": "2026-10-25T10:00:00Z", "created_by_user_id": None, "event_type": "BOOKING_CREATED", "details": {"ticket_number": "T-2026-1", "total_amount": 0, "actor_email": "office@example.invalid"}},
  {"id": "h2", "ticket_id": T, "created_at": "2026-10-25T11:00:00Z", "created_by_user_id": None, "event_type": "PRIVATE_APPOINTMENT_CHANGED", "details": {"change": "moved", "appointment_ids": ["a1"], "from": {"date": "2026-12-21", "time_start": "10:00", "time_end": "12:00", "instructor_id": None}, "to": {"date": "2026-12-22", "time_start": "10:00", "time_end": "12:00", "instructor_id": "t1"}}},
  {"id": "h3", "ticket_id": T, "created_at": "2026-10-25T12:00:00Z", "created_by_user_id": None, "event_type": "FUTURE_THING", "details": {"secret": "x@y"}},
]
async def main():
    out = Path("/tmp/browser/b11"); out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        for w, h in [(1280, 1800), (390, 800)]:
            page = await (await b.new_context(viewport={"width": w, "height": h})).new_page()
            writes = []
            async def route(r):
                u = r.request.url
                if "/rest/v1/" in u:
                    if r.request.method != "GET": writes.append(u); await r.abort(); return
                    body = H if "ticket_history" in u else []
                    await r.fulfill(content_type="application/json", body=json.dumps(body))
                elif "/auth/v1/" in u: await r.fulfill(content_type="application/json", body='{}')
                elif not u.startswith("http://localhost:8080"): await r.abort()
                elif u.endswith("/b11-fixture"): await r.fulfill(content_type="text/html", body='<html><body><div id="f"></div></body></html>')
                else: await r.continue_()
            await page.route("**/*", route)
            await page.goto("http://localhost:8080/b11-fixture")
            await page.evaluate("""async (T) => {
              const R = await import('/@react-refresh'); R.default.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>t=>t; window.__vite_plugin_react_preamble_installed__=true;
              await import('/src/index.css');
              const src = await (await fetch('/src/hooks/useTicketHistory.ts')).text();
              const rq = src.match(/from\\s+["']([^"']*@tanstack_react-query[^"']*)["']/)[1];
              const {default: React} = await import('/node_modules/.vite/deps/react.js');
              const {default: {createRoot}} = await import('/node_modules/.vite/deps/react-dom_client.js');
              const {QueryClient, QueryClientProvider} = await import(rq);
              const {TicketTimeline} = await import('/src/components/bookings/TicketTimeline.tsx');
              createRoot(document.getElementById('f')).render(React.createElement(QueryClientProvider, {client: new QueryClient()}, React.createElement(TicketTimeline, {ticketId: T})));
            }""", T)
            await page.wait_for_selector("text=Buchungsbetrag nach Anlage der Lektionen: CHF 190.00", timeout=8000)
            txt = await page.inner_text("#f")
            assert "Betrag bei Anlage des Tickets: CHF 0.00" in txt
            assert "Privatlektion verschoben" in txt and "Lehrperson zugewiesen" in txt
            assert "Ereignis (FUTURE_THING)" in txt and "x@y" not in txt
            assert "PRIVATE_APPOINTMENT_CHANGED" not in txt.replace("Ereignis (FUTURE_THING)", "")
            order = [txt.index(s) for s in ["FUTURE_THING", "verschoben", "nach Anlage der Lektionen", "Ticket T-2026-1"]]
            assert order == sorted(order), order  # newest first; creation below its same-time lesson event
            assert not writes
            await page.screenshot(path=str(out / f"timeline_{w}.png"))
            print(w, "ok")
        await b.close()
asyncio.run(main())
