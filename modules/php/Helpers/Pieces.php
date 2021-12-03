<?php
namespace FOO\Helpers;

/*
 * This is a generic class to manage game pieces.
 *
 * On DB side this is based on a standard table with the following fields:
 * %prefix_%id (string), %prefix_%location (string), %prefix_%state (int)
 *
 *
 * CREATE TABLE IF NOT EXISTS `token` (
 * `token_id` varchar(32) NOT NULL,
 * `token_location` varchar(32) NOT NULL,
 * `token_state` int(10),
 * PRIMARY KEY (`token_id`)
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
 *
 * CREATE TABLE IF NOT EXISTS `card` (
 * `card_id` int(32) NOT NULL AUTO_INCREMENT,,
 * `card_location` varchar(32) NOT NULL,
 * `card_state` int(10),
 * PRIMARY KEY (`card_id`)
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
 *
 */

class Pieces extends DB_Manager
{
  protected static $table = null;
  protected static $cast = null;

  protected static $prefix = 'piece_';
  protected static $autoIncrement = true;
  protected static $primary;
  protected static $autoremovePrefix = true;
  protected static $autoreshuffle = false; // If true, a new deck is automatically formed with a reshuffled discard as soon at is needed
  protected static $autoreshuffleListener = null; // Callback to a method called when an autoreshuffle occurs
  // autoreshuffleListener = array( 'obj' => object, 'method' => method_name )
  // If defined, tell the name of the deck and what is the corresponding discard (ex : "mydeck" => "mydiscard")
  protected static $autoreshuffleCustom = [];
  protected static $customFields = [];
  protected static $gIndex = [];

  public static function DB($table = null)
  {
    static::$primary = static::$prefix . 'id';
    return parent::DB(static::$table);
  }

  // TODO : putDeckOnTop
  // TODO : pickRandomFor
  // TODO : collection filter

  /************************************
   *************************************
   ********* QUERY BUILDER *************
   *************************************
   ************************************/

  /**
   * Overwritable function to add base filter to any query
   * => useful if two kind of "stuff" cohabitates
   */
  protected static function addBaseFilter(&$query)
  {
  }

  /****
   * Return the basic select query fetching basic fields and custom fields
   */
  final static function getSelectQuery()
  {
    $basic = [
      'id' => static::$prefix . 'id',
      'location' => static::$prefix . 'location',
      'state' => static::$prefix . 'state',
    ];
    if (!static::$autoremovePrefix) {
      $basic = array_values($basic);
    }

    $query = self::DB()->select(array_merge($basic, static::$customFields));
    static::addBaseFilter($query);
    return $query;
  }

  final static function getUpdateQuery($ids = [], $location = null, $state = null)
  {
    $data = [];
    if (!is_null($location)) {
      $data[static::$prefix . 'location'] = $location;
    }
    if (!is_null($state)) {
      $data[static::$prefix . 'state'] = $state;
    }

    $query = self::DB()->update($data);
    if (!is_null($ids)) {
      $query = $query->whereIn(static::$prefix . 'id', is_array($ids) ? $ids : [$ids]);
    }

    static::addBaseFilter($query);
    return $query;
  }

  /****
   * Return a select query with a where condition
   */
  protected function addWhereClause(&$query, $id = null, $location = null, $state = null)
  {
    if (!is_null($id)) {
      $whereOp = strpos($id, '%') !== false ? 'LIKE' : '=';
      $query = $query->where(static::$prefix . 'id', $whereOp, $id);
    }

    if (!is_null($location)) {
      $whereOp = strpos($location, '%') !== false ? 'LIKE' : '=';
      $query = $query->where(static::$prefix . 'location', $whereOp, $location);
    }

    if (!is_null($state)) {
      $query = $query->where(static::$prefix . 'state', $state);
    }

    return $query;
  }

  /****
   * Append the basic select query with a where clause
   */
  public static function getSelectWhere($id = null, $location = null, $state = null)
  {
    $query = self::getSelectQuery();
    self::addWhereClause($query, $id, $location, $state);
    return $query;
  }

  /************************************
   *************************************
   ********* SANITY CHECKS *************
   *************************************
   ************************************/

