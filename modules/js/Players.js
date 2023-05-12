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
          this.addCustomTooltip(`card-${card.id}`, () => {
            return _('This is a dynamic content that also support safe/help mode');
          });
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
        <div id='card-${card.id}' class='foo-card'>
          <div class='foo-card-fixed-size' data-color='${card.color}' data-value='${card.value}'></div>
        </div>
      `;
    },
  });
});
