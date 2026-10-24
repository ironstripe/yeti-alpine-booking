import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/scheduler-performance');checks=[]
def check(value,label):
 checks.append((bool(value),label));print(('OK ' if value else 'FAIL ')+label)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  ctx=await browser.new_context(viewport={'width':1280,'height':1800});page=await ctx.new_page();errors=[];external=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   u=r.request.url
   if u=='http://localhost:8080/scheduler-fixture':await r.fulfill(content_type='text/html',body='<div id="fixture"></div>')
   elif u.startswith('http://localhost:8080'):await r.continue_()
   else:external.append({'method':r.request.method,'read_rpc':any('/rpc/'+name in u for name in ['instructors_ops_list','check_recurring_block_conflicts']),'path':u.split('/rest/v1/')[-1].split('?')[0]});await r.fulfill(content_type='application/json',body='[]')
  await page.route('**/*',route);await page.goto('http://localhost:8080/scheduler-fixture');await page.evaluate((Path(__file__).with_name('schedulerPerformanceFixture.js')).read_text());await page.wait_for_timeout(700)
  check(await page.locator('[data-teacher-block]').count()==98,'98 shells retained, only nearby slot trees mounted')
  check(await page.locator('[data-slot-time]').count()<600,'week slot DOM reduction')
  check(await page.locator('[data-instructor-id="teacher-90"]').count()==0,'offscreen teacher initially unmounted')
  await page.evaluate('window.controls.search("teacher-90")');await page.wait_for_timeout(500)
  check(await page.locator('[data-instructor-id="teacher-90"]').count()==49,'offscreen search mounts all 7 days')
  check(await page.locator('[data-teacher-block="teacher-90"] .ring-primary').count()==1,'search highlight visible')
  check(await page.evaluate('document.querySelector("#scroll").scrollTop>18000'),'search scrolls to teacher')
  await page.locator('[data-instructor-id="teacher-90"][data-date="2026-12-24"][data-slot-time="09:00"]').click(modifiers=['Control']);await page.wait_for_timeout(150)
  await page.evaluate('window.controls.search("teacher-1")');await page.wait_for_timeout(400)
  await page.locator('[data-instructor-id="teacher-1"][data-date="2026-12-25"][data-slot-time="13:00"]').click(modifiers=['Meta']);await page.wait_for_timeout(150)
  check(await page.evaluate('window.selection.state.selections.length')==2,'Ctrl/Cmd selections across virtualized boundaries retained')
  await page.evaluate('window.controls.setShown(false)');await page.wait_for_timeout(100);await page.evaluate('window.controls.setShown(true)');await page.wait_for_timeout(400)
  check(await page.evaluate('window.selection.state.selections.length')==2,'provider-retained wizard/back remount retains selections')
  check(await page.evaluate('JSON.parse(sessionStorage.getItem("yeti.scheduler.planningDraft.v1")).selections.length')==2,'sessionStorage draft contains offscreen selections')
  await page.evaluate('window.selection.clearSelection();window.controls.search("teacher-1")');await page.wait_for_timeout(300)
  # Shift range through all dates, using production cell handler and context
  slot=lambda date,time:page.locator(f'[data-instructor-id="teacher-1"][data-date="{date}"][data-slot-time="{time}"]')
  await slot('2026-12-24','09:00').click(modifiers=['Control']);await slot('2026-12-26','09:00').click(modifiers=['Shift']);await page.wait_for_timeout(150)
  check(await page.evaluate('window.selection.state.selections.map(s=>s.date).sort()')==['2026-12-24','2026-12-25','2026-12-26'],'shift selection keeps actual three-day range')
  # Geometry across views and container/column resize
  await page.evaluate('window.selection.clearSelection();window.controls.setDays(1);window.controls.search("teacher-90")');await page.wait_for_timeout(500)
  check(await page.locator('[data-instructor-id="teacher-90"]').count()==7,'day view offscreen teacher mounts')
  heights=[]
  for days in [1,3,7]:
   await page.evaluate(f'window.controls.setDays({days});window.controls.search("teacher-90")');await page.wait_for_timeout(400)
   h=await page.locator('[data-teacher-block="teacher-90"]').bounding_box();heights.append(h['height']);check(abs(h['height']-({1:41,3:100,7:232}[days]))<1,f'{days}-day measured row height')
   check(await page.locator('[data-instructor-id="teacher-90"]').count()==7*days,f'{days}-day visible cells')
  await page.evaluate('window.controls.setWidth(200);document.querySelector("#shell").style.height="500px"');await page.wait_for_timeout(300)
  check(await page.evaluate('document.querySelector("[data-teacher-block=teacher-90]").getBoundingClientRect().height')==232,'column/container resize preserves week height')
  await page.set_viewport_size({'width':1100,'height':760});await page.wait_for_timeout(300)
  check(await page.locator('[data-slot-time]').count()>0,'viewport resize retains visible targets')
  await page.set_viewport_size({'width':1280,'height':1800});await page.evaluate('document.querySelector("#shell").style.height="900px";window.controls.setWidth(112);window.controls.search("teacher-1")');await page.wait_for_timeout(400)
  # Filter and sorting preserve all shells intended by existing logic
  await page.evaluate('window.controls.setRole("office")');await page.wait_for_timeout(250)
  check(await page.locator('[data-teacher-block]').count()==10,'role filter unchanged')
  await page.evaluate('window.controls.setRole(null);window.controls.setCompact(true)');await page.wait_for_timeout(250)
  check(await page.locator('[data-teacher-block]').count()==98,'compact keeps every teacher with activity')
  await page.evaluate('window.controls.setCompact(false);window.controls.setCapability("snowboard");window.controls.setPlanning(true);window.controls.setReverse(true)');await page.wait_for_timeout(250)
  check(await page.locator('[data-teacher-block]').first.get_attribute('data-teacher-block')=='teacher-97','sort order preserved')
  check(await page.locator('[data-teacher-block]').count()==98,'capability/planning dims rather than hides rows')
  await page.evaluate('window.controls.setReverse(false);window.controls.setCapability(null);window.controls.setPlanning(false);window.controls.search("teacher-1")');await page.wait_for_timeout(400)
  # Mouse DnD with source kept mounted after distant scroll
  bar=page.locator('[data-teacher-block="teacher-1"] [role="button"]').filter(has_text='Synthetic 1').first
  box=await bar.bounding_box();await page.mouse.move(box['x']+20,box['y']+10);await page.mouse.down();await page.mouse.move(box['x']+40,box['y']+10,steps=3);await page.wait_for_timeout(100)
  await page.evaluate('document.querySelector("[data-teacher-block=teacher-90]").scrollIntoView({block:"center"})');await page.wait_for_timeout(300)
  check(await page.locator('[data-teacher-block="teacher-1"] [role="button"]').count()==1,'active DnD source stays mounted offscreen')
  target=page.locator('[data-instructor-id="teacher-90"][data-date="2026-12-24"][data-slot-time="13:00"]');b=await target.bounding_box();await page.mouse.move(b['x']+30,b['y']+15,steps=6);await page.wait_for_timeout(100);await page.mouse.up();await page.wait_for_timeout(250)
  drop=await page.evaluate('window.lastDrop');check(drop and drop[1:]==['teacher-90','2026-12-24','13:00'],'cross-viewport mouse drop reaches mounted target, mock only')
  # Keyboard sensor is configured with pointerWithin; baseline has no pointer-free collision.
  await page.evaluate('window.controls.search("teacher-1")');await page.wait_for_timeout(300)
  await bar.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.wait_for_timeout(100)
  check(await page.locator('[data-teacher-block="teacher-1"] .invisible').count()==1,'keyboard sensor activates drag and source remains mounted')
  await page.keyboard.press('Escape');await page.wait_for_timeout(150)
  check(await page.locator('[data-teacher-block="teacher-1"] .invisible').count()==0,'keyboard Escape cancels without move')
  # Resize production overlay; booking/absence checks still use full instructor data.
  await page.evaluate('window.selection.clearSelection()');await page.wait_for_timeout(100)
  await slot('2026-12-24','13:00').click(modifiers=['Control']);await page.wait_for_timeout(150)
  handle=page.locator('[data-teacher-block="teacher-1"] .cursor-ew-resize');b=await handle.bounding_box()
  await handle.dispatch_event('mousedown',{'clientX':b['x']+5,'clientY':b['y']+10,'button':0});await page.mouse.move(b['x']+105,b['y']+20,steps=5);await page.mouse.up();await page.wait_for_timeout(150)
  check(await page.evaluate('window.selection.state.selections[0].durationMinutes')==60,'existing resize self-overlap guard retains original 60 minutes (unchanged limitation)')
  # Pin selection drag source across an offscreen boundary without altering its draft.
  await page.evaluate('window.selection.clearSelection();window.selection.startDrag("teacher-1","2026-12-24","09:00")');await page.wait_for_timeout(100)
  await page.evaluate('document.querySelector("[data-teacher-block=teacher-80]").scrollIntoView()');await page.wait_for_timeout(250)
  check(await page.locator('[data-instructor-id="teacher-1"]').count()==49,'multi-day selection drag source pinned across scroll')
  await page.evaluate('window.selection.updateDrag("10:00",false,"2026-12-25");window.selection.endDrag([],[])');await page.wait_for_timeout(150)
  check(await page.evaluate('window.selection.state.selections.map(s=>[s.date,s.durationMinutes])')==[['2026-12-24',120],['2026-12-25',120]],'production multi-day drag commits both dates')
  await page.screenshot(path=str(OUT/'regression-desktop.png'))
  await page.set_viewport_size({'width':390,'height':700});await page.evaluate('window.selection.clearSelection();window.controls.setMobile(true)');await page.wait_for_timeout(350)
  check(await page.locator('section').count()==98,'mobile agenda retains all 98 sections')
  await page.get_by_role('button',name='09:00–10:00 Frei').first.click();await page.wait_for_timeout(100)
  check(await page.evaluate('window.mobileTap.startTime')=='09:00','mobile free interval callback unchanged')
  await page.screenshot(path=str(OUT/'regression-mobile.png'))
  check(not errors,'no runtime errors');check(all(m['method'] in ['GET','HEAD','OPTIONS'] or m['read_rpc'] for m in external),'no external business writes')
  await browser.close()
 if not all(v for v,_ in checks):sys.exit(1)
 print(f'{len(checks)} checks passed')
asyncio.run(main())
