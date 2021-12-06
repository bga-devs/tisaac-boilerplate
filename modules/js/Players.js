define(['dojo', 'dojo/_base/declare'], (dojo, declare) => {
  return declare('foogame.players', null, {
    // Utils to iterate over players array/object
    forEachPlayer(callback) {
      Object.values(this.gamedatas.players).forEach(callback);
    },

    getPlayerColor(pId) {
      return this.gamedatas.players[pId].color;
    },

    setupPlayers() {
      this.forEachPlayer((player) => {
        this.place('tplPlayerHand', player, 'main-container');

        player.cards.forEach((card) => {
          this.place('tplCard', card, 'player-hand-' + player.id);
        });
      });
    },

    tplPlayerHand(player) {
      return `
        <div class='player-container' style='border-color:#${player.color}'>
          <div class='player-name' style='color:#${player.color}'>${player.name}</div>
          <div class='player-hand' id="player-hand-${player.id}"></div>
        </div>
      `;
    },

    tplCard(card) {
      return `
        <div class='foo-card' data-color='${card.color}' data-value='${card.value}'></div>
      `;
    },
  });
});
