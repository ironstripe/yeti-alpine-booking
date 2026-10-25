async () => {
 const Refresh=await import('/@react-refresh');Refresh.default.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
 const dep=async(src,name)=>(await(await fetch(src)).text()).match(new RegExp('from "([^\"]*'+name+'[^\"]*)"'))[1];
 const {default:React}=await import(await dep('/src/components/scheduler/SchedulerGrid.tsx','/deps/react.js'));
 const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
 const {MemoryRouter}=await import(await dep('/src/components/scheduler/SchedulerGrid.tsx','react-router-dom'));
 const {QueryClient,QueryClientProvider}=await import(await dep('/src/hooks/useSchedulerData.ts','@tanstack_react-query'));
 const {AuthProvider}=await import('/src/contexts/AuthContext.tsx');const {TooltipProvider}=await import('/src/components/ui/tooltip.tsx');const {SchedulerGrid}=await import('/src/components/scheduler/SchedulerGrid.tsx');await import('/src/index.css');
 const h=React.createElement;const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 window.fixtureQc=qc;createRoot(document.getElementById('fixture')).render(h(QueryClientProvider,{client:qc},h(MemoryRouter,{initialEntries:['/scheduler?date=2026-12-21']},h(AuthProvider,null,h(TooltipProvider,null,h('div',{style:{height:'100dvh',display:'flex',flexDirection:'column'}},h(SchedulerGrid)))))));
}
