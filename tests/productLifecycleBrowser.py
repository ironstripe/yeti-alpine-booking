"""Actual ProductFormModal + hooks, synthetic client only; external network blocked."""
import asyncio,json,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.async_api import async_playwright
import productModalScroll as harness
ROOT=harness.ROOT
OUTPUT=Path('/tmp/browser/product-lifecycle');OUTPUT.mkdir(parents=True,exist_ok=True)
CLIENT="""
const initial={id:'00000000-0000-4000-8000-000000000003',season_id:'synthetic-season',name:'Imported fixture',type:'group',pricing_type:'fixed',price:99,duration_minutes:120,min_age:16,max_age:null,is_active:false,is_training_product:true,show_on_website:false,discipline:'ski',audience:'adults',reporting_category:'group',description:null};
let stored={...initial};window.fixture={saves:[],bc:[{price:99}],get product(){return {...stored};}};
export const supabase={functions:{invoke:async(name,{body})=>{if(name!=='product-management')throw Error('Unexpected function');if(JSON.stringify(body.expected)!==JSON.stringify(stored))return {data:{error:'conflict'},error:null};stored={...stored,...body.patch};window.fixture.saves.push(body);return {data:{ok:true,product:stored},error:null};}},from:()=>{throw Error('Raw business writes forbidden');}};
"""
ENTRY="""
import React from 'react';import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ProductFormModal} from '@/components/settings/ProductFormModal';import '@/index.css';
const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
function App(){const [open,setOpen]=React.useState(true);const [product,setProduct]=React.useState(window.fixture.product);return <QueryClientProvider client={cache}><button onClick={()=>{setProduct(window.fixture.product);setOpen(true);}}>Open fixture</button><ProductFormModal open={open} product={product} isBookingCornerDraft onOpenChange={setOpen}/></QueryClientProvider>;}
createRoot(document.getElementById('root')).render(<App/>);
"""
async def check(base):
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width,height in [(1053,763),(390,700)]:
   context=await browser.new_context(viewport={'width':width,'height':height})
   page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   async def route(r):
    if r.request.url.startswith(base):await r.continue_()
    else:await r.abort()
   await page.route('**/*',route);await page.goto(base)
   active=page.get_by_role('switch',name='Aktiv',exact=True)
   await active.wait_for(state='attached');assert await active.is_enabled()
   await active.scroll_into_view_if_needed();await active.click()
   await page.get_by_role('dialog').get_by_role('button',name='Speichern',exact=True).click()
   await page.get_by_role('dialog').wait_for(state='hidden')
   assert await page.evaluate('window.fixture.product.is_active') is True
   assert await page.evaluate('window.fixture.product.show_on_website') is False
   assert await page.evaluate('window.fixture.product.price')==99
   assert await page.evaluate('window.fixture.bc')==[{'price':99}]
   await page.get_by_role('button',name='Open fixture').click()
   assert await active.get_attribute('aria-checked')=='true'
   await active.scroll_into_view_if_needed();await page.screenshot(path=str(OUTPUT/f'{width}x{height}.png'))
   assert not errors,errors
   print(f'PASS {width}x{height}: actual imported modal/hook activation, save/reopen, BC/price/visibility unchanged; network blocked')
   await context.close()
  await browser.close()
def main():
 with tempfile.TemporaryDirectory(prefix='product-lifecycle-',dir='/tmp') as tmp:
  root=Path(tmp);(root/'index.html').write_text('<div id="root"></div><script type="module" src="/main.tsx"></script>')
  (root/'main.tsx').write_text(ENTRY);(root/'client.ts').write_text(CLIENT)
  mocks='\n'.join(l for l in harness.MOCKS.splitlines() if not l.startswith(('export const useCreateProduct','export const useUpdateProduct')))
  (root/'mocks.ts').write_text(mocks)
  aliases=[{'find':f'@/hooks/{name}','replacement':str(root/'mocks.ts')} for name in ['useSeasons','useProductPublicOffering','usePrivateProductTariffs']]
  aliases.extend([{'find':'@/integrations/supabase/client','replacement':str(root/'client.ts')},{'find':'@','replacement':str(ROOT/'src')}])
  (root/'vite.config.mjs').write_text(f"import react from '{ROOT}/node_modules/@vitejs/plugin-react-swc/index.js'; export default {{root:{json.dumps(tmp)},plugins:[react()],resolve:{{alias:{json.dumps(aliases)}}},server:{{host:'127.0.0.1',port:5219,strictPort:true,fs:{{allow:['/tmp',{json.dumps(str(ROOT))}]}}}}}};")
  (root/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
  (root/'postcss.config.cjs').write_text(f"module.exports={{plugins:{{tailwindcss:{{config:'{ROOT}/tailwind.config.ts'}},autoprefixer:{{}}}}}}")
  with (OUTPUT/'vite.log').open('w') as log:
   server=subprocess.Popen([str(ROOT/'node_modules/.bin/vite'),'--config',str(root/'vite.config.mjs')],cwd=ROOT,stdout=log,stderr=log)
   try:
    for _ in range(100):
     try:urllib.request.urlopen('http://127.0.0.1:5219/',timeout=1);break
     except OSError:
      if server.poll() is not None:raise RuntimeError((OUTPUT/'vite.log').read_text())
      time.sleep(.1)
    asyncio.run(check('http://127.0.0.1:5219/'))
   finally:server.terminate();server.wait(timeout=10)
if __name__=='__main__':main()