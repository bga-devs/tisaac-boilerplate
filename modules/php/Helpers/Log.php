<?php
namespace FOO\Helpers;
use FOO\Core\Game;
use FOO\Core\Notifications;
use FOO\Managers\Players;

/**
 * Class that allows to log DB change: useful for undo feature
 *
 * Associated DB table :
 *  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
 *  `move_id` int(10),
 *  `table` varchar(32) NOT NULL,
 *  `primary` varchar(32) NOT NULL,
 *  `type` varchar(32) NOT NULL,
 *  `affected` JSON,
 */

class Log extends \APP_DbObject
{
  public function enable()
  {
    Game::get()->setGameStateValue('logging', 1);
  }

  public function disable()
  {
    Game::get()->setGameStateValue('logging', 0);
  }

  /**
   * Add an entry
   */
  public function addEntry($entry)
  {
    if (isset($entry['affected'])) {
      $entry['affected'] = \json_encode($entry['affected']);
    }
    if (!isset($entry['table'])) {
      $entry['table'] = '';
    }
    if (!isset($entry['primary'])) {
      $entry['primary'] = '';
    }

    $entry['move_id'] = self::getUniqueValueFromDB('SELECT global_value FROM global WHERE global_id = 3');
    $query = new QueryBuilder('log', null, 'id');
    return $query->insert($entry);
  }

  // Create a new checkpoint : anything before that checkpoint cannot be undo (unless in studio)
  public function checkpoint()
  {
    self::clearUndoableStepNotifications();
    return self::addEntry(['type' => 'checkpoint']);
  }

  // Create a new step to allow undo step-by-step
  public function step()
  {
    return self::addEntry(['type' => 'step']);
  }

  // Log the start of engine to allow "restart turn"
  public function startEngine()
  {
    if (!Globals::isSolo()) {
      self::checkpoint();
    }

    return self::addEntry(['type' => 'engine']);
  }

  // Find the last checkpoint
  public function getLastCheckpoint($includeEngineStarts = false)
  {
    $query = new QueryBuilder('log', null, 'id');
    $query = $query->select(['id']);
    if ($includeEngineStarts) {
      $query = $query->whereIn('type', ['checkpoint', 'engine']);
    } else {
      $query = $query->where('type', 'checkpoint');
    }

    $log = $query
      ->orderBy('id', 'DESC')
      ->limit(1)
      ->get()
      ->first();

    return is_null($log) ? 1 : $log['id'];
  }

  // Find all the moments available to undo
  public function getUndoableSteps($onlyIds = true)
  {
    $checkpoint = self::getLastCheckpoint();
    $query = new QueryBuilder('log', null, 'id');
    $logs = $query
      ->select(['id', 'move_id'])
      ->where('type', 'step')
      ->where('id', '>', $checkpoint)
      ->orderBy('id', 'DESC')
      ->get();
    return $onlyIds ? $logs->getIds() : $logs;
  }

  /**
   * Revert all the way to the last checkpoint or the last start of turn
   */
  public function undoTurn()
  {
    $checkpoint = static::getLastCheckpoint(true);
    return self::revertTo($checkpoint);
  }

  /**
   * Revert to a given step (checking first that it exists)
   */
  public function undoToStep($stepId)
  {
    $query = new QueryBuilder('log', null, 'id');
    $step = $query
      ->where('id', '=', $stepId)
      ->get()
      ->first();
    if (is_null($step)) {
      throw new \BgaVisibleSystemException('Cant undo here');
    }

    self::revertTo($stepId - 1);
  }

