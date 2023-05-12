var isDebug = window.location.host == 'studio.boardgamearena.com' || window.location.hash.indexOf('debug') > -1;
var debug = isDebug ? console.info.bind(window.console) : function () {};

define(['dojo', 'dojo/_base/declare', g_gamethemeurl + 'modules/js/vendor/nouislider.min.js', 'ebg/core/gamegui'], (
  dojo,
  declare,
  noUiSlider,
) => {
  return declare('customgame.game', ebg.core.gamegui, {
    /*
     * Constructor
     */
    constructor() {
      this._notifications = [];
      this._activeStates = [];
      this._connections = [];
      this._selectableNodes = [];
      this._activeStatus = null;
      this._helpMode = false;
      this._dragndropMode = false;
      this._customTooltipIdCounter = 0;
      this._registeredCustomTooltips = {};

      this._notif_uid_to_log_id = {};
      this._notif_uid_to_mobile_log_id = {};
      this._last_notif = null;
      dojo.place('loader_mask', 'overall-content', 'before');
      dojo.style('loader_mask', {
        height: '100vh',
        position: 'fixed',
      });
    },

    showMessage(msg, type) {
      if (type == 'error') {
        console.error(msg);
      }
      return this.inherited(arguments);
    },

    isFastMode() {
      return this.instantaneousMode;
    },

    setModeInstataneous() {
      if (this.instantaneousMode == false) {
        this.instantaneousMode = true;
        dojo.style('leftright_page_wrapper', 'display', 'none');
        dojo.style('loader_mask', 'display', 'block');
        dojo.style('loader_mask', 'opacity', 1);
      }
    },

    unsetModeInstantaneous() {
      if (this.instantaneousMode) {
        this.instantaneousMode = false;
        dojo.style('leftright_page_wrapper', 'display', 'block');
        dojo.style('loader_mask', 'display', 'none');
        this.updateLayout();
      }
    },

    /*
     * [Undocumented] Override BGA framework functions to call onLoadingComplete when loading is done
     */
    setLoader(value, max) {
      this.inherited(arguments);
      if (!this.isLoadingComplete && value >= 100) {
        this.isLoadingComplete = true;
        this.onLoadingComplete();
      }
    },

    onLoadingComplete() {
      debug('Loading complete');
    },

    /*
     * Setup:
     */
    setup(gamedatas) {
      // Create a new div for buttons to avoid BGA auto clearing it
      dojo.place("<div id='customActions' style='display:inline-block'></div>", $('generalactions'), 'after');
      dojo.place("<div id='restartAction' style='display:inline-block'></div>", $('customActions'), 'after');

      this.attachRegisteredTooltips();

      this.setupNotifications();
      this.initPreferences();
      dojo.connect(this.notifqueue, 'addToLog', () => {
        this.checkLogCancel(this._last_notif == null ? null : this._last_notif.msg.uid);
        this.addLogClass();
        this.attachRegisteredTooltips();
      });
    },

    /*
     * Detect if spectator or replay
     */
    isReadOnly() {
      return this.isSpectator || typeof g_replayFrom != 'undefined' || g_archive_mode;
    },

    /*
     * Make an AJAX call with automatic lock
     */
    takeAction(action, data, check = true, checkLock = true) {
      if (check && !this.checkAction(action)) return false;
      if (!check && checkLock && !this.checkLock()) return false;
      // Stop any ongoing timed button
      this.stopActionTimer();

      data = data || {};
      if (data.lock === undefined) {
        data.lock = true;
      } else if (data.lock === false) {
        delete data.lock;
      }
      return new Promise((resolve, reject) => {
        this.ajaxcall(
          '/' + this.game_name + '/' + this.game_name + '/' + action + '.html',
          data,
          this,
          (data) => resolve(data),
          (isError, message, code) => {
            if (isError) reject(message, code);
          },
        );
      });
    },

    /*
     * onEnteringState:
     * 	this method is called each time we are entering into a new game state.
     *
     * params:
     *  - str stateName : name of the state we are entering
     *  - mixed args : additional information
     */
    onEnteringState(stateName, args) {
      debug('Entering state: ' + stateName, args);
      if (this.isFastMode()) return;
      if (this._activeStates.includes(stateName) && !this.isCurrentPlayerActive()) return;

      // Call appropriate method
      var methodName = 'onEnteringState' + stateName.charAt(0).toUpperCase() + stateName.slice(1);
      if (this[methodName] !== undefined) this[methodName](args.args);
    },

    /**
     * onLeavingState:
     * 	this method is called each time we are leaving a game state.
     *
     * params:
     *  - str stateName : name of the state we are leaving
     */
    onLeavingState(stateName) {
      debug('Leaving state: ' + stateName);
      if (this.isFastMode()) return;
      this.clearPossible();

      // Call appropriate method
      var methodName = 'onLeavingState' + stateName.charAt(0).toUpperCase() + stateName.slice(1);
      if (this[methodName] !== undefined) this[methodName]();
    },
    clearTitleBar() {
      this.removeActionButtons();
      this.empty('customActions');
      this.empty('restartAction');
      this.empty('anytimeActions');
      $('gameaction_status').innerHTML = '';
      $('pagemaintitletext').innerHTML = '';
    },
    clearPossible() {
      this.clearTitleBar();

      this._connections.forEach(dojo.disconnect);
      this._connections = [];
      this._selectableNodes.forEach((node) => {
        if ($(node)) dojo.removeClass(node, 'selectable selected');
      });
      this._selectableNodes = [];
      dojo.query('.unselectable').removeClass('unselectable');
      dojo.query('.selected').removeClass('selected');
    },

    empty(container) {
      container = $(container);
      container.childNodes.forEach((node) => {
        if (this.tooltips[node.id]) {
          this.tooltips[node.id].close();
          delete this.tooltips[node.id];
        }
      });
      container.innerHTML = '';
    },

    /**
     * Check change of activity
     */
    onUpdateActionButtons(stateName, args) {
      let status = this.isCurrentPlayerActive();
      if (status != this._activeStatus) {
        debug('Update activity: ' + stateName, status);
        this._activeStatus = status;

        // Call appropriate method
        var methodName = 'onUpdateActivity' + stateName.charAt(0).toUpperCase() + stateName.slice(1);
        if (this[methodName] !== undefined) this[methodName](args, status);
      }
    },

    /*
     * setupNotifications
     */
    getVisibleTitleContainer() {
      function isVisible(elem) {
        return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
      }

      if (isVisible($('pagemaintitletext'))) {
        return $('pagemaintitletext');
      } else {
        return $('pagemaintitletext');
      }
    },

    setupNotifications() {
      console.log(this._notifications);
      this._notifications.forEach((notif) => {
        var functionName = 'notif_' + notif[0];

        let wrapper = (args) => {
          let msg = this.formatString(this.format_string_recursive(args.log, args.args));
          if (msg != '') {
            $('gameaction_status').innerHTML = msg;
            $('pagemaintitletext').innerHTML = msg;
          }
          let timing = this[functionName](args);
          if (timing === undefined) {
            if (notif[1] === undefined) {
              console.error(
                "A notification don't have default timing and didn't send a timing as return value : " + notif[0],
              );
              return;
            }

            // Override default timing by 1 in case of fast replay mode
            timing = this.isFastMode() ? 0 : notif[1];
          }

          if (timing !== null) {
            this.notifqueue.setSynchronousDuration(timing);
          }
        };

        dojo.subscribe(notif[0], this, wrapper);

        if (notif[2] != undefined) {
          this.notifqueue.setIgnoreNotificationCheck(notif[0], notif[2]);
          this.notifqueue.setSynchronous(notif[0], notif[1]); // Ignorable notif must have a default timing
        } else {
          this.notifqueue.setSynchronous(notif[0]);
        }
      });

      // Load production bug report handler
      dojo.subscribe('loadBug', this, (n) => this.notif_loadBug(n));

      this.notifqueue.setSynchronousDuration = (duration) => {
        setTimeout(() => dojo.publish('notifEnd', null), duration);
      };
    },

    /**
     * Load production bug report handler
     */
    notif_loadBug(n) {
      let self = this;
      function fetchNextUrl() {
        var url = n.args.urls.shift();
        console.log('Fetching URL', url, '...');
        // all the calls have to be made with ajaxcall in order to add the csrf token, otherwise you'll get "Invalid session information for this action. Please try reloading the page or logging in again"
        self.ajaxcall(
          url,
          {
            lock: true,
          },
          self,
          function (success) {
            console.log('=> Success ', success);

            if (n.args.urls.length > 1) {
              fetchNextUrl();
            } else if (n.args.urls.length > 0) {
              //except the last one, clearing php cache
              url = n.args.urls.shift();
              dojo.xhrGet({
                url: url,
                load: function (success) {
                  console.log('Success for URL', url, success);
                  console.log('Done, reloading page');
                  window.location.reload();
                },
                handleAs: 'text',
                error: function (error) {
                  console.log('Error while loading : ', error);
                },
              });
            }
          },
          function (error) {
            if (error) console.log('=> Error ', error);
          },
        );
      }
      console.log('Notif: load bug', n.args);
      fetchNextUrl();
    },

    /*
     * Add a timer on an action button :
     * params:
     *  - buttonId : id of the action button
     *  - time : time before auto click
     *  - pref : 0 is disabled (auto-click), 1 if normal timer, 2 if no timer and show normal button
     */

    startActionTimer(buttonId, time, pref, autoclick = false) {
      var button = $(buttonId);
      var isReadOnly = this.isReadOnly();
      if (button == null || isReadOnly || pref == 2) {
        debug('Ignoring startActionTimer(' + buttonId + ')', 'readOnly=' + isReadOnly, 'prefValue=' + pref);
        return;
      }

      // If confirm disabled, click on button
      if (pref == 0) {
        if (autoclick) button.click();
        return;
      }

      this._actionTimerLabel = button.innerHTML;
      this._actionTimerSeconds = time;
      this._actionTimerFunction = () => {
        var button = $(buttonId);
        if (button == null) {
          this.stopActionTimer();
        } else if (this._actionTimerSeconds-- > 1) {
          button.innerHTML = this._actionTimerLabel + ' (' + this._actionTimerSeconds + ')';
        } else {
          debug('Timer ' + buttonId + ' execute');
          button.click();
          this.stopActionTimer();
        }
      };
      this._actionTimerFunction();
      this._actionTimerId = window.setInterval(this._actionTimerFunction.bind(this), 1000);
      debug('Timer #' + this._actionTimerId + ' ' + buttonId + ' start');
    },

    stopActionTimer() {
      if (this._actionTimerId != null) {
        debug('Timer #' + this._actionTimerId + ' stop');
        window.clearInterval(this._actionTimerId);
        delete this._actionTimerId;
      }
    },

    /*
     * Play a given sound that should be first added in the tpl file
     */
    playSound(sound, playNextMoveSound = true) {
      playSound(sound);
      playNextMoveSound && this.disableNextMoveSound();
    },

    resetPageTitle() {
      this.changePageTitle();
    },

    changePageTitle(suffix = null, save = false) {
      if (suffix == null) {
        suffix = 'generic';
      }

      if (!this.gamedatas.gamestate['descriptionmyturn' + suffix]) return;

      if (save) {
        this.gamedatas.gamestate.descriptionmyturngeneric = this.gamedatas.gamestate.descriptionmyturn;
        this.gamedatas.gamestate.descriptiongeneric = this.gamedatas.gamestate.description;
      }

      this.gamedatas.gamestate.descriptionmyturn = this.gamedatas.gamestate['descriptionmyturn' + suffix];
      if (this.gamedatas.gamestate['description' + suffix])
        this.gamedatas.gamestate.description = this.gamedatas.gamestate['description' + suffix];
      this.updatePageTitle();
    },

    /*
     * Remove non standard zoom property
     */
    onScreenWidthChange() {
      dojo.style('page-content', 'zoom', '');
      dojo.style('page-title', 'zoom', '');
      dojo.style('right-side-first-part', 'zoom', '');
    },

    /*
     * Add a blue/grey button if it doesn't already exists
     */
    addPrimaryActionButton(id, text, callback, zone = 'customActions') {
      if (!$(id)) this.addActionButton(id, text, callback, zone, false, 'blue');
    },

    addSecondaryActionButton(id, text, callback, zone = 'customActions') {
      if (!$(id)) this.addActionButton(id, text, callback, zone, false, 'gray');
    },

    addDangerActionButton(id, text, callback, zone = 'customActions') {
      if (!$(id)) this.addActionButton(id, text, callback, zone, false, 'red');
    },

    clearActionButtons() {
      dojo.empty('customActions');
    },

    /*
     * Preference polyfill
     */
    setPreferenceValue(number, newValue) {
      var optionSel = 'option[value="' + newValue + '"]';
      dojo
        .query(
          '#preference_control_' + number + ' > ' + optionSel + ', #preference_fontrol_' + number + ' > ' + optionSel,
        )
        .attr('selected', true);
      var select = $('preference_control_' + number);
      if (dojo.isIE) {
        select.fireEvent('onchange');
      } else {
        var event = document.createEvent('HTMLEvents');
        event.initEvent('change', false, true);
        select.dispatchEvent(event);
      }
    },

    initPreferencesObserver() {
      dojo.query('.preference_control, preference_fontrol').on('change', (e) => {
        var match = e.target.id.match(/^preference_[fc]ontrol_(\d+)$/);
        if (!match) {
          return;
        }
        var pref = match[1];
        var newValue = e.target.value;
        this.prefs[pref].value = newValue;
        if (this.prefs[pref].attribute) {
          $('ebd-body').setAttribute('data-' + this.prefs[pref].attribute, newValue);
        }

        $('preference_control_' + pref).value = newValue;
        if ($('preference_fontrol_' + pref)) {
          $('preference_fontrol_' + pref).value = newValue;
        }
        data = { pref: pref, lock: false, value: newValue, player: this.player_id };
        this.takeAction('actChangePref', data, false, false);
        this.onPreferenceChange(pref, newValue);
      });
    },

    checkPreferencesConsistency(backPrefs) {
      backPrefs.forEach((prefInfo) => {
        let pref = prefInfo.pref_id;
        if (this.prefs[pref] != undefined && this.prefs[pref].value != prefInfo.pref_value) {
          data = { pref: pref, lock: false, value: this.prefs[pref].value, player: this.player_id };
          this.takeAction('actChangePref', data, false, false);
        }
      });
    },

    onPreferenceChange(pref, newValue) {},

    // Init preferences will setup local preference and put the corresponding data-attribute on overall-content div if needed
    initPreferences() {
      // Attach data attribute on overall-content div
      Object.keys(this.prefs).forEach((prefId) => {
        let pref = this.prefs[prefId];
        if (pref.attribute) {
          $('ebd-body').setAttribute('data-' + pref.attribute, pref.value);
        }
      });

      if (!this.isReadOnly() && this.gamedatas.localPrefs) {
        // Create local prefs
        Object.keys(this.gamedatas.localPrefs).forEach((prefId) => {
          let pref = this.gamedatas.localPrefs[prefId];
          pref.id = prefId;
          let selectedValue = this.gamedatas.prefs.find((pref2) => pref2.pref_id == pref.id).pref_value;
          pref.value = selectedValue;
          this.prefs[prefId] = pref;
          if (pref.attribute) {
            $('ebd-body').setAttribute('data-' + pref.attribute, selectedValue);
          }
          this.place('tplPreferenceSelect', pref, 'local-prefs-container');
        });
      }

      this.initPreferencesObserver();
      if (!this.isReadOnly()) {
        this.checkPreferencesConsistency(this.gamedatas.prefs);
      }

      this.setupSettings();
    },

    tplPreferenceSelect(pref) {
      let values = Object.keys(pref.values)
        .map(
          (val) =>
            `<option value='${val}' ${pref.value == val ? 'selected="selected"' : ''}>${_(
              pref.values[val].name,
            )}</option>`,
        )
        .join('');

      return `
        <div class="preference_choice">
          <div class="row-data row-data-large">
            <div class="row-label">${_(pref.name)}</div>
            <div class="row-value">
              <select id="preference_control_${
                pref.id
              }" class="preference_control game_local_preference_control" style="display: block;">
                ${values}
              </select>
            </div>
          </div>
        </div>
      `;
    },

    onPreferenceChange(pref, newValue) {},

    /************************
     ******* SETTINGS ********
     ************************/
    isMobile() {
      return $('ebd-body').classList.contains('mobile_version');
    },

    setupSettings() {
      dojo.connect($('show-settings'), 'onclick', () => this.toggleSettings());
      this.addTooltip('show-settings', '', _('Display some settings about the game.'));
      let container = $('settings-controls-container');

      if (this.getSettingsSections) {
        this._settingsSections = this.getSettingsSections();
        dojo.place(`<div id='settings-controls-header'></div><div id='settings-controls-wrapper'></div>`, container);
        Object.keys(this._settingsSections).forEach((sectionName, i) => {
          dojo.place(
            `<div id='settings-section-${sectionName}' class='settings-section'></div>`,
            'settings-controls-wrapper',
          );
          let div = dojo.place(`<div>${this._settingsSections[sectionName]}</div>`, 'settings-controls-header');
          let openSection = () => {
            dojo.query('#settings-controls-header div').removeClass('open');
            div.classList.add('open');
            dojo.query('#settings-controls-wrapper div.settings-section').removeClass('open');
            $(`settings-section-${sectionName}`).classList.add('open');
          };
          div.addEventListener('click', openSection);
          if (i == 0) {
            openSection();
          }
        });
      }

      this.settings = {};
      this._settingsConfig = this.getSettingsConfig();
      Object.keys(this._settingsConfig).forEach((settingName) => {
        let config = this._settingsConfig[settingName];
        let localContainer = container;
        if (config.section) {
          localContainer = $(`settings-section-${config.section}`);
        }

        if (config.type == 'pref') {
          if (config.local == true && this.isReadOnly()) {
            return;
          }
          // Pref type => just move the user pref around
          dojo.place($('preference_control_' + config.prefId).parentNode.parentNode, localContainer);
          return;
        }

        let suffix = settingName.charAt(0).toUpperCase() + settingName.slice(1);
        let defaultValue = typeof config.default === 'function' ? config.default(this.isMobile()) : config.default;
        let value = this.getConfig(this.game_name + suffix, defaultValue);
        this.settings[settingName] = value;

        // Slider type => create DOM and initialize noUiSlider
        if (config.type == 'slider') {
          this.place('tplSettingSlider', { desc: config.name, id: settingName }, localContainer);
          config.sliderConfig.start = [value];
          noUiSlider.create($('setting-' + settingName), config.sliderConfig);
          $('setting-' + settingName).noUiSlider.on('slide', (arg) =>
            this.changeSetting(settingName, parseInt(arg[0])),
          );
        } else if (config.type == 'multislider') {
          this.place('tplSettingSlider', { desc: config.name, id: settingName }, localContainer);
          config.sliderConfig.start = value;
          noUiSlider.create($('setting-' + settingName), config.sliderConfig);
          $('setting-' + settingName).noUiSlider.on('slide', (arg) => this.changeSetting(settingName, arg));
        }

        // Select type => create a select
        else if (config.type == 'select') {
          config.id = settingName;
          this.place('tplSettingSelect', config, localContainer);
          $('setting-' + settingName).addEventListener('change', () => {
            let newValue = $('setting-' + settingName).value;
            this.changeSetting(settingName, newValue);
            if (config.attribute) {
              $('ebd-body').setAttribute('data-' + config.attribute, newValue);
            }
          });
        }
        // Switch type => create a select
        else if (config.type == 'switch') {
          config.id = settingName;
          this.place('tplSettingSwitch', config, localContainer);
          $('setting-' + settingName).addEventListener('change', () => {
            let newValue = $('setting-' + settingName).checked ? 1 : 0;
            this.changeSetting(settingName, newValue);
            if (config.attribute) {
              $('ebd-body').setAttribute('data-' + config.attribute, newValue);
            }
          });
        }

        if (config.attribute) {
          $('ebd-body').setAttribute('data-' + config.attribute, value);
        }
        this.changeSetting(settingName, value);
      });
    },

    changeSetting(settingName, value) {
      let suffix = settingName.charAt(0).toUpperCase() + settingName.slice(1);
      this.settings[settingName] = value;
      localStorage.setItem(this.game_name + suffix, value);
      let methodName = 'onChange' + suffix + 'Setting';
      if (this[methodName]) {
        this[methodName](value);
      }
    },

    tplSettingSlider(setting) {
      return `
      <div class='row-data row-data-large' data-id='${setting.id}'>
        <div class='row-label'>${setting.desc}</div>
        <div class='row-value slider'>
          <div id="setting-${setting.id}"></div>
        </div>
      </div>
      `;
    },

    tplSettingSwitch(setting) {
      return `
      <div class='row-data row-data-large row-data-switch' data-id='${setting.id}'>
        <div class='row-label'>${_(setting.name)}</div>
        <div class='row-value'>
          <label class="switch" for="setting-${setting.id}">
            <input type="checkbox" id="setting-${setting.id}" ${
        this.settings[setting.id] == 1 ? 'checked="checked"' : ''
      } />
            <div class="slider round"></div>
          </label>
        </div>
      </div>
      `;
    },

    tplSettingSelect(setting) {
      let values = Object.keys(setting.values)
        .map(
          (val) =>
            `<option value='${val}' ${this.settings[setting.id] == val ? 'selected="selected"' : ''}>${_(
              setting.values[val],
            )}</option>`,
        )
        .join('');

      return `
        <div class="preference_choice" data-id='${setting.id}'>
          <div class="row-data row-data-large">
            <div class="row-label">${_(setting.name)}</div>
            <div class="row-value">
              <select id="setting-${
                setting.id
              }" class="preference_control game_local_preference_control" style="display: block;">
                ${values}
              </select>
            </div>
          </div>
        </div>
      `;
    },

    toggleSettings() {
      if (!this._settingsModal) return;

      this._settingsModal.show();
      /*
      dojo.toggleClass('settings-controls-container', 'settingsControlsHidden');

      // Hacking BGA framework
      if (dojo.hasClass('ebd-body', 'mobile_version')) {
        dojo.query('.player-board').forEach((elt) => {
          if (elt.style.height != 'auto') {
            dojo.style(elt, 'min-height', elt.style.height);
            elt.style.height = 'auto';
          }
        });
      }
      */
    },

    getScale(id) {
      let transform = dojo.style(id, 'transform');
      if (transform == 'none') return 1;

      var values = transform.split('(')[1];
      values = values.split(')')[0];
      values = values.split(',');
      let a = values[0];
      let b = values[1];
      return Math.sqrt(a * a + b * b);
    },

    wait(n) {
      return new Promise((resolve, reject) => {
        setTimeout(() => resolve(), n);
      });
    },

    slide(mobileElt, targetElt, options = {}) {
      let config = Object.assign(
        {
          duration: 800,
          delay: 0,
          destroy: false,
          attach: true,
          changeParent: true, // Change parent during sliding to avoid zIndex issue
          pos: null,
          className: 'moving',
          from: null,
          clearPos: true,
          beforeBrother: null,
          to: null,

          phantom: true,
        },
        options,
      );
      config.phantomStart = config.phantomStart || config.phantom;
      config.phantomEnd = config.phantomEnd || config.phantom;

      // Mobile elt
      mobileElt = $(mobileElt);
      let mobile = mobileElt;
      // Target elt
      targetElt = $(targetElt);
      let targetId = targetElt;
      const newParent = config.attach ? targetId : $(mobile).parentNode;

      // Handle fast mode
      if (this.isFastMode() && (config.destroy || config.clearPos)) {
        if (config.destroy) dojo.destroy(mobile);
        else dojo.place(mobile, targetElt);

        return new Promise((resolve, reject) => {
          resolve();
        });
      }

      // Handle phantom at start
      if (config.phantomStart && config.from == null) {
        mobile = dojo.clone(mobileElt);
        dojo.attr(mobile, 'id', mobileElt.id + '_animated');
        dojo.place(mobile, 'game_play_area');
        this.placeOnObject(mobile, mobileElt);
        dojo.addClass(mobileElt, 'phantom');
        config.from = mobileElt;
      }

      // Handle phantom at end
      if (config.phantomEnd) {
        targetId = dojo.clone(mobileElt);
        dojo.attr(targetId, 'id', mobileElt.id + '_afterSlide');
        dojo.addClass(targetId, 'phantom');
        if (config.beforeBrother != null) {
          dojo.place(targetId, config.beforeBrother, 'before');
        } else {
          dojo.place(targetId, targetElt);
        }
      }

      dojo.style(mobile, 'zIndex', 5000);
      dojo.addClass(mobile, config.className);
      if (config.changeParent) this.changeParent(mobile, 'game_play_area');
      if (config.from != null) this.placeOnObject(mobile, config.from);
      return new Promise((resolve, reject) => {
        const animation =
          config.pos == null
            ? this.slideToObject(mobile, config.to || targetId, config.duration, config.delay)
            : this.slideToObjectPos(
                mobile,
                config.to || targetId,
                config.pos.x,
                config.pos.y,
                config.duration,
                config.delay,
              );

        dojo.connect(animation, 'onEnd', () => {
          dojo.style(mobile, 'zIndex', null);
          dojo.removeClass(mobile, config.className);
          if (config.phantomStart) {
            dojo.place(mobileElt, mobile, 'replace');
            dojo.removeClass(mobileElt, 'phantom');
            mobile = mobileElt;
          }
          if (config.destroy) {
            if (this.tooltips[mobile.id]) {
              this.tooltips[mobile.id].close();
              delete this.tooltips[mobile.id];
            }
            dojo.destroy(mobile);
            resolve();
            return;
          }
          if (config.changeParent || config.attach) {
            if (config.phantomEnd) dojo.place(mobile, targetId, 'replace');
            else this.changeParent(mobile, newParent);
          }
          if (config.clearPos && !config.destroy) dojo.style(mobile, { top: null, left: null, position: null });
          resolve();
        });
        animation.play();
      });
    },

    changeParent(mobile, new_parent, relation) {
      if (mobile === null) {
        console.error('attachToNewParent: mobile obj is null');
        return;
      }
      if (new_parent === null) {
        console.error('attachToNewParent: new_parent is null');
        return;
      }
      if (typeof mobile == 'string') {
        mobile = $(mobile);
      }
      if (typeof new_parent == 'string') {
        new_parent = $(new_parent);
      }
      if (typeof relation == 'undefined') {
        relation = 'last';
      }
      var src = dojo.position(mobile);
      dojo.style(mobile, 'position', 'absolute');
      dojo.place(mobile, new_parent, relation);
      var tgt = dojo.position(mobile);
      var box = dojo.marginBox(mobile);
      var cbox = dojo.contentBox(mobile);
      var left = box.l + src.x - tgt.x;
      var top = box.t + src.y - tgt.y;
      this.positionObjectDirectly(mobile, left, top);
      box.l += box.w - cbox.w;
      box.t += box.h - cbox.h;
      return box;
    },

    positionObjectDirectly(mobileObj, x, y) {
      // do not remove this "dead" code some-how it makes difference
      dojo.style(mobileObj, 'left'); // bug? re-compute style
      // console.log("place " + x + "," + y);
      dojo.style(mobileObj, {
        left: x + 'px',
        top: y + 'px',
      });
      dojo.style(mobileObj, 'left'); // bug? re-compute style
    },

    /*
     * Wrap a node inside a flip container to trigger a flip animation before replacing with another node
     */
    flipAndReplace(target, newNode, duration = 1000) {
      // Fast replay mode
      if (this.isFastMode()) {
        dojo.place(newNode, target, 'replace');
        return;
      }

      return new Promise((resolve, reject) => {
        // Wrap everything inside a flip container
        let container = dojo.place(
          `<div class="flip-container flipped">
            <div class="flip-inner">
              <div class="flip-front"></div>
              <div class="flip-back"></div>
            </div>
          </div>`,
          target,
          'after',
        );
        dojo.place(target, container.querySelector('.flip-back'));
        dojo.place(newNode, container.querySelector('.flip-front'));

        // Trigget flip animation
        container.offsetWidth;
        dojo.removeClass(container, 'flipped');

        // Clean everything once it's done
        setTimeout(() => {
          dojo.place(newNode, container, 'replace');
          resolve();
        }, duration);
      });
    },

    /*
     * Return a span with a colored 'You'
     */
    coloredYou() {
      var color = this.gamedatas.players[this.player_id].color;
      var color_bg = '';
      if (this.gamedatas.players[this.player_id] && this.gamedatas.players[this.player_id].color_back) {
        color_bg = 'background-color:#' + this.gamedatas.players[this.player_id].color_back + ';';
      }
      var you =
        '<span style="font-weight:bold;color:#' +
        color +
        ';' +
        color_bg +
        '">' +
        __('lang_mainsite', 'You') +
        '</span>';
      return you;
    },

    coloredPlayerName(name) {
      const player = Object.values(this.gamedatas.players).find((player) => player.name == name);
      if (player == undefined) return '<!--PNS--><span class="playername">' + name + '</span><!--PNE-->';

      const color = player.color;
      const color_bg = player.color_back
        ? 'background-color:#' + this.gamedatas.players[this.player_id].color_back + ';'
        : '';
      return (
        '<!--PNS--><span class="playername" style="color:#' + color + ';' + color_bg + '">' + name + '</span><!--PNE-->'
      );
    },

    /*
     * Overwrite to allow to more player coloration than player_name and player_name2
     */
    format_string_recursive(log, args) {
      try {
        if (log && args) {
          //          if (args.msgYou && args.player_id == this.player_id) log = args.msgYou;

          let player_keys = Object.keys(args).filter((key) => key.substr(0, 11) == 'player_name');
          player_keys.forEach((key) => {
            args[key] = this.coloredPlayerName(args[key]);
          });

          //          args.You = this.coloredYou();
        }
      } catch (e) {
        console.error(log, args, 'Exception thrown', e.stack);
      }

      return this.inherited(arguments);
    },

    place(tplMethodName, object, container, position = null) {
      if ($(container) == null) {
        console.error('Trying to place on null container', container, tplMethodName, object);
        return;
      }

      if (this[tplMethodName] == undefined) {
        console.error('Trying to create a non-existing template', tplMethodName);
        return;
      }

      return dojo.place(this[tplMethodName](object), container, position);
    },

    /* Helper to work with local storage */
    getConfig(value, v) {
      return localStorage.getItem(value) == null || isNaN(localStorage.getItem(value))
        ? v
        : localStorage.getItem(value);
    },

    /**********************
     ****** HELP MODE ******
     **********************/
    /**
     * Toggle help mode
     */
    toggleHelpMode(b) {
      if (b) this.activateHelpMode();
      else this.desactivateHelpMode();
    },

    activateHelpMode() {
      this._helpMode = true;
      dojo.addClass('ebd-body', 'help-mode');
      this._displayedTooltip = null;
      document.body.addEventListener('click', this.closeCurrentTooltip.bind(this));
    },

    desactivateHelpMode() {
      this.closeCurrentTooltip();
      this._helpMode = false;
      dojo.removeClass('ebd-body', 'help-mode');
      document.body.removeEventListener('click', this.closeCurrentTooltip.bind(this));
    },

    closeCurrentTooltip() {
      if (!this._helpMode) return;

      if (this._displayedTooltip == null) return;
      else {
        this._displayedTooltip.close();
        this._displayedTooltip = null;
      }
    },

    /*
     * Custom connect that keep track of all the connections
     *  and wrap clicks to make it work with help mode
     */
    connect(node, action, callback) {
      this._connections.push(dojo.connect($(node), action, callback));
    },

    onClick(node, callback, temporary = true) {
      let safeCallback = (evt) => {
        evt.stopPropagation();
        if (this.isInterfaceLocked()) return false;
        if (this._helpMode) return false;
        callback(evt);
      };

      if (temporary) {
        this.connect($(node), 'click', safeCallback);
        dojo.removeClass(node, 'unselectable');
        dojo.addClass(node, 'selectable');
        this._selectableNodes.push(node);
      } else {
        dojo.connect($(node), 'click', safeCallback);
      }
    },

    /**
     * Tooltip to work with help mode
     */
    registerCustomTooltip(html, id = null) {
      id = id || this.game_name + '-tooltipable-' + this._customTooltipIdCounter++;
      this._registeredCustomTooltips[id] = html;
      return id;
    },
    attachRegisteredTooltips() {
      Object.keys(this._registeredCustomTooltips).forEach((id) => {
        if ($(id)) {
          this.addCustomTooltip(id, this._registeredCustomTooltips[id], { forceRecreate: true });
        }
      });
      this._registeredCustomTooltips = {};
    },
    addCustomTooltip(id, html, config = {}) {
      config = Object.assign(
        {
          delay: 400,
          midSize: true,
          forceRecreate: false,
        },
        config,
      );

      // Handle dynamic content out of the box
      let getContent = () => {
        let content = typeof html === 'function' ? html() : html;
        if (config.midSize) {
          content = '<div class="midSizeDialog">' + content + '</div>';
        }
        return content;
      };

      if (this.tooltips[id] && !config.forceRecreate) {
        this.tooltips[id].getContent = getContent;
        return;
      }

      let tooltip = new dijit.Tooltip({
        //        connectId: [id],
        getContent,
        position: this.defaultTooltipPosition,
        showDelay: config.delay,
      });
      this.tooltips[id] = tooltip;
      dojo.addClass(id, 'tooltipable');
      dojo.place(
        `<div class='help-marker'>
          <svg><use href="#help-marker-svg" /></svg>
        </div>`,
        id,
      );

      dojo.connect($(id), 'click', (evt) => {
        if (!this._helpMode) {
          tooltip.close();
        } else {
          evt.stopPropagation();

          if (tooltip.state == 'SHOWING') {
            this.closeCurrentTooltip();
          } else {
            this.closeCurrentTooltip();
            tooltip.open($(id));
            this._displayedTooltip = tooltip;
          }
        }
      });

      tooltip.showTimeout = null;
      dojo.connect($(id), 'mouseenter', (evt) => {
        evt.stopPropagation();
        if (!this._helpMode && !this._dragndropMode) {
          if (tooltip.showTimeout != null) clearTimeout(tooltip.showTimeout);

          tooltip.showTimeout = setTimeout(() => {
            if ($(id)) tooltip.open($(id));
          }, config.delay);
        }
      });

      dojo.connect($(id), 'mouseleave', (evt) => {
        evt.stopPropagation();
        if (!this._helpMode && !this._dragndropMode) {
          tooltip.close();
          if (tooltip.showTimeout != null) clearTimeout(tooltip.showTimeout);
        }
      });
    },

    destroy(elem) {
      if (this.tooltips[elem.id]) {
        this.tooltips[elem.id].destroy();
        delete this.tooltips[elem.id];
      }

      elem.remove();
    },

    /*
     * [Undocumented] Called by BGA framework on any notification message
     * Handle cancelling log messages for restart turn
     */
    onPlaceLogOnChannel(msg) {
      var currentLogId = this.notifqueue.next_log_id;
      var currentMobileLogId = this.next_log_id;
      var res = this.inherited(arguments);
      this._notif_uid_to_log_id[msg.uid] = currentLogId;
      this._notif_uid_to_mobile_log_id[msg.uid] = currentMobileLogId;
      this._last_notif = {
        logId: currentLogId,
        mobileLogId: currentMobileLogId,
        msg,
      };
      return res;
    },

    /*
     * cancelLogs:
     *   strikes all log messages related to the given array of notif ids
     */
    checkLogCancel(notifId) {
      if (this.gamedatas.canceledNotifIds != null && this.gamedatas.canceledNotifIds.includes(notifId)) {
        this.cancelLogs([notifId]);
      }
    },

    cancelLogs(notifIds) {
      notifIds.forEach((uid) => {
        if (this._notif_uid_to_log_id.hasOwnProperty(uid)) {
          let logId = this._notif_uid_to_log_id[uid];
          if ($('log_' + logId)) dojo.addClass('log_' + logId, 'cancel');
        }
        if (this._notif_uid_to_mobile_log_id.hasOwnProperty(uid)) {
          let mobileLogId = this._notif_uid_to_mobile_log_id[uid];
          if ($('dockedlog_' + mobileLogId)) dojo.addClass('dockedlog_' + mobileLogId, 'cancel');
        }
      });
    },

    addLogClass() {
      if (this._last_notif == null) return;

      let notif = this._last_notif;
      let type = notif.msg.type;
      if (type == 'history_history') type = notif.msg.args.originalType;

      if ($('log_' + notif.logId)) {
        dojo.addClass('log_' + notif.logId, 'notif_' + type);

        var methodName = 'onAdding' + type.charAt(0).toUpperCase() + type.slice(1) + 'ToLog';
        if (this[methodName] !== undefined) this[methodName](notif);
      }
      if ($('dockedlog_' + notif.mobileLogId)) {
        dojo.addClass('dockedlog_' + notif.mobileLogId, 'notif_' + type);
      }
    },

    /**
     * Own counter implementation that works with replay
     */
    createCounter(id, defaultValue = 0, linked = null) {
      if (!$(id)) {
        console.error('Counter : element does not exist', id);
        return null;
      }

      let game = this;
      let o = {
        span: $(id),
        linked: linked ? $(linked) : null,
        targetValue: 0,
        currentValue: 0,
        speed: 100,
        getValue() {
          return this.targetValue;
        },
        setValue(n) {
          this.currentValue = +n;
          this.targetValue = +n;
          this.span.innerHTML = +n;
          if (this.linked) this.linked.innerHTML = +n;
        },
        toValue(n) {
          if (game.isFastMode()) {
            this.setValue(n);
            return;
          }

          this.targetValue = +n;
          if (this.currentValue != n) {
            this.span.classList.add('counter_in_progress');
            setTimeout(() => this.makeCounterProgress(), this.speed);
          }
        },
        goTo(n, anim) {
          if (anim) this.toValue(n);
          else this.setValue(n);
        },
        incValue(n) {
          let m = +n;
          this.toValue(this.targetValue + m);
        },
        makeCounterProgress() {
          if (this.currentValue == this.targetValue) {
            setTimeout(() => this.span.classList.remove('counter_in_progress'), this.speed);
            return;
          }

          let step = Math.ceil(Math.abs(this.targetValue - this.currentValue) / 5);
          this.currentValue += (this.currentValue < this.targetValue ? 1 : -1) * step;
          this.span.innerHTML = this.currentValue;
          if (this.linked) this.linked.innerHTML = this.currentValue;
          setTimeout(() => this.makeCounterProgress(), this.speed);
        },
      };
      o.setValue(defaultValue);
      return o;
    },

    /****************
     ***** UTILS *****
     ****************/
    forEachPlayer(callback) {
      Object.values(this.gamedatas.players).forEach(callback);
    },

    getArgs() {
      return this.gamedatas.gamestate.args;
    },

    clientState(name, descriptionmyturn, args) {
      this.setClientState(name, {
        descriptionmyturn,
        args,
      });
    },

    strReplace(str, subst) {
      return dojo.string.substitute(str, subst);
    },

    addCancelStateBtn(text = null) {
      if (text == null) {
        text = _('Cancel');
      }

      this.addSecondaryActionButton('btnCancel', text, () => this.clearClientState(), 'restartAction');
    },

    clearClientState() {
      //this.clearPossible();
      this.restoreServerGameState();
    },

    translate(t) {
      if (typeof t === 'object') {
        return this.format_string_recursive(t.log, t.args);
      } else {
        return this.format_string_recursive(t, {});
      }
    },

    fsr(log, args) {
      return this.format_string_recursive(log, args);
    },

    onSelectN(options) {
      let config = Object.assign(
        {
          elements: [],
          n: 0,
          autoConfirm: false,
          confirmText: _('Confirm'),
          confirmBtn: true,
          cancelText: _('Cancel'),
          cancelBtn: true,
          callback: null,
          updateCallback: null,
          optional: false,
          canPass: false,
          passCallback: null,
          btnContainer: 'customActions',
          class: '',
        },
        options,
      );

      let elemIds = Object.keys(config.elements);
      let selectedElements = [];
      let updateStatus = () => {
        if ($('btnConfirmChoice')) $('btnConfirmChoice').remove();
        if (
          ((config.optional === false && selectedElements.length == config.n) ||
            (config.optional === true && selectedElements.length <= config.n)) &&
          config.confirmBtn
        ) {
          let otherElems = elemIds.filter((id) => !selectedElements.includes(id));
          if (config.autoConfirm) {
            config.callback(selectedElements, otherElems);
            return;
          } else {
            this.addPrimaryActionButton(
              'btnConfirmChoice',
              config.confirmText,
              () => config.callback(selectedElements, otherElems),
              config.btnContainer,
            );
          }
        }

        if ($('btnCancelChoice')) $('btnCancelChoice').remove();
        if (selectedElements.length > 0 && config.cancelBtn) {
          this.addSecondaryActionButton(
            'btnCancelChoice',
            _('Cancel'),
            () => {
              selectedElements = [];
              updateStatus();
            },
            config.btnContainer,
          );
        }

        elemIds.forEach((id) => {
          let elt = config.elements[id];
          let selected = selectedElements.includes(id);
          elt.classList.toggle('selected', selected);
          if (config.class != '') elt.classList.toggle(config.class, selected);
          elt.classList.toggle('selectable', selected || selectedElements.length < config.n);
        });

        if (config.updateCallback !== null) {
          config.updateCallback(selectedElements);
        }
      };

      if ($('btnPass')) $('btnPass').remove();
      if (config.canPass) {
        this.addSecondaryActionButton('btnPass', _('Pass action'), () => config.passCallback(), config.btnContainer);
      }

      Object.keys(config.elements).forEach((id) => {
        let elt = config.elements[id];

        this.onClick(elt, () => {
          let index = selectedElements.findIndex((t) => t == id);

          if (index === -1) {
            if (selectedElements.length >= config.n) return;
            selectedElements.push(id);
          } else {
            selectedElements.splice(index, 1);
          }
          updateStatus();
        });
      });
    },
  });
});
