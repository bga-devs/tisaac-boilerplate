<?php
namespace FOO\Core;

class Stats
{
  /*************************
   **** GENERIC METHODS ****
   *************************/
  protected static function init($type, $name, $value = 0)
  {
    Game::get()->initStat($type, $name, $value);
  }

  public static function inc($name, $player = null, $value = 1, $log = true)
  {
    $pId = is_null($player) ? null : (is_int($player) ? $player : $player->getId());
    Game::get()->incStat($value, $name, $pId);
  }

  protected static function get($name, $player = null)
  {
    Game::get()->getStat($name, $player);
  }

  protected static function set($value, $name, $player = null)
  {
    $pId = is_null($player) ? null : (is_int($player) ? $player : $player->getId());
    Game::get()->setStat($value, $name, $pId);
  }
  /*
   * Create and store a stat declared but not present in DB yet
   *  (only happens when adding stats while a game is running)
   */
  public static function checkExistence()
  {
    $default = [
      'int' => 0,
      'float' => 0,
      'bool' => false,
      'str' => '',
    ];

    // Fetch existing stats, all stats
    $stats = Game::get()->getStatTypes();
    $existingStats = self::DB()
      ->get()
      ->map(function ($stat) {
        return $stat['type'] . ',' . ($stat['pId'] == null ? 'table' : 'player');
      })
      ->toArray();

    $values = [];
    // Deal with table stats first
    foreach ($stats['table'] as $stat) {
      if ($stat['id'] < 10) {
        continue;
      }
      if (!in_array($stat['id'] . ',table', $existingStats)) {
        $values[] = [
          'stats_type' => $stat['id'],
          'stats_player_id' => null,
          'stats_value' => $default[$stat['type']],
        ];
      }
    }

    // Deal with player stats
    $playerIds = Players::getAll()->getIds();
    foreach ($stats['player'] as $stat) {
      if ($stat['id'] < 10) {
        continue;
      }
      if (!in_array($stat['id'] . ',player', $existingStats)) {
        foreach ($playerIds as $i => $pId) {
          $value = $default[$stat['type']];
          // if ($stat['id'] == STAT_POSITION) {
          //   $value = $i + 1;
          // }
          // if ($stat['id'] == STAT_FIRST_PLAYER && $i == 0) {
          //   $value = 1;
          // }

          $values[] = [
            'stats_type' => $stat['id'],
            'stats_player_id' => $pId,
            'stats_value' => $value,
          ];
        }
      }
    }

    // Insert if needed
    if (!empty($values)) {
      self::DB()
        ->multipleInsert(['stats_type', 'stats_player_id', 'stats_value'])
        ->values($values);
    }
  }


  /*********************
   **********************
   *********************/
  public static function setupNewGame()
  {
  }
}

?>