  /*
   * Check that the location only contains alphanum and underscore character
   *  -> if the location is an array, implode it using underscores
   */
  final static function checkLocation(&$location, $like = false)
  {
    if (is_null($location)) {
      throw new \BgaVisibleSystemException('Class Pieces: location cannot be null');
    }

    if (is_array($location)) {
      $delim = '_';
      foreach ($location as $l) {
        if (strpos($l, '%') !== false) {
          $delim = '\\_';
        }
      }
      $location = implode($delim, $location);
    }

    $extra = $like ? '%\\\\' : '';
    if (preg_match("/^[A-Za-z0-9${extra}-][A-Za-z_0-9${extra}-]*$/", $location) == 0) {
      throw new \BgaVisibleSystemException(
        "Class Pieces: location must be alphanum and underscore non empty string '$location'"
      );
    }
  }

  /*
   * Check that the id is alphanum and underscore
   */
  final static function checkId(&$id, $like = false)
  {
    if (is_null($id)) {
      throw new \BgaVisibleSystemException('Class Pieces: id cannot be null');
    }

    $extra = $like ? '%' : '';
    if (preg_match("/^[A-Za-z_0-9${extra}]+$/", $id) == 0) {
      throw new \BgaVisibleSystemException("Class Pieces: id must be alphanum and underscore non empty string '$id'");
    }
  }

  final function checkIdArray($arr)
  {
    if (is_null($arr)) {
      throw new \BgaVisibleSystemException('Class Pieces: tokens cannot be null');
    }

    if (!is_array($arr)) {
      throw new \BgaVisibleSystemException('Class Pieces: tokens must be an array');
      foreach ($arr as $id) {
        self::checkId($id);
      }
    }
  }

  /*
   * Check that the state is an integer
   */
  final static function checkState($state, $canBeNull = false)
  {
    if (is_null($state) && !$canBeNull) {
      throw new \BgaVisibleSystemException('Class Pieces: state cannot be null');
    }

    if (!is_null($state) && preg_match("/^-*[0-9]+$/", $state) == 0) {
      throw new \BgaVisibleSystemException('Class Pieces: state must be integer number');
    }
  }

  /*
   * Check that a given variable is a positive integer
   */
  final static function checkPosInt($n)
  {
    if ($n && preg_match("/^[0-9]+$/", $n) == 0) {
      throw new \BgaVisibleSystemException('Class Pieces: number of pieces must be integer number');
    }
  }

  /************************************
   *************************************
   ************** GETTERS **************
   *************************************
   ************************************/

  /**
   * Get all the pieces
   */
  public static function getAll()
  {
    return self::getSelectQuery()->get();
  }

  /**
   * Get specific piece by id
   */
  public static function get($id, $raiseExceptionIfNotEnough = true)
  {
    $result = self::getMany($id, $raiseExceptionIfNotEnough);
    return $result->count() == 1 ? $result->first() : $result;
  }

  public static function getMany($ids, $raiseExceptionIfNotEnough = true)
  {
    if (!is_array($ids)) {
      $ids = [$ids];
    }

    self::checkIdArray($ids);
    if (empty($ids)) {
      return new Collection([]);
    }

    $result = self::getSelectQuery()
      ->whereIn(static::$prefix . 'id', $ids)
      ->get(false);
    if (count($result) != count($ids) && $raiseExceptionIfNotEnough) {
      throw new \feException('Class Pieces: getMany, some pieces have not been found !' . json_encode($ids));
    }

    return $result;
  }

  public static function getSingle($id, $raiseExceptionIfNotEnough = true)
  {
    $result = self::getMany([$id], $raiseExceptionIfNotEnough);
    return $result->count() == 1 ? $result->first() : null;
  }

  /**
   * Get specific piece by id
   */
  public static function getState($id)
  {
    $res = self::get($id);
    return is_null($res) ? null : $res[(static::$autoremovePrefix ? '' : static::$prefix) . 'state'];
  }

  public static function getLocation($id)
  {
    $res = self::get($id);
    return is_null($res) ? null : $res[(static::$autoremovePrefix ? '' : static::$prefix) . 'location'];
  }

  /**
   * Get max or min state of the specific location
   */
  public static function getExtremePosition($getMax, $location, $id = null)
  {
    $whereOp = self::checkLocation($location, true);
    $query = self::DB();
    self::addWhereClause($query, $id, $location);
    return $query->func($getMax ? 'MAX' : 'MIN', static::$prefix . 'state') ?? 0;
  }

  /**
   * Return "$nbr" piece on top of this location, top defined as item with higher state value
   */
  public static function getTopOf($location, $n = 1, $returnValueIfOnlyOneRow = true)
  {
    self::checkLocation($location);
    self::checkPosInt($n);
    return self::getSelectWhere(null, $location)
      ->orderBy(static::$prefix . 'state', 'DESC')
      ->limit($n)
      ->get($returnValueIfOnlyOneRow);
  }

