"""Actual modal + offering hook, synthetic in-memory endpoint, blocked external network.
Run: python3 tests/productOfferingDisplayText.py. No production data or requests.
"""
import asyncio
import json
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
from playwright.async_api import async_playwright
import productModalScroll as harness

ROOT = harness.ROOT
OUTPUT = Path('/tmp/browser/product-offering-display-text')
OUTPUT.mkdir(parents=True, exist_ok=True)
MOCKS = '\n'.join(line for line in harness.MOCKS.splitlines() if not line.startswith(('export const useProductPublicOffering', 'export const useSaveProductPublicOffering'))).replace('export const useSavePrivateProductTariffs = useSaveProductPublicOffering;', "export const useSavePrivateProductTariffs = () => ({mutateAsync:()=>{throw new Error('Private save forbidden')}});")
CLIENT = """
import {validateOffering,normalizeScheduleText} from '@/lib/productPublicOffering';
let stored={schedule_kind:'weekly',weekdays:[3],dates:[],time_blocks:[{start:'10:00',end:'12:00'},{start:'14:00',end:'16:00'}],display_schedule_text:null};
window.fixture={saves:[],get stored(){return stored;}};
export const supabase={from:(table)=>{if(table!=='product_public_offerings')throw Error('Unexpected table');return {select:()=>({eq:()=>({maybeSingle:async()=>({data:structuredClone(stored),error:null})})})};},functions:{invoke:async(name,{body})=>{
if(name!=='product-public-offering')throw Error('Unexpected function');
const error=validateOffering(body.offering,{type:'group',duration_minutes:240,season:{start_date:'2026-12-01',end_date:'2027-04-01'}});
if(error)return {data:{error},error:null};
stored={...body.offering,display_schedule_text:normalizeScheduleText(body.offering.display_schedule_text)};
window.fixture.saves.push(structuredClone(body));return {data:{offering:structuredClone(stored)},error:null};}}};
"""
ENTRY = harness.ENTRY.replace("createRoot(document.getElementById('root')).render", "import {QueryClient,QueryClientProvider} from '@tanstack/react-query';\nconst cache=new QueryClient({defaultOptions:{queries:{retry:false}}});\nfunction App(){const [open,setOpen]=React.useState(true);return <QueryClientProvider client={cache}><button onClick={()=>setOpen(true)}>Open fixture</button><ProductFormModal open={open} product={product} onOpenChange={setOpen}/></QueryClientProvider>;}\ncreateRoot(document.getElementById('root')).render").replace("<ProductFormModal open product={product} onOpenChange={()=>{throw new Error('Unexpected dismissal')}} />", '<App/>')

