<?php
namespace FOO\Helpers;

abstract class Utils extends \APP_DbObject
{
  public static function filter(&$data, $filter)
  {
    $data = array_values(array_filter($data, $filter));
  }

  public static function die($args = null)
  {
    if (is_null($args)) {
      throw new \BgaVisibleSystemException(implode('<br>', self::$logmsg));
    }
    throw new \BgaVisibleSystemException(json_encode($args));
  }

  public static function diff(&$data, $arr)
  {
    $data = array_values(array_diff($data, $arr));
  }

  public static function shuffle_assoc(&$array)
  {
    $keys = array_keys($array);
    shuffle($keys);

    foreach ($keys as $key) {
      $new[$key] = $array[$key];
    }

    $array = $new;
    return true;
  }
}
