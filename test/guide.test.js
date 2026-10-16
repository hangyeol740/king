import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {CARDS} from '../lib/game.js';
test('게임 가이드 10페이지 탐색과 최신 병기 공격력 표시',async()=>{
 const root={innerHTML:''},dialog={scrollTop:20};let click;
 const context=vm.createContext({window:{},document:{querySelector:s=>s==='#rules-content'?root:dialog,addEventListener:(_type,handler)=>click=handler}});
 vm.runInContext(await readFile(new URL('../public/guide.js',import.meta.url),'utf8'),context);
 context.window.kingdomGuide.render({cards:CARDS});assert.equal((root.innerHTML.match(/data-guide-page=/g)||[]).length,10);
 for(let i=0;i<10;i++){click({target:{closest:()=>({dataset:{guidePage:String(i)}})}});assert.ok(root.innerHTML.includes(`${i+1} / 10`));if(i===2)assert.match(root.innerHTML,/공격력 14/);}
 assert.match(root.innerHTML,/점수 시스템/);assert.match(root.innerHTML,/왕\+140/);
});
