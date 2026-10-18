import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProductPublicOffering, useSaveProductPublicOffering } from '@/hooks/useProductPublicOffering';
import { useSeasons } from '@/hooks/useSeasons';
import { offeringPreview, validateOffering, seriesDates, seriesSelection, weekdayLabels, type ProductOffering, type OfferingContext, type ScheduleKind } from '@/lib/productPublicOffering';
import { formatPriceCHF } from '@/lib/pricing-utils';
export interface ProductOfferingHandle { validate: () => boolean; saveIfDirty: (productId: string) => Promise<boolean> }
interface Props { productId?: string; seasonId?: string; type: string; durationMinutes: number | null; name: string; price: number; tiers: {day_count:number;cumulative_price:number}[]; onDirtyChange:(dirty:boolean)=>void; disabled:boolean }
export const ProductPublicOfferingEditor = forwardRef<ProductOfferingHandle,Props>(function ProductPublicOfferingEditor(props,ref) {
  const query=useProductPublicOffering(props.productId);
  const save=useSaveProductPublicOffering();
  const {data:seasons,isLoading:seasonsLoading,error:seasonError}=useSeasons();
  const [draft,setDraft]=useState<ProductOffering|null>(null);
  const [dirty,setDirty]=useState(false);
  const [selection,setSelection]=useState<{sequence:number;dates:string[]}>({sequence:1,dates:[]});
  const [error,setError]=useState<string|null>(null);
  const season=seasons?.find(s=>s.id===props.seasonId);
  const context:OfferingContext={type:props.type,duration_minutes:props.durationMinutes,season};
  useEffect(()=> { if(!dirty) setDraft(query.data ?? null); },[query.data,dirty]);
  const change=(o:ProductOffering|null)=> {setDraft(o);setDirty(true);props.onDirtyChange(true);setError(null);};
  const validate=()=> {
    if(!dirty) return true;
    if(query.error || (props.productId && query.isLoading)) {setError('Website-Informationen konnten nicht geladen werden');return false;}
    if(props.seasonId && (seasonsLoading || seasonError || !season)) {setError('Saison konnte nicht geprüft werden');return false;}
    const message=draft ? validateOffering(draft,context) : null;
    setError(message); return !message;
  };
  useImperativeHandle(ref,()=>({validate,saveIfDirty:async productId=> {
    if(!dirty) return true;
    if(!validate()) return false;
    try {const saved=await save.mutateAsync({productId,offering:draft});setDraft(saved);setDirty(false);props.onDirtyChange(false);setError(null);return true;}
    catch(e){setError(`Website-Informationen nicht gespeichert. Produkt existiert; vor erneutem Speichern prüfen. ${e instanceof Error ? e.message : ''}`);return false;}
  }}));
  const unavailable=!!query.error;
  const disabled=props.disabled || unavailable || (props.productId ? query.isLoading : false);
  const mode=(kind:string)=> {
    if(kind==='series') {change({schedule_kind:'weekly',weekdays:draft?.weekdays.length ? draft.weekdays : [6],dates:[],time_blocks:draft?.time_blocks.length ? draft.time_blocks : [{start:'',end:''}],display_schedule_text:draft?.display_schedule_text ?? null,series:draft?.series?.length ? draft.series : [{sequence:1,label:null,start_date:'',end_date:'',max_selected_days:3}]});return;}
    if(kind==='none') {change(null);return;}
    const schedule_kind=kind as ScheduleKind;
    change({schedule_kind,weekdays:[],dates:[],time_blocks:schedule_kind==='flexible_private'?[]:[{start:'',end:''}],display_schedule_text:draft?.display_schedule_text ?? null});
  };
  return <section aria-labelledby="website-information-title" className="space-y-4 border-t pt-5">
    <h3 id="website-information-title" className="font-medium">Website-Informationen</h3>
    {unavailable && <p role="alert" className="text-sm text-destructive">Website-Informationen nicht verfügbar. Bestehende Produktfelder können weiterhin gespeichert werden.</p>}
    <div className="space-y-2"><Label htmlFor="offering-kind">Angebotstermine</Label>
      <Select value={draft?.series?.length ? 'series' : draft?.schedule_kind ?? 'none'} onValueChange={mode} disabled={disabled}>
        <SelectTrigger id="offering-kind"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="none">Nicht hinterlegt</SelectItem><SelectItem value="weekly">Wöchentliche Wochentage</SelectItem><SelectItem value="explicit_dates">Einzeltermine mit Datum</SelectItem>
          {props.type!=='private' && <SelectItem value="series">Datierte Serien</SelectItem>}
          {props.type==='private' && <SelectItem value="flexible_private">Flexible Privatstunden</SelectItem>}
        </SelectContent></Select>
    </div>
    {draft?.schedule_kind==='weekly' && <fieldset disabled={disabled} className="grid grid-cols-2 gap-3 sm:grid-cols-3"><legend className="mb-2 text-sm font-medium">Wochentage</legend>
      {weekdayLabels.map((name,i)=><label key={name} className="flex items-center gap-2 text-sm"><Checkbox checked={draft.weekdays.includes(i+1)} onCheckedChange={checked=>change({...draft,weekdays:checked?[...draft.weekdays,i+1].sort((a,b)=>a-b):draft.weekdays.filter(d=>d!==i+1)})} />{name}</label>)}
    </fieldset>}
    {!!draft?.series?.length && <div className="space-y-4">
      {draft.series.map((series,i)=><fieldset key={i} disabled={disabled} className="space-y-2 border-b pb-3">
        <legend className="mb-2 text-sm font-medium">Serie {series.sequence}</legend>
        <div className="flex items-end gap-2"><div className="min-w-0 flex-1 space-y-1"><Label htmlFor={`series-label-${i}`}>Bezeichnung (optional) – Serie {i+1}</Label><Input id={`series-label-${i}`} value={series.label ?? ''} onChange={e=>change({...draft,series:draft.series?.map((s,j)=>j===i?{...s,label:e.target.value}:s)})}/></div>
          {[-1,1].map(direction=><Button key={direction} type="button" size="icon" variant="ghost" className="icon-action shrink-0" title={direction<0?'Nach oben':'Nach unten'} aria-label={`Serie ${i+1} ${direction<0?'nach oben':'nach unten'}`} disabled={disabled || i+direction<0 || i+direction>=(draft.series?.length ?? 0)} onClick={()=>{const series=[...(draft.series ?? [])];[series[i],series[i+direction]]=[series[i+direction],series[i]];change({...draft,series:series.map((s,j)=>({...s,sequence:j+1}))});setSelection({sequence:1,dates:[]});}}>{direction<0?<ArrowUp className="h-4 w-4"/>:<ArrowDown className="h-4 w-4"/>}</Button>)}
          <Button type="button" size="icon" variant="ghost" className="icon-action shrink-0" title="Serie entfernen" aria-label={`Serie ${i+1} entfernen`} onClick={()=>{change({...draft,series:draft.series?.filter((_,j)=>j!==i).map((s,j)=>({...s,sequence:j+1}))});setSelection({sequence:1,dates:[]});}}><Trash2 className="h-4 w-4"/></Button>
        </div>
        <div className="grid grid-cols-2 gap-3">{(['start_date','end_date'] as const).map(key=><div key={key} className="min-w-0 space-y-1"><Label htmlFor={`series-${key}-${i}`}>{key==='start_date'?'Beginn':'Ende'} Serie {i+1}</Label><Input className="min-w-0" id={`series-${key}-${i}`} type="date" min={season?.start_date} max={season?.end_date} value={series[key]} onChange={e=>{change({...draft,series:draft.series?.map((s,j)=>j===i?{...s,[key]:e.target.value}:s)});setSelection({sequence:1,dates:[]});}}/></div>)}</div>
        <div className="space-y-1"><Label htmlFor={`series-limit-${i}`}>Maximal buchbare Tage – Serie {i+1}</Label><Input id={`series-limit-${i}`} type="number" min={1} max={366} value={series.max_selected_days} onChange={e=>change({...draft,series:draft.series?.map((s,j)=>j===i?{...s,max_selected_days:Number(e.target.value)}:s)})}/></div>
        <p className="text-sm text-muted-foreground break-words" aria-label={`Angebotene Termine Serie ${i+1}`}>{seriesDates(series,draft.weekdays).map(d=>d.split('-').reverse().join('.')).join(' · ') || 'Keine Termine'}</p>
      </fieldset>)}
      <Button type="button" variant="outline" size="sm" disabled={disabled || draft.series.length>=24} onClick={()=>change({...draft,series:[...(draft.series ?? []),{sequence:(draft.series?.length ?? 0)+1,label:null,start_date:'',end_date:'',max_selected_days:3}]})}><Plus className="mr-2 h-4 w-4"/>Serie hinzufügen</Button>
      <fieldset disabled={disabled} className="space-y-2 border-t pt-3"><legend className="mb-2 text-sm font-medium">Tarifvorschau</legend>
        <Select value={String(selection.sequence)} onValueChange={value=>setSelection({sequence:Number(value),dates:[]})}><SelectTrigger aria-label="Serie für Tarifvorschau"><SelectValue/></SelectTrigger><SelectContent>{draft.series.map(s=><SelectItem key={s.sequence} value={String(s.sequence)}>{s.label || `Serie ${s.sequence}`}</SelectItem>)}</SelectContent></Select>
        {draft.series.filter(s=>s.sequence===selection.sequence).map(s=><div key={s.sequence} className="space-y-2">
          <p className="text-sm">Maximal {s.max_selected_days} Tage innerhalb dieser Serie</p>
          <div className="flex flex-wrap gap-3">{seriesDates(s,draft.weekdays).map(d=><label key={d} className="flex items-center gap-2 text-sm"><Checkbox checked={selection.dates.includes(d)} disabled={disabled || (!selection.dates.includes(d) && selection.dates.length>=s.max_selected_days)} onCheckedChange={checked=>setSelection({...selection,dates:checked?[...selection.dates,d]:selection.dates.filter(date=>date!==d)})}/>{d.split('-').reverse().join('.')}</label>)}</div>
        </div>)}
        {selection.dates.length>0 && <p role="status" className="text-sm">{seriesSelection(draft,selection.sequence,selection.dates,props.tiers).error ?? formatPriceCHF(seriesSelection(draft,selection.sequence,selection.dates,props.tiers).price ?? 0)}</p>}
      </fieldset>
    </div>}
    {draft?.schedule_kind==='explicit_dates' && <div className="space-y-2">
      {draft.dates.map((date,i)=><div key={i} className="flex min-w-0 items-end gap-1">
        <div className="min-w-0 flex-1"><Label htmlFor={`offering-date-${i}`}>Termin {i+1}</Label><Input id={`offering-date-${i}`} className="min-w-0" type="date" value={date} min={season?.start_date} max={season?.end_date} disabled={disabled} onChange={e=>change({...draft,dates:draft.dates.map((d,j)=>i===j?e.target.value:d)})}/></div>
        {[-1,1].map(direction=><Button key={direction} type="button" size="icon" variant="ghost" className="icon-action shrink-0" aria-label={`Termin ${i+1} ${direction<0?'nach oben':'nach unten'}`} title={direction<0?'Nach oben':'Nach unten'} disabled={disabled || i+direction<0 || i+direction>=draft.dates.length} onClick={()=>{const dates=[...draft.dates];[dates[i],dates[i+direction]]=[dates[i+direction],dates[i]];change({...draft,dates});}}>{direction<0?<ArrowUp className="h-4 w-4"/>:<ArrowDown className="h-4 w-4"/>}</Button>)}
        <Button type="button" size="icon" variant="ghost" className="icon-action shrink-0" title="Termin entfernen" aria-label={`Termin ${i+1} entfernen`} disabled={disabled} onClick={()=>change({...draft,dates:draft.dates.filter((_,j)=>j!==i)})}><Trash2 className="h-4 w-4"/></Button>
      </div>)}
      <Button type="button" variant="outline" size="sm" disabled={disabled || draft.dates.length>=366} onClick={()=>change({...draft,dates:[...draft.dates,'']})}><Plus className="mr-2 h-4 w-4"/>Termin hinzufügen</Button>
    </div>}
    {draft && <div className="space-y-2">
      <Label htmlFor="offering-display-text">Text auf Website (optional)</Label>
      <Input id="offering-display-text" value={draft.display_schedule_text ?? ''} placeholder="Immer mittwochs" disabled={disabled} onChange={e=>change({...draft,display_schedule_text:e.target.value})}/>
    </div>}
    {draft && draft.schedule_kind!=='flexible_private' && <div className="space-y-3">
      {draft.time_blocks.map((block,i)=><fieldset key={i} disabled={disabled} className="grid grid-cols-2 gap-3"><legend className="mb-2 text-sm font-medium">Zeitblock {i+1}</legend>
        {(['start','end'] as const).map(key=><div key={key} className="min-w-0 space-y-1"><Label htmlFor={`offering-${key}-${i}`}>{key==='start'?'Beginn':'Ende'}</Label><Input id={`offering-${key}-${i}`} aria-label={`${key==='start'?'Beginn':'Ende'} Zeitblock ${i+1}`} type="time" value={block[key]} onChange={e=>change({...draft,time_blocks:draft.time_blocks.map((b,j)=>i===j?{...b,[key]:e.target.value}:b)})}/></div>)}
      </fieldset>)}
      {draft.time_blocks.length===1 ? <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={()=>change({...draft,time_blocks:[...draft.time_blocks,{start:'',end:''}]})}><Plus className="mr-2 h-4 w-4"/>Zweiter Zeitblock</Button> : <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={()=>change({...draft,time_blocks:draft.time_blocks.slice(0,1)})}><Trash2 className="mr-2 h-4 w-4"/>Zweiten Zeitblock entfernen</Button>}
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="space-y-2 border-t pt-3" aria-label="Website-Vorschau">
      <h4 className="text-sm font-medium">Website-Vorschau</h4><p className="font-medium break-words">{props.name}</p>
      <p className="text-sm text-muted-foreground break-words">{offeringPreview(draft)}</p>
      <p className="text-sm">{props.durationMinutes ? `${props.durationMinutes} Min.` : ''}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">{props.tiers.length ? props.tiers.filter(t=>t.cumulative_price>0).map(t=><span key={t.day_count}>{t.day_count} {t.day_count===1?'Tag':'Tage'}: {formatPriceCHF(t.cumulative_price)}</span>) : <span>{formatPriceCHF(props.price)}</span>}</div>
    </div>
  </section>;
});
