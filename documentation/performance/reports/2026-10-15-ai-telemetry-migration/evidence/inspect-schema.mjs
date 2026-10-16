// Offline comparison of the saved live catalog with the current source schema.
import {readFile,writeFile} from 'node:fs/promises';
const directory=new URL('./',import.meta.url);
const before=JSON.parse(await readFile(new URL('preflight.json',directory),'utf8'));
const after=JSON.parse(await readFile(new URL('postflight.json',directory),'utf8'));
const schema=await readFile('prisma/schema.prisma','utf8');
const model=schema.match(/^model AiUsageLog \{([\s\S]*?)^\}/m)[1];
const types={Int:'integer',Float:'double precision',Boolean:'boolean',String:'text',DateTime:'timestamp without time zone',Json:'jsonb'};
const expected=[...model.matchAll(/^[ \t]+(\w+)[ \t]+(Int|Float|Boolean|String|DateTime|Json)(\?)?[ \t]*([^\n]*)$/gm)].map(([,name,type,optional,attributes])=>({name,type:attributes.includes('@db.Uuid')?'uuid':types[type],nullable:Boolean(optional)}));
const actual=new Map(after.data.columns.map(column=>[column.column_name,column]));
const problems=[];
for(const field of expected){const column=actual.get(field.name);if(!column||column.data_type!==field.type||column.is_nullable!==(field.nullable?'YES':'NO'))problems.push({field:field.name,reason:'type/nullability mismatch or missing field'});}
if(actual.size!==expected.length)problems.push({reason:'column count mismatch'});
if(actual.get('estimatedCostUsd')?.column_default!==null)problems.push({reason:'unexpected cost default'});
const report={source:'Current Prisma schema scalar fields versus hosted information_schema; generated-client integration verified separately',expectedScalarFields:expected.length,actualColumns:actual.size,problems,indexesPreserved:JSON.stringify(before.data.indexes)===JSON.stringify(after.data.indexes),constraintsPreserved:JSON.stringify(before.data.constraints)===JSON.stringify(after.data.constraints),permissionsPreserved:JSON.stringify(before.data.access)===JSON.stringify(after.data.access)};
await writeFile(new URL('telemetry-schema-match.json',directory),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(problems.length||!report.indexesPreserved||!report.constraintsPreserved||!report.permissionsPreserved)process.exitCode=1;
