import {readFile,writeFile} from 'node:fs/promises';
const [file,output]=process.argv.slice(2);if(!file||!output)throw Error('node ai/report-complete.js evaluation.json report.md');
const report=JSON.parse(await readFile(file,'utf8'));
const roles={king:'왕',citizen:'시민',hunter:'사냥꾼',blacksmith:'대장장이',rebel:'반란군',bishop:'주교',merchant:'상인',neutral:'일반 중립'};
let text='# 역할·인원·모델별 평가\n\n';text+=`판정: ${report.gate?.state||'진행 중'} · 승격: 없음\n\n|역할|인원|상대|후보 승률(승/판)|기준 승률(승/판)|\n|---|---:|---|---:|---:|\n`;
const keys=[...new Set([...Object.keys(report.byCount.candidate),...Object.keys(report.byCount.baseline)])].sort();
const format=r=>r?`${(100*r.wins/r.games).toFixed(2)}% (${r.wins}/${r.games})`:'미평가';
for(const key of keys){const [role,count,...opponent]=key.split('/');text+=`|${roles[role]||role}|${count}|${opponent.join('/')}|${format(report.byCount.candidate[key])}|${format(report.byCount.baseline[key])}|\n`;}
await writeFile(output,text);console.log(JSON.stringify({output,rows:keys.length}));
