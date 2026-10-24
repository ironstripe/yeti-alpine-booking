import asyncio,json,sys,statistics
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/scheduler-performance')
async def main():
 results=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for run in range(3):
   ctx=await browser.new_context(viewport={'width':1280,'height':1800});page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   async def route(r):
    if r.request.url=='http://localhost:8080/scheduler-fixture':await r.fulfill(content_type='text/html',body='<div id="fixture"></div>')
    elif r.request.url.startswith('http://localhost:8080'):await r.continue_()
    else:await r.fulfill(content_type='application/json',body='[]')
   await page.route('**/*',route);await page.goto('http://localhost:8080/scheduler-fixture');await page.evaluate((Path(__file__).with_name('schedulerPerformanceFixture.js')).read_text());await page.locator('[data-slot-time]').first.wait_for();await page.wait_for_timeout(500)
   initial=await page.evaluate('({slots:document.querySelectorAll("[data-slot-time]").length,dom:document.querySelectorAll("*").length,mount:window.samples[0],longtasks:window.longtasks})')
   await page.evaluate('window.samples=[];window.longtasks=[];window.startFrames()')
   await page.locator('#scroll').hover();
   for _ in range(20):await page.mouse.wheel(0,400);await page.wait_for_timeout(50)
   await page.wait_for_timeout(200)
   scroll=await page.evaluate('window.recordFrames=false;({slots:document.querySelectorAll("[data-slot-time]").length,dom:document.querySelectorAll("*").length,top:document.querySelector("#scroll").scrollTop,frames:window.frames,samples:window.samples,longtasks:window.longtasks})')
   await page.evaluate('document.querySelector("#scroll").scrollTop=0');await page.wait_for_timeout(200)
   await page.evaluate('window.samples=[];window.longtasks=[]')
   await page.locator('[data-instructor-id="teacher-1"][data-date="2026-12-24"][data-slot-time="09:00"]').click(modifiers=['Control']);await page.wait_for_timeout(200)
   selection=await page.evaluate('({selections:window.selection.state.selections.length,samples:window.samples,longtasks:window.longtasks})')
   results.append(dict(run=run,initial=initial,scroll=scroll,selection=selection,errors=errors));await page.screenshot(path=str(OUT/f'{sys.argv[1]}-{run}.png'));await ctx.close()
  await browser.close()
 (OUT/f'{sys.argv[1]}.json').write_text(json.dumps(results,indent=2))
 for r in results:
  fr=r['scroll']['frames'];print(json.dumps({'run':r['run'],'slots':r['initial']['slots'],'dom':r['initial']['dom'],'mount_ms':round(r['initial']['mount']['actual'],1),'scroll_frame_median':round(statistics.median(fr),1),'scroll_frame_max':round(max(fr),1),'scroll_long_tasks':len(r['scroll']['longtasks']),'scroll_render_ms':round(sum(s['actual'] for s in r['scroll']['samples']),1),'selection_render_ms':round(sum(s['actual'] for s in r['selection']['samples']),1),'selection':r['selection']['selections'],'errors':r['errors']}))
asyncio.run(main())
