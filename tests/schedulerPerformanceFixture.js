async () => {
 const Refresh=await import('/@react-refresh'); Refresh.default.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
 const dep=async(src,name)=>(await(await fetch(src)).text()).match(new RegExp('from "([^\"]*'+name+'[^\"]*)"'))[1];
 const src='/src/components/scheduler/InstructorFocusView.tsx';
 const {default:React}=await import(await dep(src,'/deps/react.js'));
 const {createRoot}= (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
 const {MemoryRouter}=await import(await dep('/src/components/scheduler/EmptySlot.tsx','react-router-dom'));
 const {QueryClient,QueryClientProvider}=await import(await dep('/src/hooks/useSchedulerData.ts','@tanstack_react-query'));
 const {AuthProvider}=await import('/src/contexts/AuthContext.tsx');
 const {TooltipProvider}=await import('/src/components/ui/tooltip.tsx');
 const {InstructorFocusView}=await import(src);
 const {SchedulerSelectionProvider,useSchedulerSelection}=await import('/src/contexts/SchedulerSelectionContext.tsx');
 const {DndKitProvider}=await import('/src/components/scheduler/DndKitProvider.tsx');
 const {StickyTimeHeader}=await import('/src/components/scheduler/StickyTimeHeader.tsx');
 const {MobileSchedulerAgenda}=await import('/src/components/scheduler/mobile/MobileSchedulerAgenda.tsx');
 const {SelectionToolbar}=await import('/src/components/scheduler/SelectionToolbar.tsx');
 await import('/src/index.css'); const h=React.createElement;
 const instructors=Array.from({length:98},(_,i)=>({id:'teacher-'+i,first_name:'Lehrer'+String(i).padStart(2,'0'),last_name:'Synthetisch',specialization:i%3===0?'snowboard':'ski',roles:i%10===0?['office']:['ski'],role:i%10===0?'office_staff':'teacher',languages:['de'],color:'red',status:'active'}));
 const bookings=Array.from({length:98},(_,i)=>({id:'booking-'+i,appointmentId:'appointment-'+i,instructorId:'teacher-'+i,date:'2026-12-21',timeStart:'10:00',timeEnd:'12:00',type:i%2?'private':'group',isPaid:true,ticketId:'synthetic-'+i,participantName:'Synthetic '+i,status:'confirmed',currentParticipants:2,maxParticipants:8}));
 const absences=Array.from({length:14},(_,i)=>({id:'absence-'+i,instructorId:'teacher-'+i*7,startDate:'2026-12-22',endDate:'2026-12-23',type:'vacation',status:'confirmed',isFullDay:true}));
 window.samples=[];window.longtasks=[];window.frames=[]; new PerformanceObserver(list=>window.longtasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
 window.startFrames=()=>{window.frames=[];let previous=performance.now();window.recordFrames=true;const tick=now=>{if(!window.recordFrames)return;window.frames.push(now-previous);previous=now;requestAnimationFrame(tick)};requestAnimationFrame(tick)};
 function Fixture(){const s=useSchedulerSelection();window.selection=s;const [days,setDays]=React.useState(7),[shown,setShown]=React.useState(true),[role,setRole]=React.useState(null),[compact,setCompact]=React.useState(false),[capability,setCapability]=React.useState(null),[planning,setPlanning]=React.useState(false),[width,setWidth]=React.useState(112),[highlight,setHighlight]=React.useState(null),[reverse,setReverse]=React.useState(false),[mobile,setMobile]=React.useState(false);
 const refs=React.useRef(new Map()),scroll=React.useRef(null);window.controls={setDays,setShown,setRole,setCompact,setCapability,setPlanning,setWidth,setReverse,setMobile,search:id=>{setHighlight(id);requestAnimationFrame(()=>refs.current.get(id)?.scrollIntoView({block:'center'}))}};
 const dates=React.useMemo(()=>Array.from({length:days},(_,i)=>new Date(2026,11,21+i)),[days]);
 const list=React.useMemo(()=>{let l=role?instructors.filter(i=>i.roles.includes(role)):instructors;return reverse?[...l].reverse():l},[role,reverse]);
 return h(DndKitProvider,{onBookingDrop:(...args)=>window.lastDrop=args},h('div',{style:{height:'900px',display:'flex',flexDirection:'column'},id:'shell'},shown?h('div',{id:'scroll',ref:scroll,style:{flex:1,minHeight:0,overflow:'auto'}},mobile?h(MobileSchedulerAgenda,{instructors:list,date:dates[0],bookings,absences,onFreeSlotTap:p=>window.mobileTap=p}):h(React.Fragment,null,h(StickyTimeHeader,{slotWidth:100,showDayColumn:days>1,instructorColumnWidth:width,onColumnResize:()=>{},onResizeEnd:()=>{}}),h(React.Profiler,{id:'scheduler',onRender:(id,phase,actual,base,start,commit)=>window.samples.push({phase,actual,base,start,commit})},h(InstructorFocusView,{instructors:list,dates,bookings,absences,slotWidth:100,onSlotClick:()=>{},isLoading:false,highlightedInstructorId:highlight,capabilityFilter:capability,compactMode:compact,instructorRefs:refs,scrollContainerRef:scroll,isPlanningMode:planning,instructorColumnWidth:width})))):h('div',null,'Wizard fixture'),h(SelectionToolbar,{bookings}))) }
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 window.fixtureStart=performance.now();createRoot(document.getElementById('fixture')).render(h(QueryClientProvider,{client:qc},h(MemoryRouter,null,h(AuthProvider,null,h(TooltipProvider,null,h(SchedulerSelectionProvider,null,h(Fixture)))))));
}
