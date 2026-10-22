import {writeFile,rename,readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
export async function saveExperiment(file,state){await mkdir(path.dirname(file),{recursive:true});await writeFile(`${file}.tmp`,JSON.stringify({version:2,...state}));await rename(`${file}.tmp`,file);}
export async function loadExperiment(file){const state=JSON.parse(await readFile(file,'utf8'));if(state.version!==2||!state.current?.policy||!state.current?.optimizer||!Array.isArray(state.candidates)||!Array.isArray(state.opponents)||!Number.isInteger(state.completed))throw Error('실험 체크포인트 구조가 올바르지 않습니다.');return state;}
