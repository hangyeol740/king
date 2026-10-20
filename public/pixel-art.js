/* Small, hand-drawn pixel sprites; shared by hands, inspection and shops. */
(() => {
  const rect = (x,y,w,h,c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  const colors = {gold:'#d5a64d', light:'#f7e1a0', metal:'#9eafb0', shade:'#4e6370', red:'#a44235', wood:'#725030', ink:'#17120f'};
  const art = {};
  const draw = (type, fn) => { let s=''; const r=(...a)=>{s+=rect(...a);}; fn(r); art[type]=s; };
  const sword = (type, blade, edge, jewel, extra) => draw(type,r=>{
    r(14,5,4,18,blade);r(14,5,2,16,edge);r(15,3,2,2,edge);
    r(9,22,14,3,colors.gold);r(10,21,2,2,colors.light);r(20,21,2,2,colors.light);
    r(14,25,4,5,colors.wood);r(15,25,1,5,colors.gold);r(13,30,6,2,jewel);
    if(extra)extra(r);
  });
  sword('sword',colors.metal,'#e6e6cc',colors.gold);
  sword('eternalSword','#6a9d89','#bce1b6',colors.gold);
  sword('reinforcedSword','#7899b8','#d5e1df',colors.gold,r=>r(10,24,12,2,colors.shade));
  sword('ironSword','#ad4c44','#e79b72',colors.red,r=>{r(6,6,2,2,colors.gold);r(24,12,2,2,colors.gold);});
  sword('shiningSword','#d9bc63','#fff5cc',colors.gold,r=>{r(5,10,6,2,colors.light);r(7,8,2,6,colors.light);r(23,6,4,2,colors.light);});
  sword('northSword','#739dbd','#cbeced','#97c7db',r=>{r(5,12,6,2,'#a2d6e0');r(7,10,2,6,'#a2d6e0');r(24,18,3,2,'#a2d6e0');});
  sword('flameSword','#b86635','#f5bc61',colors.red,r=>{r(10,8,3,12,'#af412b');r(9,14,2,5,'#e78335');r(19,12,3,9,'#e78335');r(21,8,2,8,'#af412b');});
  draw('resource',r=>{r(5,21,22,8,colors.wood);r(5,21,22,2,colors.gold);r(7,24,18,1,'#a07643');r(9,16,8,5,colors.shade);r(11,12,5,4,colors.metal);r(18,14,6,7,'#789480');r(20,11,2,3,'#b1bc87');});
  draw('rebellion',r=>{r(9,5,2,26,colors.wood);r(11,5,16,11,colors.red);r(23,14,4,5,colors.red);r(12,6,2,9,'#d16b4b');r(7,30,6,2,colors.gold);});
  draw('agitation',r=>{r(7,13,18,17,colors.shade);r(7,10,4,6,colors.metal);r(14,10,4,6,colors.metal);r(21,10,4,6,colors.metal);r(13,21,6,9,colors.ink);r(15,4,2,7,colors.wood);r(17,4,9,4,colors.red);});
  for(const type of ['magic','eternalMagic','highMagic'])draw(type,r=>{
    const c=type==='eternalMagic'?'#7dac9c':type==='highMagic'?colors.gold:'#a08ac2';
    r(7,10,18,17,'#41334d');r(9,8,14,2,c);r(10,12,12,13,c);r(15,14,2,9,colors.light);r(12,17,8,2,colors.light);r(5,28,22,2,colors.gold);r(7,27,18,1,colors.wood);r(13,3,2,3,c);r(22,4,3,2,c);
  });
  for(const type of ['infantry','officer'])draw(type,r=>{
    r(12,5,8,8,colors.metal);r(10,8,12,3,colors.shade);r(14,11,4,2,colors.ink);
    r(10,14,12,10,type==='officer'?colors.gold:colors.shade);r(14,15,4,8,colors.light);
    r(10,24,4,7,colors.wood);r(18,24,4,7,colors.wood);r(6,16,5,10,colors.red);r(24,10,2,21,colors.metal);
    if(type==='officer'){r(14,2,4,3,colors.red);r(18,3,5,2,colors.red);}
  });
  for(const type of ['weapon','warWeapon'])draw(type,r=>{
    r(5,24,22,3,colors.wood);r(8,27,5,5,colors.shade);r(21,27,5,5,colors.shade);
    r(8,15,18,8,colors.shade);r(8,15,18,2,colors.metal);r(5,12,6,12,colors.wood);
    r(21,12,6,11,colors.wood);r(13,18,12,2,colors.ink);r(17,7,3,9,colors.metal);
    if(type==='warWeapon'){r(10,6,4,8,colors.gold);r(22,4,3,9,colors.red);}
  });
  draw('bomb',r=>{r(10,14,14,13,colors.shade);r(8,17,18,7,colors.shade);r(11,15,3,5,colors.metal);r(14,11,6,4,colors.wood);r(18,7,2,5,colors.gold);r(20,5,4,3,'#edac50');r(23,3,2,2,colors.light);});
  draw('church',r=>{r(7,18,20,13,colors.shade);r(11,13,12,5,colors.metal);r(14,9,6,4,colors.metal);r(16,3,2,8,colors.gold);r(13,5,8,2,colors.gold);r(14,23,6,8,colors.ink);r(9,21,2,4,colors.light);r(23,21,2,4,colors.light);});
  draw('evangelism',r=>{r(4,13,12,16,colors.wood);r(17,13,12,16,colors.wood);r(6,11,10,16,colors.light);r(17,11,10,16,'#c4ae7e');r(16,12,1,18,colors.gold);for(let y=15;y<25;y+=4){r(8,y,6,1,colors.wood);r(19,y,6,1,colors.wood);}r(14,3,5,6,colors.gold);});
  draw('huntingAxe',r=>{r(14,8,3,24,colors.wood);r(8,7,6,12,colors.shade);r(4,10,8,7,colors.metal);r(4,11,2,5,'#e6e6cc');r(17,8,7,9,colors.shade);r(21,10,5,5,colors.metal);});
  window.kingdomPixelArt = {
    card(type){return `<svg class="pixel-card-art" viewBox="0 0 32 36" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${art[type]||art.resource}</svg>`;},
    forDefinition(d){const type=Object.keys(rules.cards).find(t=>rules.cards[t]===d);return this.card(type);}
  };
})();
