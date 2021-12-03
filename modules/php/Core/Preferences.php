<?php
namespace FOO\Core;
use FOO\Core\Game;

/*
 * User preferences
 */
class Preferences extends \FOO\Helpers\DB_Manager
{
  protected static $table = 'user_preferences';
  protected static $primary = 'id';
  protected static $log = false; // Turn off log to avoid undoing changes in this table
  protected static function cast($row)
  {
    return $row;
  }

  public static function getLocalPrefsData()
  {
    return [];
  }

  /*
   * Setup new game
   */
  public static function setupNewGame($players, $prefs)
  {
    // Load user preferences
    include dirname(__FILE__) . '/../../../gameoptions.inc.php';

    $preferences = $game_preferences + self::getLocalPrefsData();
    $values = [];
    foreach ($preferences as $id => $data) {
      $defaultValue = $data['default'] ?? array_keys($data['values'])[0];

      foreach ($players as $pId => $infos) {
        $values[] = [
          'player_id' => $pId,
          'pref_id' => $id,
          'pref_value' => $prefs[$pId][$id] ?? $defaultValue,
        ];
      }
    }

    if (!empty($values)) {
      self::DB()
        ->multipleInsert(['player_id', 'pref_id', 'pref_value'])
        ->values($values);
    }
  }

  /*
   * Check if stored user preferences match declared preferences, and create otherwise
   */
  public static function checkExistence()
  {
    // Load user preferences
    include dirname(__FILE__) . '/../../../gameoptions.inc.php';

    $playerIds = array_keys(Game::get()->loadPlayersBasicInfos());
    $preferences = $game_preferences + self::getLocalPrefsData();
    $values = [];
    foreach ($preferences as $id => $data) {
      $defaultValue = $data['default'] ?? array_keys($data['values'])[0];

      foreach ($playerIds as $pId) {
        if (self::get($pId, $id) == null) {
          $values[] = [
            'player_id' => $pId,
            'pref_id' => $id,
            'pref_value' => $defaultValue,
          ];
        }
      }
    }

    if (!empty($values)) {
      self::DB()
        ->multipleInsert(['player_id', 'pref_id', 'pref_value'])
        ->values($values);
    }
  }

  /**
   * Get UI data (useful to check inconsistency)
   */
  public static function getUiData($pId)
  {
    self::checkExistence();
    return self::DB()
      ->where('player_id', $pId)
      ->get()
      ->toArray();
  }

  /*
   * Get a user preference
   */
  public static function get($pId, $prefId)
  {
    return self::DB()
      ->select(['pref_value'])
      ->where('player_id', $pId)
      ->where('pref_id', $prefId)
      ->get(true)['pref_value'] ?? null;
  }

  /*
   * Set a user preference
   */
  public static function set($pId, $prefId, $value)
  {
    return self::DB()
      ->update(['pref_value' => $value])
      ->where('player_id', $pId)
      ->where('pref_id', $prefId)
      ->run();
  }
}