  /**
   * Revert all the logged changes up to an id
   */
  public function revertTo($id)
  {
    $query = new QueryBuilder('log', null, 'id');
    $logs = $query
      ->select(['id', 'table', 'primary', 'type', 'affected', 'move_id'])
      ->where('id', '>', $id)
      ->orderBy('id', 'DESC')
      ->get();

    $moveIds = [];
    foreach ($logs as $log) {
      if (in_array($log['type'], ['step', 'engine'])) {
        continue;
      }

      $log['affected'] = json_decode($log['affected'], true);
      $moveIds[] = intval($log['move_id']);

      foreach ($log['affected'] as $row) {
        $q = new QueryBuilder($log['table'], null, $log['primary']);

        if ($log['type'] != 'create') {
          foreach ($row as $key => $val) {
            if (isset($row[$key])) {
              $row[$key] = str_replace("'", "\\'", \stripcslashes($val));
            }
          }
        }

        // UNDO UPDATE -> NEW UPDATE
        if ($log['type'] == 'update') {
          $q->update($row)->run($row[$log['primary']]);
        }
        // UNDO DELETE -> CREATE
        elseif ($log['type'] == 'delete') {
          $q->insert($row);
        }
        // UNDO CREATE -> DELETE
        elseif ($log['type'] == 'create') {
          $q->delete()->run($row);
        }
      }
    }

    // Clear logs
    $query = new QueryBuilder('log', null, 'id');
    $query
      ->where('id', '>', $id)
      ->delete()
      ->run();

    // Cancel the game notifications
    $query = new QueryBuilder('gamelog', null, 'gamelog_packet_id');
    if (!empty($moveIds)) {
      $query
        ->update(['cancel' => 1])
        ->whereIn('gamelog_move_id', $moveIds)
        ->run();
      $notifIds = self::getCanceledNotifIds();
      Notifications::clearTurn(Players::getCurrent(), $notifIds);
    }

    // Force to clear cached informations
    Globals::fetch();

    // Notify
    $datas = Game::get()->getAllDatas();
    Notifications::refreshUI($datas);
    $player = Players::getCurrent();
    Notifications::refreshHand($player, $player->getHand()->ui());

    // Force notif flush to be able to delete "restart turn" notif
    Game::get()->sendNotifications();
    if (!empty($moveIds)) {
      // Delete notifications
      $query = new QueryBuilder('gamelog', null, 'gamelog_packet_id');
      $query
        ->delete()
        ->where('gamelog_move_id', '>=', min($moveIds))
        ->run();
    }

    return $moveIds;
  }

  /**
   * getCancelMoveIds : get all cancelled notifs IDs from BGA gamelog, used for styling the notifications on page reload
   */
  protected function extractNotifIds($notifications)
  {
    $notificationUIds = [];
    foreach ($notifications as $packet) {
      $data = \json_decode($packet['gamelog_notification'], true);
      foreach ($data as $notification) {
        array_push($notificationUIds, $notification['uid']);
      }
    }
    return $notificationUIds;
  }

  public function getCanceledNotifIds()
  {
    $query = new QueryBuilder('gamelog', null, 'gamelog_packet_id');
    return self::extractNotifIds($query->where('cancel', 1)->get());
  }

  /**
   * clearUndoableStepNotifications : extract and remove all notifications of type 'newUndoableStep' in the gamelog
   */
  public function clearUndoableStepNotifications($clearAll = false)
  {
    // Get move ids corresponding to last step
    if ($clearAll) {
      $minMoveId = 1;
    } else {
      $moveIds = [];
      foreach (self::getUndoableSteps(false) as $step) {
        $moveIds[] = (int) $step['move_id'];
      }
      if (empty($moveIds)) {
        return;
      }
      $minMoveId = min($moveIds);
    }

    // Get packets
    $query = new QueryBuilder('gamelog', null, 'gamelog_packet_id');
    $packets = $query->where('gamelog_move_id', '>=', $minMoveId)->get();
    foreach ($packets as $packet) {
      $id = $packet['gamelog_packet_id'];

      // Filter notifs based on type
      $data = \json_decode($packet['gamelog_notification'], true);
      $notifs = [];
      $ignored = 0;
      foreach ($data as $notification) {
        if ($notification['type'] != 'newUndoableStep') {
          $notifs[] = $notification;
        } else {
          $ignored++;
        }
      }
      if ($ignored == 0) {
        continue;
      }

      $query = new QueryBuilder('gamelog', null, 'gamelog_packet_id');

      // Delete or update
      if (empty($notifs)) {
        $query->delete($id);
      } else {
        $query->update(['gamelog_notification' => addslashes(json_encode($notifs))], $id);
      }
    }
  }
}
