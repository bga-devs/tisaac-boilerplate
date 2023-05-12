<?php
namespace FOO\Helpers;
use FOO\Core\Game;

class DB_Manager extends \APP_DbObject
{
  protected static $table = null;
  protected static $primary = null;
  protected static $log = null;
  protected static function cast($row)
  {
    return $row;
  }

  public static function DB($table = null)
  {
    if (is_null($table)) {
      if (is_null(static::$table)) {
        throw new \feException('You must specify the table you want to do the query on');
      }
      $table = static::$table;
    }

    $log = null;
    if (static::$log ?? Game::get()->getGameStateValue('logging') == 1) {
      $log = new Log(static::$table, static::$primary);
    }
    return new QueryBuilder(
      $table,
      function ($row) {
        return static::cast($row);
      },
      static::$primary,
      $log
    );
  }

  public static function startLog()
  {
    static::$log = true;
  }

  public static function stopLog()
  {
    static::$log = false;
    $log = new Log(static::$table, static::$primary);
    $log->clearAll();
  }

  public static function revertLogs()
  {
    $log = new Log(static::$table, static::$primary);
    $log->revertAll();
  }
}