  /**
   * Return all pieces in specific location
   * note: if "order by" is used, result object is NOT indexed by ids
   */
  public static function getInLocationQ($location, $state = null, $orderBy = null)
  {
    self::checkLocation($location, true);
    self::checkState($state, true);

    $query = self::getSelectWhere(null, $location, $state);
    if (!is_null($orderBy)) {
      $query = $query->orderBy($orderBy);
    }

    return $query;
  }

  public static function getInLocation($location, $state = null, $orderBy = null)
  {
    return self::getInLocationQ($location, $state, $orderBy)->get();
  }

  public static function getInLocationOrdered($location, $state = null)
  {
    return self::getInLocation($location, $state, [static::$prefix . 'state', 'ASC']);
  }

  /**
   * Return number of pieces in specific location
   */
  public static function countInLocation($location, $state = null)
  {
    self::checkLocation($location, true);
    self::checkState($state, true);
    return self::getSelectWhere(null, $location, $state)->count();
  }

  /************************************
   *************************************
   ************** SETTERS **************
   *************************************
   ************************************/
  public static function setState($id, $state)
  {
    self::checkState($state);
    self::checkId($id);
    return self::getUpdateQuery($id, null, $state)->run();
  }

  /*
   * Move one (or many) pieces to given location
   */
  public static function move($ids, $location, $state = 0)
  {
    if (!is_array($ids)) {
      $ids = [$ids];
    }

    self::checkLocation($location);
    self::checkState($state);
    self::checkIdArray($ids);
    return self::getUpdateQuery($ids, $location, $state)->run();
  }

  /*
   *  Move all tokens from a location to another
   *  !!! state is reset to 0 or specified value !!!
   *  if "fromLocation" and "fromState" are null: move ALL cards to specific location
   */
  public static function moveAllInLocation($fromLocation, $toLocation, $fromState = null, $toState = 0)
  {
    if (!is_null($fromLocation)) {
      self::checkLocation($fromLocation);
    }
    self::checkLocation($toLocation);

    $query = self::getUpdateQuery(null, $toLocation, $toState);
    self::addWhereClause($query, null, $fromLocation, $fromState);
    return $query->run();
  }

  /**
   * Move all pieces from a location to another location arg stays with the same value
   */
  public static function moveAllInLocationKeepState($fromLocation, $toLocation)
  {
    self::checkLocation($fromLocation);
    self::checkLocation($toLocation);
    return self::moveAllInLocation($fromLocation, $toLocation, null, null);
  }

  /*
   * Pick the first "$nbr" pieces on top of specified deck and place it in target location
   * Return pieces infos or void array if no card in the specified location
   */
  public static function pickForLocation($nbr, $fromLocation, $toLocation, $state = 0, $deckReform = true)
  {
    self::checkLocation($fromLocation);
    self::checkLocation($toLocation);
    $pieces = self::getTopOf($fromLocation, $nbr, false);
    $ids = $pieces->getIds();
    self::getUpdateQuery($ids, $toLocation, $state)->run();
    $pieces = self::getMany($ids);

    // No more pieces in deck & reshuffle is active => form another deck
    if (
      array_key_exists($fromLocation, static::$autoreshuffleCustom) &&
      count($pieces) < $nbr &&
      static::$autoreshuffle &&
      $deckReform
    ) {
      $missing = $nbr - count($pieces);
      self::reformDeckFromDiscard($fromLocation);
      $pieces = $pieces->merge(self::pickForLocation($missing, $fromLocation, $toLocation, $state, false)); // Note: block another deck reform
    }

    return $pieces;
  }

  public static function pickOneForLocation($fromLocation, $toLocation, $state = 0, $deckReform = true)
  {
    return self::pickForLocation(1, $fromLocation, $toLocation, $state, $deckReform)->first();
  }

  /*
   * Reform a location from another location when enmpty
   */
  public static function reformDeckFromDiscard($fromLocation)
  {
    self::checkLocation($fromLocation);
    if (!array_key_exists($fromLocation, static::$autoreshuffleCustom)) {
      throw new \BgaVisibleSystemException(
        "Class Pieces:reformDeckFromDiscard: Unknown discard location for $fromLocation !"
      );
    }

    $discard = static::$autoreshuffleCustom[$fromLocation];
    self::checkLocation($discard);
    self::moveAllInLocation($discard, $fromLocation);
    self::shuffle($fromLocation);
    if (static::$autoreshuffleListener) {
      $obj = static::$autoreshuffleListener['obj'];
      $method = static::$autoreshuffleListener['method'];
      $obj->$method($fromLocation);
    }
  }

