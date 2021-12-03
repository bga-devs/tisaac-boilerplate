<?php
namespace FOO\Core;
use foogame;

/*
 * Game: a wrapper over table object to allow more generic modules
 */
class Game
{
  public static function get()
  {
    return foogame::get();
  }
}
