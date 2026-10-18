"""Permanent browser regression: python3 tests/productModalScroll.py.

Mounts the actual product modal and editors in a temporary Vite harness. All
data hooks are synthetic and all non-local requests are blocked. No saves run.
Use --measure-only to diagnose geometry without enforcing the height contract.
"""
import asyncio
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path('/tmp/browser/product-modal-scroll')
OUTPUT.mkdir(parents=True, exist_ok=True)

MOCKS = """
export const useCreateProduct = () => ({isPending:false, mutate:()=>{throw new Error('Save forbidden in scroll test')}});
export const useUpdateProduct = useCreateProduct;
export const useSeasons = () => ({data:[{id:'synthetic-season',start_date:'2026-12-01',end_date:'2027-04-01'}],isLoading:false});
export const useProductPublicOffering = () => ({data:offering,isLoading:false});
export const useSaveProductPublicOffering = () => ({mutateAsync:()=>{throw new Error('Save forbidden')}});
export const usePrivateProductTariffs = () => ({data:[],isPending:false});
export const useBcOriginalPrivateTariffs = usePrivateProductTariffs;
export const useSavePrivateProductTariffs = useSaveProductPublicOffering;
const offering = {schedule_kind:'weekly',weekdays:[1,2,3,4,5],dates:[],time_blocks:[{start:'10:00',end:'12:00'},{start:'14:00',end:'16:00'}]};
"""

ENTRY = """
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ProductFormModal} from '@/components/settings/ProductFormModal';
import '@/index.css';
const product = {id:'synthetic-product',season_id:'synthetic-season',name:'Synthetic long group product',type:'group',pricing_type:'tiered',price:100,duration_minutes:240,min_age:null,max_age:null,is_active:true,is_training_product:true,show_on_website:false,discipline:'ski',audience:'kids',reporting_category:'group',description:'Synthetic scroll fixture',price_tiers:Array.from({length:7},(_,i)=>({day_count:i+1,cumulative_price:(i+1)*100}))};
createRoot(document.getElementById('root')).render(<ProductFormModal open product={product} onOpenChange={()=>{throw new Error('Unexpected dismissal')}} />);
"""

