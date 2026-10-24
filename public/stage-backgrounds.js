(() => {
  const moon=new Image();moon.onload=()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=Math.max(1,Math.round(320*moon.naturalHeight/moon.naturalWidth));const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;context.drawImage(moon,0,0,canvas.width,canvas.height);document.body.style.setProperty('--full-moon-pixel',`url("${canvas.toDataURL('image/png')}")`);};moon.src='/assets/full-moon.webp';
  window.kingdomBackground = {
    choose(game) {
      if(!game)return 'castle';
      if(game.fullMoon&&['night','assassinNight','bishopNight'].includes(game.phase))return 'full-moon';
      if(['expeditionSelect','expeditionJoin','expeditionCards'].includes(game.phase)){
        return game.pending?.difficulty==='high'?'cave':'forest';
      }
      if(['executionVote','mediationSupport','mediationKing','expeditionVote','redistribute','market','day'].includes(game.phase))return 'village';
      return 'castle';
    },
    update(game){document.body.dataset.stageBackground=this.choose(game);document.body.classList.toggle('full-moon-night',this.choose(game)==='full-moon');}
  };
})();
