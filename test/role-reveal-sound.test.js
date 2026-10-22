import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('시작 파일은 역할 연출당 한번만 재생하고 음소거를 준수',async()=>{
 let clip,muted=false;
 class Audio{constructor(src){this.src=src;this.plays=0;clip=this;}play(){this.plays++;return Promise.resolve();}pause(){}}
 const element=()=>({setAttribute(){},append(){},remove(){}});
 const c={Audio,window:{},localStorage:{getItem:()=>muted?'off':null},document:{createElement:element,body:element(),querySelector:()=>null},setTimeout:()=>1,clearTimeout(){}};
 vm.runInNewContext(await readFile(new URL('../public/role-reveal.js',import.meta.url),'utf8'),c);
 const s={code:'A',status:'playing',me:{id:'p',role:'king'},game:{startedAt:1}};
 c.window.kingdomRoleReveal.show(s);c.window.kingdomRoleReveal.show(s);
 assert.equal(clip.src,'/assets/game-start.mp3');assert.equal(clip.plays,1);assert.equal(clip.loop,false);
 muted=true;c.window.kingdomRoleReveal.show({...s,game:{startedAt:2}});assert.equal(clip.plays,1);
});
