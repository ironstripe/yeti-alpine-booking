"""Actual product modal/hooks, in-memory saved offering, external network blocked."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
import productOfferingDisplayText as fixture

fixture.OUTPUT=Path('/tmp/browser/product-series')
fixture.OUTPUT.mkdir(parents=True,exist_ok=True)
fixture.CLIENT=fixture.CLIENT.replace("let stored={schedule_kind:'weekly',weekdays:[3],dates:[],time_blocks:[{start:'10:00',end:'12:00'},{start:'14:00',end:'16:00'}],display_schedule_text:null};",'let stored=null;')
fixture.ENTRY=fixture.ENTRY.replace("price_tiers:Array.from({length:7},(_,i)=>({day_count:i+1,cumulative_price:(i+1)*100}))", "price_tiers:[{day_count:1,cumulative_price:70},{day_count:2,cumulative_price:110},{day_count:3,cumulative_price:140}]")
async def check(base):
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        for width,height in [(1053,763),(390,700)]:
            context=await browser.new_context(viewport={'width':width,'height':height},has_touch=width==390)
            page=await context.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            async def route(r):
                if r.request.url.startswith(base): await r.continue_()
                else: await r.abort()
            await page.route('**/*',route)
            await page.goto(base)
            dialog=page.get_by_role('dialog',name='Produkt bearbeiten')
            await page.locator('#offering-kind').click()
            await page.get_by_role('option',name='Datierte Serien',exact=True).click()
            await page.get_by_label('Beginn Serie 1',exact=True).fill('2027-01-09')
            await page.get_by_label('Ende Serie 1',exact=True).fill('2027-02-06')
            await page.get_by_role('button',name='Serie hinzufügen',exact=True).click()
            await page.get_by_label('Beginn Serie 2',exact=True).fill('2027-02-20')
            await page.get_by_label('Ende Serie 2',exact=True).fill('2027-03-20')
            assert (await page.get_by_label('Angebotene Termine Serie 1').inner_text()).split(' · ')==['09.01.2027','16.01.2027','23.01.2027','30.01.2027','06.02.2027']
            assert (await page.get_by_label('Angebotene Termine Serie 2').inner_text()).split(' · ')==['20.02.2027','27.02.2027','06.03.2027','13.03.2027','20.03.2027']
            await page.get_by_label('Text auf Website (optional)',exact=True).fill('Samstags')
            await page.get_by_label('Beginn Zeitblock 1',exact=True).fill('10:00')
            await page.get_by_label('Ende Zeitblock 1',exact=True).fill('12:00')
            await page.get_by_role('button',name='Zweiter Zeitblock',exact=True).click()
            await page.get_by_label('Beginn Zeitblock 2',exact=True).fill('14:00')
            await page.get_by_label('Ende Zeitblock 2',exact=True).fill('16:00')
            for date,price in [('09.01.2027','70'),('16.01.2027','110'),('23.01.2027','140')]:
                await page.get_by_role('checkbox',name=date,exact=True).check()
                assert price in await page.get_by_role('status').inner_text()
            assert await page.get_by_role('checkbox',name='30.01.2027',exact=True).is_disabled()
            await page.get_by_label('Serie für Tarifvorschau').click()
            await page.get_by_role('option',name='Serie 2',exact=True).click()
            assert await page.get_by_role('checkbox',name='20.02.2027',exact=True).is_checked()==False
            assert await page.get_by_role('checkbox',name='09.01.2027',exact=True).count()==0
            await dialog.get_by_role('button',name='Abbrechen',exact=True).click()
            await page.get_by_role('button',name='Weiter bearbeiten').click()
            assert await page.get_by_label('Beginn Serie 2',exact=True).input_value()=='2027-02-20'
            await dialog.get_by_role('button',name='Speichern',exact=True).click()
            await dialog.wait_for(state='hidden')
            saved=await page.evaluate('window.fixture.stored')
            assert len(saved['series'])==2 and saved['weekdays']==[6] and saved['display_schedule_text']=='Samstags' and len(saved['time_blocks'])==2
            assert all(s['max_selected_days']==3 for s in saved['series'])
            await page.get_by_role('button',name='Open fixture').click()
            assert await page.get_by_label('Ende Serie 2',exact=True).input_value()=='2027-03-20'
            pane=dialog.locator(':scope > div').filter(has=page.locator('form')).first
            geometry=await pane.evaluate('el=>({client:el.clientHeight,scroll:el.scrollHeight})')
            assert geometry['scroll']>geometry['client']>0
            await page.get_by_label('Name *',exact=True).focus()
            await page.keyboard.press('PageDown')
            await page.get_by_label('Ende Serie 2',exact=True).scroll_into_view_if_needed()
            await page.screenshot(path=str(fixture.OUTPUT/f'{width}x{height}.png'))
            active=page.get_by_role('switch',name='Aktiv',exact=True)
            await active.scroll_into_view_if_needed()
            for name in ['Speichern','Abbrechen']:
                box=await dialog.get_by_role('button',name=name,exact=True).bounding_box()
                assert box and box['y']>=0 and box['y']+box['height']<=height
            assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            await page.get_by_role('button',name='Serie 2 entfernen',exact=True).click()
            assert await page.get_by_label('Beginn Serie 2',exact=True).count()==0
            await dialog.get_by_role('button',name='Abbrechen',exact=True).click()
            await page.get_by_role('button',name='Weiter bearbeiten').click()
            assert not errors,errors
            print(f'PASS {width}x{height}: series dates, max3, exact tiers, no mixing, save/reopen, removal, dirty guard, scroll/footer; blocked external network')
            await context.close()
        await browser.close()
fixture.check=check
if __name__=='__main__': fixture.main()
