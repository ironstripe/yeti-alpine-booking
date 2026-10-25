import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/b05-detail');OUT.mkdir(parents=True,exist_ok=True)
T='synthetic-ticket'
people=[{'id':'p','first_name':'Lea','last_name':'<S>'},{'id':'q','first_name':'Tom','last_name':'S'},{'id':'r','first_name':'Mia','last_name':'S'}]
appts=[{'id':'a','date':'2026-12-26','time_start':'10:00:00','time_end':'11:00:00','instructor_id':'t','meeting_point':'Park'}, {'id':'b','date':'2026-12-27','time_start':'14:00:00','time_end':'16:00:00','instructor_id':'u','meeting_point':'Dorf'}]
base={'id':'i','appointment_id':'a','date':'2026-12-26','time_start':'10:00','time_end':'11:00','instructor_id':'t','participant_id':None,'participant':None,'instructor':None,'line_total':105,'unit_price':105,'internal_notes':None,'instructor_notes':None,'meeting_point':'Park','product':{'id':'prod','name':'Privat','type':'private'},'item_type':'private'}
items=[base,{**base,'id':'j','appointment_id':'b','date':'2026-12-27','line_total':0,'unit_price':160}, {**base,'id':'g','appointment_id':None,'participant':people[2],'item_type':'group','line_total':200,'product':{'id':'group','name':'Ganztageskurs','type':'group'},'enrollments':[{'instance':{'date':'2026-12-26','start_time':'10:00','end_time':'12:00'}},{'instance':{'date':'2026-12-26','start_time':'14:00','end_time':'16:00'}}]}, {**base,'id':'l','appointment_id':None,'participant':people[2],'item_type':'lunch','line_total':30,'product':{'id':'lunch','name':'Mittag','type':'lunch'}}]
ticket={'id':T,'ticket_number':'TEST-ONLY-B03B','customer_id':'c','total_amount':335,'paid_amount':0,'status':'confirmed','created_at':'2026-10-25T10:00:00Z','customer':{'id':'c','first_name':'Synth','last_name':'Kunde','email':'synthetic@example.invalid'},'items':items}
FIXTURE=r'''async () => {
 const Refresh=await import('/@react-refresh');Refresh.default.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
 const src='/src/pages/BookingDetail.tsx';const dep=async(name)=>(await(await fetch(src)).text()).match(new RegExp('from "([^"]*/'+name+'[^"]*)"'))[1];
 const {default:React}=await import(await dep('deps/react.js'));const {default:{createRoot}}=await import('/node_modules/.vite/deps/react-dom_client.js');
 const {MemoryRouter,Routes,Route}=await import(await dep('react-router-dom'));const {QueryClient,QueryClientProvider}=await import(await dep('@tanstack_react-query'));const {default:Detail}=await import(src);await import('/src/index.css');
 const h=React.createElement;const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});window.qc=qc;
 createRoot(document.getElementById('fixture')).render(h(QueryClientProvider,{client:qc},h(MemoryRouter,{initialEntries:['/bookings/synthetic-ticket']},h(Routes,null,h(Route,{path:'/bookings/:id',element:h(Detail)})))));
}'''
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width,height in [(1280,1800),(390,800)]:
   ctx=await browser.new_context(viewport={'width':width,'height':height});page=await ctx.new_page();writes=[];errors=[];reads=[];mode={'error':False,'delivery':'not_requested'};confirmation_requests=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   async def route(r):
    req=r.request;url=req.url
    if url=='http://localhost:8080/b03b-fixture':return await r.fulfill(content_type='text/html',body='<html><body><div id="fixture"></div></body></html>')
    if url.startswith('http://localhost:8080'):return await r.continue_()
    if '/functions/v1/staff-booking-confirmation' in url:
     data=req.post_data_json;confirmation_requests.append(data);assert data['ticket_id']==T and set(data)=={'ticket_id','action'}
     if data['action']=='send':mode['delivery']='failed'
     return await r.fulfill(content_type='application/json',body=json.dumps({'success':False,'outcome':mode['delivery']}))
    if '/rest/v1/rpc/instructors_ops_list' in url:return await r.fulfill(content_type='application/json',body='[]')
    if req.method not in ('GET','HEAD','OPTIONS'):writes.append(req.method+' '+url);return await r.abort()
    if '/rest/v1/' in url:
     table=url.split('/rest/v1/')[1].split('?')[0];reads.append(table)
     if table=='tickets':data=ticket
     elif table=='private_appointments':data=appts
     elif table=='private_appointment_participants':
      if mode['error']:return await r.fulfill(status=500,content_type='application/json',body='{"message":"synthetic participant read error"}')
      data=[{'appointment_id':'a','participant_id':'p'},{'appointment_id':'a','participant_id':'q'},{'appointment_id':'b','participant_id':'r'}]
     elif table=='customer_participants':data=people
     elif table=='invoices':data=[{'id':'inv','invoice_number':'SYN-HISTORICAL','ticket_id':T,'subtotal':335,'discount':0,'total':335,'currency':'CHF','invoice_date':'2026-10-20','due_date':'2026-12-20','created_at':'2026-10-20T10:00:00Z','status':'open','is_legacy_payment':True,'payment_snapshot':None}]
     elif table=='school_settings':data=[{'id':'school','name':'Synthetic School','country':'LI'}]
     elif table=='instructors':data=[{'id':'t','first_name':'Anna','last_name':'Eins','status':'active'},{'id':'u','first_name':'Ben','last_name':'Zwei','status':'active'}]
     else:data=[]
    else:data=[]
    await r.fulfill(content_type='application/json',body=json.dumps(data))
   await page.route('**/*',route);await page.goto('http://localhost:8080/b03b-fixture');await page.evaluate(FIXTURE)
   await page.get_by_text('Lea <S>, Tom S - Privat',exact=True).wait_for()
   assert await page.get_by_text('26.12.2026 · 10:00 - 11:00',exact=True).count()==1
   assert await page.get_by_text('27.12.2026 · 14:00 - 16:00',exact=True).count()==1
   assert await page.get_by_text('Anna Eins',exact=True).count()==1 and await page.get_by_text('Ben Zwei',exact=True).count()==1
   assert await page.get_by_text('CHF 0.00',exact=True).count()==2 # paid header plus free line
   assert await page.get_by_test_id('package-schedule').get_by_text('Sa. 26.12.2026 · 10:00–12:00, 14:00–16:00',exact=True).count()==1
   assert reads.count('private_appointment_participants')==1 and reads.count('private_appointments')==1
   assert await page.locator('s').count()==0
   invoice_before=await page.locator('div.hidden').last.inner_html()
   await page.get_by_role('button',name='Anzeigen',exact=True).click();await page.get_by_role('dialog').wait_for()
   invoice_dialog=await page.get_by_role('dialog').inner_text();assert 'SYN-HISTORICAL' in invoice_dialog and 'Lea <S>, Tom S' not in invoice_dialog
   await page.get_by_role('button',name='Schliessen',exact=True).click()
   await page.screenshot(path=str(OUT/f'detail_{width}.png'))
   await page.get_by_role('button',name='Bestätigung senden',exact=True).click()
   await page.get_by_role('button',name='Bestätigung erneut versuchen',exact=True).wait_for()
   await page.get_by_role('button',name='Bestätigung erneut versuchen',exact=True).click()
   await page.screenshot(path=str(OUT/f'confirmation_failed_{width}.png'))
   assert [x['action'] for x in confirmation_requests].count('send')==2
   assert all(x['action'] in ['status','send'] for x in confirmation_requests)
   mode['error']=True;await page.evaluate("window.qc.invalidateQueries({queryKey:['booking-read-projection']})")
   await page.get_by_text('Teilnehmerdaten nicht verfügbar',exact=False).first.wait_for()
   assert await page.get_by_role('alert').count()>=2
   assert await page.locator('div.hidden').last.inner_html()==invoice_before
   await page.screenshot(path=str(OUT/f'error_{width}.png'))
   assert not writes and not errors,(writes,errors)
   print(f'PASS {width}: production BookingDetail, names/lesson/time/teacher/zero/group/lunch/error/escaping/batch/no writes')
   await ctx.close()
  await browser.close()
asyncio.run(main())