  /*
   * Shuffle pieces of a specified location, result of the operation will changes state of the piece to be a position after shuffling
   */
  public static function shuffle($location)
  {
    self::checkLocation($location);
    $pieces = self::getInLocation($location)->getIds();
    shuffle($pieces);
    foreach ($pieces as $state => $id) {
      self::getUpdateQuery($id, null, $state)->run();
    }
  }

  // Move a card to a specific location where card are ordered. If location_arg place is already taken, increment
  // all tokens after location_arg in order to insert new card at this precise location
  public static function insertAt($id, $location, $state = 0)
  {
    self::checkLocation($location);
    self::checkState($state);
    $p = static::$prefix;
    self::DB()
      ->inc([$p . 'state' => 1])
      ->where($p . 'location', $location)
      ->where($p . 'state', '>=', $state)
      ->run();
    self::move($id, $location, $state);
  }

  public static function insertOnTop($id, $location)
  {
    $pos = self::getExtremePosition(true, $location);
    self::insertAt($id, $location, $pos + 1);
  }

  public static function insertAtBottom($id, $location)
  {
    $pos = self::getExtremePosition(false, $location);
    self::insertAt($id, $location, $pos - 1);
  }

  /************************************
   ******** CREATE NEW PIECES **********
   ************************************/

  /* This inserts new records in the database.
   * Generically speaking you should only be calling during setup
   *  with some rare exceptions.
   *
   * Pieces is an array with at least the following fields:
   * [
   *   [
   *     "id" => <unique id>    // This unique alphanum and underscore id, use {INDEX} to replace with index if 'nbr' > 1, i..e "meeple_{INDEX}_red"
   *     "nbr" => <nbr>           // Number of tokens with this id, optional default is 1. If nbr >1 and id does not have {INDEX} it will throw an exception
   *     "nbrStart" => <nbr>           // Optional, if the indexing does not start at 0
   *     "location" => <location>       // Optional argument specifies the location, alphanum and underscore
   *     "state" => <state>             // Optional argument specifies integer state, if not specified and $token_state_global is not specified auto-increment is used
   */

  function create($pieces, $globalLocation = null, $globalState = null, $globalId = null)
  {
    $pos = is_null($globalLocation) ? 0 : self::getExtremePosition(true, $globalLocation) + 1;

    $values = [];
    $ids = [];
    foreach ($pieces as $info) {
      $n = $info['nbr'] ?? 1;
      $start = $info['nbrStart'] ?? 0;
      $id = $info['id'] ?? $globalId;
      $location = $info['location'] ?? $globalLocation;
      $state = $info['state'] ?? $globalState;
      if (is_null($state)) {
        $state = $location == $globalLocation ? $pos++ : 0;
      }

      // SANITY
      if (is_null($id) && !static::$autoIncrement) {
        throw new \BgaVisibleSystemException('Class Pieces: create: id cannot be null if not autoincrement');
      }

      if (is_null($location)) {
        throw new \BgaVisibleSystemException(
          'Class Pieces : create location cannot be null (set per token location or location_global'
        );
      }
      self::checkLocation($location);

      for ($i = $start; $i < $n + $start; $i++) {
        $data = [];
        if (static::$autoIncrement) {
          $data = [$location, $state];
        } else {
          $nId = preg_replace('/\{INDEX\}/', $id == $globalId ? count($ids) : $i, $id);
          self::checkId($nId);
          $data = [$nId, $location, $state];
          $ids[] = $nId;
        }

        foreach (static::$customFields as $field) {
          $data[] = $info[$field] ?? null;
        }

        $values[] = $data;
      }
    }

    $p = static::$prefix;
    $fields = static::$autoIncrement ? [$p . 'location', $p . 'state'] : [$p . 'id', $p . 'location', $p . 'state'];
    foreach (static::$customFields as $field) {
      $fields[] = $field;
    }

    // With auto increment, we compute the set of all consecutive ids
    return self::DB()
      ->multipleInsert($fields)
      ->values($values);
  }

  /*
   * Create a single token
   */
  function singleCreate($token)
  {
    $tokens = self::create([$token]);
    return self::get(is_array($tokens) ? $tokens[0] : $tokens);
  }
}
