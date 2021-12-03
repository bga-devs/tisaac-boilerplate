define(['dojo', 'dojo/_base/declare'], (dojo, declare) => {
  return declare('foogame.players', null, {
    // Utils to iterate over players array/object
    forEachPlayer(callback) {
      Object.values(this.gamedatas.players).forEach(callback);
    },

    getPlayerColor(pId) {
      return this.gamedatas.players[pId].color;
    },

    setupPlayers() {},
  });
});
