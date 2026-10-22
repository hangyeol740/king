import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('배경음악은 로비에서 침묵하고 게임 종료·끄기는 재생예약을 취소',async()=>{
 const handlers={},events={},timers=new Map();let music,played=0,id=0;
 class Audio{constructor(){music=this;this.paused=true;}addEventListener(n,f){events[n]=f;}play(){played++;this.paused=false;return Promise.resolve();}pause(){this.paused=true;}}
 const context={Audio,window:{},localStorage:{getItem:()=>null,setItem(){}},document:{createElement:()=>({setAttribute(){}}),querySelector:()=>({append(){}}),addEventListener:(n,f)=>handlers[n]=f},setTimeout:(f,ms)=>{timers.set(++id,{f,ms});return id;},clearTimeout:n=>timers.delete(n)};
 vm.runInNewContext(await readFile(new URL('../public/background-music.js',import.meta.url),'utf8'),context);
 handlers.pointerdown();assert.equal(played,0);context.window.kingdomMusic.update('lobby');assert.equal(played,0);
 context.window.kingdomMusic.update('playing');assert.equal(played,1);assert.equal(music.loop,false);
 music.paused=true;events.ended();assert.equal([...timers.values()][0].ms,8000);handlers.pointerdown();assert.equal(played,1);
 const timer=[...timers.values()][0];timers.clear();timer.f();assert.equal(played,2);
 music.paused=true;events.ended();context.window.kingdomMusic.update('lobby');assert.equal(timers.size,0);assert.equal(music.paused,true);assert.equal(music.currentTime,0);
});