async def check(base):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width,height in [(1053,763),(390,700)]:
            context=await browser.new_context(viewport={'width':width,'height':height})
            page=await context.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            async def route(r):
                if r.request.url.startswith(base): await r.continue_()
                else: await r.abort()
            await page.route('**/*',route)
            await page.goto(base)
            field=page.get_by_label('Text auf Website (optional)',exact=True)
            await field.wait_for(state='attached')
            preview=page.get_by_label('Website-Vorschau')
            assert 'Jeden Mittwoch' in await preview.inner_text()
            assert await page.locator('input[type=date]').count()==0
            await field.fill('  Immer mittwochs  ')
            await page.get_by_role('dialog').get_by_role('button',name='Abbrechen',exact=True).click()
            await page.get_by_role('button',name='Weiter bearbeiten').click()
            assert await field.input_value()=='  Immer mittwochs  '
            await page.get_by_role('dialog').get_by_role('button',name='Speichern',exact=True).click()
            await page.get_by_role('dialog').wait_for(state='hidden')
            saved=await page.evaluate('window.fixture.stored')
            assert saved['display_schedule_text']=='Immer mittwochs' and saved['weekdays']==[3] and saved['dates']==[]
            assert saved['time_blocks']==[{'start':'10:00','end':'12:00'},{'start':'14:00','end':'16:00'}]
            await page.get_by_role('button',name='Open fixture').click()
            assert await field.input_value()=='Immer mittwochs'
            await field.fill('x'*161)
            await page.get_by_role('dialog').get_by_role('button',name='Speichern',exact=True).click()
            await page.get_by_role('alert').filter(has_text='160').wait_for()
            assert await page.evaluate('window.fixture.saves.length')==1
            await field.fill('')
            assert 'Jeden Mittwoch' in await preview.inner_text()
            await page.get_by_role('dialog').get_by_role('button',name='Speichern',exact=True).click()
            await page.get_by_role('dialog').wait_for(state='hidden')
            await page.get_by_role('button',name='Open fixture').click()
            await page.locator('#offering-kind').click()
            await page.get_by_role('option',name='Einzeltermine mit Datum').click()
            await page.get_by_role('button',name='Termin hinzufügen',exact=True).click()
            await page.get_by_label('Termin 1',exact=True).fill('2027-01-09')
            await page.get_by_label('Beginn Zeitblock 1',exact=True).fill('10:00')
            await page.get_by_label('Ende Zeitblock 1',exact=True).fill('12:00')
            await page.get_by_role('button',name='Zweiter Zeitblock',exact=True).click()
            await page.get_by_label('Beginn Zeitblock 2',exact=True).fill('14:00')
            await page.get_by_label('Ende Zeitblock 2',exact=True).fill('16:00')
            await page.get_by_role('dialog').get_by_role('button',name='Speichern',exact=True).click()
            await page.get_by_role('dialog').wait_for(state='hidden')
            await page.get_by_role('button',name='Open fixture').click()
            assert await page.get_by_label('Termin 1',exact=True).input_value()=='2027-01-09'
            assert await page.get_by_label('Ende Zeitblock 2',exact=True).input_value()=='16:00'
            await page.get_by_label('Text auf Website (optional)',exact=True).scroll_into_view_if_needed()
            await page.screenshot(path=str(OUTPUT/f'{width}x{height}.png'))
            assert not errors,errors
            print(f'PASS {width}x{height}: actual modal/hook save/reopen, optional text, Wednesday fallback, 161 rejection, dirty guard, explicit date, two blocks; external network blocked')
            await context.close()
        await browser.close()

def main():
    with tempfile.TemporaryDirectory(prefix='offering-display-text-',dir='/tmp') as tmp:
        root=Path(tmp)
        (root/'index.html').write_text('<div id="root"></div><script type="module" src="/main.tsx"></script>')
        (root/'main.tsx').write_text(ENTRY)
        (root/'mocks.ts').write_text(MOCKS)
        (root/'client.ts').write_text(CLIENT)
        aliases=[{'find':f'@/hooks/{name}','replacement':str(root/'mocks.ts')} for name in ['useProducts','useSeasons','usePrivateProductTariffs']]
        aliases.extend([{'find':'@/integrations/supabase/client','replacement':str(root/'client.ts')},{'find':'@','replacement':str(ROOT/'src')}])
        (root/'vite.config.mjs').write_text(f"import react from '{ROOT}/node_modules/@vitejs/plugin-react-swc/index.js'; export default {{root:{json.dumps(tmp)},plugins:[react()],resolve:{{alias:{json.dumps(aliases)}}},server:{{host:'127.0.0.1',port:5218,strictPort:true,fs:{{allow:['/tmp',{json.dumps(str(ROOT))}]}}}}}};")
        (root/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
        (root/'postcss.config.cjs').write_text(f"module.exports={{plugins:{{tailwindcss:{{config:'{ROOT}/tailwind.config.ts'}},autoprefixer:{{}}}}}}")
        with (OUTPUT/'vite.log').open('w') as log:
            server=subprocess.Popen([str(ROOT/'node_modules/.bin/vite'),'--config',str(root/'vite.config.mjs')],cwd=ROOT,stdout=log,stderr=log)
            try:
                for _ in range(100):
                    try: urllib.request.urlopen('http://127.0.0.1:5218/',timeout=1);break
                    except OSError:
                        if server.poll() is not None: raise RuntimeError((OUTPUT/'vite.log').read_text())
                        time.sleep(.1)
                asyncio.run(check('http://127.0.0.1:5218/'))
            finally: server.terminate();server.wait(timeout=10)

if __name__=='__main__': main()