async def check(base):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width, height in [(1053,763),(390,700),(1280,3000)]:
            context = await browser.new_context(viewport={'width':width,'height':height},has_touch=width==390,reduced_motion='reduce')
            page = await context.new_page()
            errors, blocked = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            async def route(request):
                if request.request.url.startswith(base):
                    await request.continue_()
                else:
                    blocked.append(request.request.url.split('/')[2])
                    await request.abort()
            await page.route('**/*', route)
            await page.goto(base)
            dialog = page.get_by_role('dialog',name='Produkt bearbeiten')
            await dialog.wait_for()
            await page.get_by_label('Ende Zeitblock 2',exact=True).wait_for(state='attached')
            pane = dialog.locator(':scope > div').filter(has=page.locator('form')).first
            geometry = await pane.evaluate('el => ({client:el.clientHeight,scroll:el.scrollHeight,top:el.scrollTop,parent:el.parentElement.clientHeight,height:getComputedStyle(el.parentElement).height,overflow:getComputedStyle(el).overflowY,transform:getComputedStyle(el.parentElement).transform})')
            print(json.dumps({'viewport':[width,height],**geometry}),flush=True)
            if '--measure-only' in sys.argv:
                await context.close()
                continue
            # A definite, viewport-capped height is the contract, not just a class.
            height_rule = await dialog.evaluate("el => [...document.styleSheets].flatMap(s=>{try{return [...s.cssRules]}catch{return []}}).some(r=>r.selectorText && el.matches(r.selectorText) && r.style.height && r.style.height !== 'auto')")
            assert height_rule, 'Dialog must have a definite CSS height, not max-height alone'
            assert geometry['parent'] <= height * .9 + 2
            if height < 1000:
                assert geometry['scroll'] > geometry['client'] > 0, geometry
            else:
                assert geometry['parent'] < height*.9-100, 'Tall viewports should not force empty space'
            await page.get_by_label('Name *',exact=True).fill('Synthetic edited name')
            bounds = await pane.bounding_box()
            assert bounds
            await page.mouse.move(bounds['x']+bounds['width']/2,bounds['y']+bounds['height']/2)
            await page.mouse.wheel(0,450)
            await page.wait_for_timeout(180)
            if height < 1000:
                assert await pane.evaluate('el=>el.scrollTop') > 0, 'Wheel did not scroll'
            # Real keyboard focus/scroll, without assigning scrollTop in JavaScript.
            await page.get_by_label('Gesamtpreis für 7 Tage',exact=True).focus()
            await page.keyboard.press('PageDown')
            await page.get_by_label('Gesamtpreis für 7 Tage',exact=True).scroll_into_view_if_needed()
            assert await page.get_by_label('Gesamtpreis für 7 Tage',exact=True).input_value() == '700'
            for label in ['Beginn Zeitblock 1','Ende Zeitblock 2']:
                target = page.get_by_label(label,exact=True)
                await target.scroll_into_view_if_needed()
                box = await target.bounding_box()
                assert box and box['y'] > 0 and box['y']+box['height'] < height
            await page.get_by_label('Ende Zeitblock 2',exact=True).fill('16:15')
            active = page.get_by_role('switch',name='Aktiv',exact=True)
            await active.focus()
            before = await pane.evaluate('el=>el.scrollTop')
            await page.keyboard.press('PageUp')
            await page.wait_for_timeout(180)
            if height < 1000:
                assert await pane.evaluate('el=>el.scrollTop') < before, 'Keyboard did not scroll'
            await active.scroll_into_view_if_needed()
            await active.click()
            assert await active.get_attribute('aria-checked') == 'false'
            for name in ['Abbrechen','Speichern']:
                box = await dialog.get_by_role('button',name=name,exact=True).bounding_box()
                assert box and box['y'] >= 0 and box['y']+box['height'] <= height
            assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal page overflow'
            await page.screenshot(path=str(OUTPUT/f'{width}x{height}-bottom.png'))
            await dialog.get_by_role('button',name='Abbrechen',exact=True).click()
            await page.get_by_role('alertdialog').wait_for()
            await page.get_by_role('button',name='Weiter bearbeiten',exact=True).click()
            assert await page.get_by_label('Name *',exact=True).input_value() == 'Synthetic edited name'
            assert await page.get_by_label('Ende Zeitblock 2',exact=True).input_value() == '16:15'
            assert await active.get_attribute('aria-checked') == 'false'
            assert await dialog.get_by_role('button',name='Speichern',exact=True).is_enabled()
            assert not errors, errors
            print(f'PASS {width}x{height}: scroll, reachable controls, fixed footer, dirty state; external requests blocked: {len(blocked)}',flush=True)
            await context.close()
        await browser.close()

def main():
    with tempfile.TemporaryDirectory(prefix='product-modal-scroll-',dir='/tmp') as tmp:
        root = Path(tmp)
        (root/'index.html').write_text('<div id="root"></div><script type="module" src="/main.tsx"></script>')
        (root/'main.tsx').write_text(ENTRY)
        (root/'mocks.ts').write_text(MOCKS)
        aliases = [{'find':f'@/hooks/{name}','replacement':str(root/'mocks.ts')} for name in ['useProducts','useSeasons','useProductPublicOffering','usePrivateProductTariffs']]
        aliases.append({'find':'@','replacement':str(ROOT/'src')})
        (root/'vite.config.mjs').write_text(f"import react from '{ROOT}/node_modules/@vitejs/plugin-react-swc/index.js'; export default {{root:{json.dumps(tmp)},plugins:[react()],resolve:{{alias:{json.dumps(aliases)}}},server:{{host:'127.0.0.1',port:5217,strictPort:true,fs:{{allow:['/tmp',{json.dumps(str(ROOT))}]}}}}}};")
        (root/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
        (root/'postcss.config.cjs').write_text(f"module.exports={{plugins:{{tailwindcss:{{config:'{ROOT}/tailwind.config.ts'}},autoprefixer:{{}}}}}}")
        with (OUTPUT/'vite.log').open('w') as log:
            server = subprocess.Popen([str(ROOT/'node_modules/.bin/vite'),'--config',str(root/'vite.config.mjs')],cwd=ROOT,stdout=log,stderr=log)
            try:
                import time, urllib.request
                for _ in range(100):
                    try:
                        urllib.request.urlopen('http://127.0.0.1:5217/',timeout=1)
                        break
                    except OSError:
                        if server.poll() is not None:
                            raise RuntimeError((OUTPUT/'vite.log').read_text())
                        time.sleep(.1)
                asyncio.run(check('http://127.0.0.1:5217/'))
            finally:
                server.terminate()
                server.wait(timeout=10)

if __name__ == '__main__':
    main()