<?php
namespace FOO\Helpers;
use FOO\Core\Game;

abstract class DB_Model extends \APP_DbObject implements \JsonSerializable
{
  protected $table = null;
  protected $primary = null;
  protected $log = null;
  /**
   * This associative array will link class attributes to db fields
   */
  protected $attributes = [];

  /**
   * Fill in class attributes based on DB entry
   */
  public function __construct($row)
  {
    foreach ($this->attributes as $attribute => $field) {
      $this->$attribute = $row[$field] ?? null;
    }
  }

  /**
   * Get the DB primary row according to attributes mapping
   */
  private function getPrimaryFieldValue()
  {
    foreach ($this->attributes as $attribute => $field) {
      if ($field == $this->primary) {
        return $this->$attribute;
      }
    }
    return null;
  }

  /*
   * Magic method that intercept not defined method and do the appropriate stuff
   */
  public function __call($method, $args)
  {
    if (preg_match('/^([gs]et|inc|is)([A-Z])(.*)$/', $method, $match)) {
      // Sanity check : does the name correspond to a declared variable ?
      $name = strtolower($match[2]) . $match[3];
      if (!\array_key_exists($name, $this->attributes)) {
        throw new \InvalidArgumentException("Attribute {$name} doesn't exist");
      }

      if ($match[1] == 'get') {
        // Basic getters
        return $this->$name;
      } elseif ($match[1] == 'is') {
        // Boolean getter
        return (bool) ($this->$name == 1);
      } elseif ($match[1] == 'set') {
        // Setters in DB and update cache
        $value = $args[0];
        $this->$name = $value;

        $updateValue = $value;
        if ($value != null) {
          $updateValue = \addslashes($value);
        }

        // $this->DB()->update([$this->attributes[$name] => \addslashes($value)], $this->getPrimaryFieldValue());
        $this->DB()->update([$this->attributes[$name] => $updateValue], $this->getPrimaryFieldValue());
        return $value;
      } elseif ($match[1] == 'inc') {
        $getter = 'get' . $match[2] . $match[3];
        $setter = 'set' . $match[2] . $match[3];
        return $this->$setter($this->$getter() + (empty($args) ? 1 : $args[0]));
      }
    } else {
      throw new \feException('Undefined method ' . $method);
      return null;
    }
  }

  /**
   * Return an array of attributes
   */
  public function jsonSerialize()
  {
    $data = [];
    foreach ($this->attributes as $attribute => $field) {
      $data[$attribute] = $this->$attribute;
    }

    return $data;
  }

  /**
   * Save query
   */
  public function save()
  {
    $id = null;
    $data = [];
    foreach ($this->attributes as $attribute => $field) {
      if ($field == $this->primary) {
        $id = $this->$attribute;
      } else {
        $data[$field] = $this->$attribute;
      }
    }

    $this->DB()->update($data, $id);
  }

  /**
   * Private DB call
   */
  private function DB()
  {
    if (is_null($this->table)) {
      throw new \feException('You must specify the table you want to do the query on');
    }

    $log = null;
    /*
    if (static::$log ?? Game::get()->getGameStateValue('logging') == 1) {
      $log = new Log(static::$table, static::$primary);
    }
    */
    return new QueryBuilder(
      $this->table,
      function ($row) {
        return $row;
      },
      $this->primary,
      $log
    );
  }
}
