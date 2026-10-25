import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/scheduler-filters');OUT.mkdir(parents=True,exist_ok=True); checks=[]
def check(value,label):
 checks.append(bool(value)); print(('OK ' if value else 'FAIL ')+label)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);ctx=await browser.new_context(viewport={'width':1280,'height':1800});page=await ctx.new_page();errors=[];writes=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  teachers=[dict(id='teacher-'+str(i),first_name='Lehrer'+str(i).zfill(2),last_name='Synthetisch',status='active',real_time_status='on_call' if i==4 else 'available',roles=['office'] if i==5 else ['ski'],specialization='ski',languages=['de'],role='office_staff' if i==5 else 'teacher') for i in range(98)]
  absences=[dict(id='absence-'+str(i),instructor_id='teacher-'+str(i),start_date='2026-12-21',end_date='2026-12-27' if i!=2 else '2026-12-21',status='confirmed',type='vacation',is_full_day=True) for i in [0,2,3,4,5]]
  offices=[dict(id='office',instructor_id='teacher-5',date='2026-12-23',time_start='10:00',time_end='12:00',note='Synthetic office')]
  groups=[dict(id='group',instructor_id='teacher-3',date='2026-12-23',start_time='10:00',end_time='12:00',course_id='course',current_participants=2,status='scheduled',group_courses=dict(name='Synthetic group',color='blue',max_participants=8,meeting_point=None))]
  async def route(r):
   u=r.request.url
   if u=='http://localhost:8080/scheduler-filter-fixture':return await r.fulfill(content_type='text/html',body='<div id="fixture"></div>')
   if u.startswith('http://localhost:8080'):return await r.continue_()
   data=[]
   if '/rpc/instructors_ops_list' in u:data=teachers
   elif '/instructor_absences?' in u:data=absences
   elif '/office_hour_blocks?' in u:data=offices
   elif '/group_course_instances?' in u:data=groups
   if r.request.method not in ['GET','HEAD','OPTIONS'] and '/rpc/instructors_ops_list' not in u and '/rpc/instructor_deployment_gates' not in u and '/rpc/check_recurring_block_conflicts' not in u:writes.append(u.split('?')[0])
   await r.fulfill(content_type='application/json',body=json.dumps(data))
  await page.route('**/*',route);await page.goto('http://localhost:8080/scheduler-filter-fixture');await page.evaluate(Path(__file__).with_name('schedulerFiltersFixture.js').read_text());await page.wait_for_timeout(1500)
  rows=page.locator('[data-teacher-block]');toggle=page.get_by_role('switch',name='Abwesende ausblenden')
  check(await rows.count()==98,'default all active teachers');check(await toggle.get_attribute('aria-checked')=='false','absence default off')
  await page.get_by_role('radio',name='Woche',exact=True).click();await page.wait_for_timeout(350)
  await toggle.click();await page.wait_for_timeout(300)
  check(await rows.count()==97,'week hides only full absence with no work');check(await page.locator('[data-teacher-block="teacher-2"]').count()==1,'partial week remains');check(await page.locator('[data-teacher-block="teacher-3"]').count()==1,'group assignment protects');check(await page.locator('[data-teacher-block="teacher-5"]').count()==1,'office assignment protects');check(await page.locator('[aria-label="Auf Abruf"]').count()>0,'on-call labelled')
  await page.get_by_role('radio',name='Privat',exact=True).click();await page.wait_for_timeout(200);check(await rows.count()==97,'hidden booking type still protects assignments')
  async def select(name):
   await page.get_by_role('combobox').first.click();await page.get_by_placeholder('Lehrperson filtern...').fill(name);await page.get_by_role('option',name=name+' Synthetisch').click();await page.wait_for_timeout(250)
  await select('Lehrer00');check(await rows.count()==1 and await rows.first.get_attribute('data-teacher-block')=='teacher-0','explicit absent teacher inspectable');check(await toggle.is_disabled(),'hide toggle disabled for single teacher')
  await page.get_by_role('radio',name='3T',exact=True).click();await page.get_by_role('button',name='Nächster Tag',exact=True).click();await page.wait_for_timeout(250);check(await rows.count()==1,'date/view retains single teacher')
  await page.get_by_role('button',name='Lehrpersonenauswahl zurücksetzen').click();await page.wait_for_timeout(250);check(await rows.count()==97,'reset restores compatible all mode')
  await page.get_by_role('button',name='Scheduler durchsuchen').click();await page.get_by_placeholder('Lehrer, Kunde oder Buchung suchen...').fill('Lehrer90');await page.get_by_role('option').filter(has_text='Lehrer90').click();await page.wait_for_timeout(600)
  check(await rows.count()==98,'universal search clears hiding but does not single-filter');check(await page.locator('[data-teacher-block="teacher-90"] .ring-primary').count()==1,'offscreen search mounts/highlights');check(await page.locator('[data-instructor-id="teacher-90"]').count()==21,'3day offscreen slot tree mounted')
  slot=page.locator('[data-instructor-id="teacher-90"][data-date="2026-12-22"][data-slot-time="09:00"]');await slot.click(modifiers=['Control']);await page.wait_for_timeout(150)
  before=await page.evaluate('sessionStorage.getItem("yeti.scheduler.planningDraft.v1")');check(before and len(json.loads(before)['selections'])==1,'real slot selection draft created')
  await select('Lehrer01');await toggle.evaluate('(e)=>e.disabled');await page.get_by_role('button',name='Lehrpersonenauswahl zurücksetzen').click();await page.wait_for_timeout(200);check(await page.evaluate('sessionStorage.getItem("yeti.scheduler.planningDraft.v1")')==before,'draft survives single teacher/reset')
  await page.get_by_role('button',name='Scheduler-Einstellungen öffnen',exact=True).click();await page.get_by_role('menuitemcheckbox',name='Kompaktansicht').click();await page.wait_for_timeout(200)
  await select('Lehrer01');check(await rows.count()==1,'single teacher bypasses active compact mode');await page.get_by_role('button',name='Lehrpersonenauswahl zurücksetzen').click();await page.wait_for_timeout(200);check(await rows.count()==5,'reset restores compact preference')
  await page.get_by_role('button',name='Scheduler-Einstellungen öffnen, 1 aktive Filter').click();await page.get_by_role('menuitemcheckbox',name='Kompaktansicht').click();await page.wait_for_timeout(150)
  check(await page.locator('[data-slot-time]').count()<900,'performance wrappers still reduce 98-teacher 3day cell trees')
  await page.get_by_role('button',name='Abwesenheitsfilter erklären').click();await page.screenshot(path=str(OUT/'desktop.png'));await page.keyboard.press('Escape')
  await page.set_viewport_size({'width':390,'height':800});await page.wait_for_timeout(350);await toggle.click();await page.wait_for_timeout(250)
  sections=page.locator('[data-agenda-teacher]');check(await sections.count()==95,'mobile actual date hides teacher2 but protects assignments only on actual day')
  await select('Lehrer00');check(await sections.count()==1,'mobile absent single teacher visible');await page.screenshot(path=str(OUT/'mobile.png'))
  await page.get_by_role('button',name='Lehrpersonenauswahl zurücksetzen').click();await page.get_by_role('button',name='Nächster Tag',exact=True).click();await page.wait_for_timeout(300);check(await sections.count()==97,'mobile next day actual range applies')
  check(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'mobile controls fit viewport');teachers[:]=[teachers[0]];await page.evaluate('window.fixtureQc.invalidateQueries({queryKey:["scheduler-instructors"]})');await page.wait_for_timeout(400)
  check(await sections.count()==0 and await page.get_by_text('Keine Lehrpersonen für die aktuellen Filter.',exact=True).count()==1,'absence-only empty state with real grid wiring')
  await page.get_by_role('button',name='Ansichtsfilter zurücksetzen').click();await page.wait_for_timeout(200);check(await sections.count()==1,'empty-state reset restores teacher')
  check(not errors,'no runtime errors');check(not writes,'no attempted business writes');print('ERRORS',errors);print('BLOCKED_PATHS',writes);await browser.close()
 if not all(checks):sys.exit(1)
 print(str(len(checks))+' checks passed')
asyncio.run(main())
