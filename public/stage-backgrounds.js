(() => {
  window.kingdomBackground = {
    choose(game) {
      if(!game)return 'castle';
      if(['expeditionSelect','expeditionJoin','expeditionCards'].includes(game.phase)){
        return game.pending?.difficulty==='high'?'cave':'forest';
      }
      if(['executionVote','mediationSupport','mediationKing','expeditionVote','redistribute','market','day'].includes(game.phase))return 'village';
      return 'castle';
    },
    update(game){document.body.dataset.stageBackground=this.choose(game);}
  };
})();
