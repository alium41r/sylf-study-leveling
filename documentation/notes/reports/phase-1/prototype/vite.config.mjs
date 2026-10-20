import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
// Qualification probe: inspect the emitted client graph against mobile's server boundary.
const forbidden=[/@prisma\/client/, /\/prisma\//, /\/lib\/prisma/, /\/lib\/auth-server/, /\/lib\/supabase-storage/, /\/lib\/auth-admin/, /\/lib\/ai\/providers/, /\/lib\/ai\/orchestrator/, /\/lib\/ai\/syllabus-compiler/, /\/lib\/planner\/server\//, /bcryptjs/, /server-only/];
function clientGraphProbe(){return{name:'phase1-client-graph',generateBundle(_options,bundle){
 const modules=[...new Set(Object.values(bundle).filter(v=>v.type==='chunk').flatMap(v=>Object.keys(v.modules)))];
 const violations=modules.filter(id=>forbidden.some(pattern=>pattern.test(id)));
 if(violations.length)throw new Error('Server modules in client graph: '+violations.join(','));
 this.emitFile({type:'asset',fileName:'client-graph.json',source:JSON.stringify({moduleCount:modules.length,violations,scope:'isolated Vite graph; not full Sylf mobile build'},null,2)});
}};}
export default defineConfig({plugins:[react(),clientGraphProbe()],build:{outDir:'dist-vite',target:'es2022',chunkSizeWarningLimit:1200},server:{port:4387,strictPort:true}});
