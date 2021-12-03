<?php
/**
 *------
 * BGA framework: © Gregory Isabelli <gisabelli@boardgamearena.com> & Emmanuel Colin <ecolin@boardgamearena.com>
 * foogame implementation : © Timothée Pecatte <tim.pecatte@gmail.com>, Vincent Toper <vincent.toper@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * foogame.view.php
 *
 */

require_once APP_BASE_PATH . 'view/common/game.view.php';

class view_foogame_foogame extends game_view
{
  function getGameName()
  {
    return 'foogame';
  }
  function build_page($viewArgs)
  {
  }
}
