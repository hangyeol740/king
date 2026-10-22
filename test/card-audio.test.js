import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
test('추가된 효과음 파일 사용·스크롤 저음량/중복제한·음소거',async()=>{
 const clips=[];let now=1000,muted=false;
 class Audio{constructor(src){this.src=src;this.paused=true;this.plays=0;clips.push(this);}play(){this.plays++;this.paused=false;return Promise.resolve();}pause(){this.paused=true;}}
 const c={Audio,window:{},performance:{now:()=>now},document:{hidden:false},localStorage:{getItem:()=>muted?'off':null}};
 vm.runInNewContext(await readFile(new URL('../public/card-audio.js',import.meta.url),'utf8'),c);
 const api=c.window.kingdomCardAudio;api.play('scroll');api.play('scroll');assert.equal(clips[1].plays,1);assert.equal(clips[1].volume,.12);assert.match(clips[1].src,/card-scroll.mp3$/);
 clips[1].paused=true;now+=300;api.play('scroll');assert.equal(clips[1].plays,2);
 api.play('receive');assert.equal(clips[0].plays,1);api.play('hover');assert.equal(clips[2].plays,1);
 muted=true;api.play('receive');assert.equal(clips[0].plays,1);api.stop();assert.ok(clips.every(a=>a.paused));
});
