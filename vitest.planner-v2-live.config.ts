import { defineConfig } from 'vitest/config';
import base from './vitest.planner-v2-postgres.config';
export default defineConfig({...base,test:{...base.test,include:['__tests__/planner-v2/postgres/*.live.ts'],testTimeout:360000,hookTimeout:15000}});
