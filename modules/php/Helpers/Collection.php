<?php
namespace FOO\Helpers;

class Collection extends \ArrayObject
{
  public function getIds()
  {
    return array_keys($this->getArrayCopy());
  }

  public function empty()
  {
    return empty($this->getArrayCopy());
  }

  public function first()
  {
    $arr = $this->toArray();
    return isset($arr[0]) ? $arr[0] : null;
  }

  public function rand()
  {
    $arr = $this->getArrayCopy();
    $key = array_rand($arr, 1);
    return $arr[$key];
  }

  public function toArray()
  {
    return array_values($this->getArrayCopy());
  }

  public function toAssoc()
  {
    return $this->getArrayCopy();
  }

  public function map($func)
  {
    return new Collection(array_map($func, $this->toAssoc()));
  }

  public function merge($arr)
  {
    return new Collection($this->toAssoc() + $arr->toAssoc());
  }

  public function reduce($func, $init)
  {
    return array_reduce($this->toArray(), $func, $init);
  }

  public function filter($func)
  {
    return new Collection(array_filter($this->toAssoc(), $func));
  }

  public function limit($n)
  {
    return new Collection(array_slice($this->toAssoc(), 0, $n, true));
  }

  public function includes($t)
  {
    return in_array($t, $this->getArrayCopy());
  }

  public function ui()
  {
    return $this->map(function ($elem) {
      return $elem->getUiData();
    })->toArray();
  }

  public function uiAssoc()
  {
    return $this->map(function ($elem) {
      return $elem->getUiData();
    })->toAssoc();
  }

  public function order($callback)
  {
    $t = $this->getArrayCopy();
    \uasort($t, $callback);
    return new Collection($t);
  }
}
