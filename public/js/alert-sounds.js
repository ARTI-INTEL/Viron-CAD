/**
 * alert-sounds.js  Viron CAD – Alert Sound System
 *
 * Plays custom audio files (MP3/WAV/OGG) for CAD events when configured,
 * with generated Web Audio API tones as the default fallback.
 *
 * Custom audio URLs are stored in localStorage and can be set via:
 *   AlertSounds.setCustomAudio(AlertSounds.types.NEW_CALL, 'https://…/sound.mp3')
 *
 * User preferences (enabled/disabled per sound) are also stored in localStorage.
 *
 * Include this script AFTER shared.js on every CAD page.
 *
 * API:
 *   AlertSounds.newCall()                  – play "New Call" sound
 *   AlertSounds.callAttached()             – play "Attached to Call" sound
 *   AlertSounds.callUpdated()              – play "Call Updated" sound
 *   AlertSounds.newBolo()                  – play "New BOLO" sound
 *
 *   AlertSounds.isEnabled(type)            – check if a sound is enabled
 *   AlertSounds.setEnabled(type, bool)     – enable/disable a sound
 *   AlertSounds.getCustomAudio(type)       – get custom audio URL for a type (or null)
 *   AlertSounds.setCustomAudio(type, url)  – set custom audio URL (null to clear)
 *   AlertSounds.getAllCustomAudio()        – get all custom audio URLs as an object
 *
 *   AlertSounds.types                      – { NEW_CALL, CALL_ATTACHED, CALL_UPDATED, NEW_BOLO }
 */

(function (window) {
  'use strict';

  /* ── Sound type identifiers ─────────────────────────────── */
  var TYPES = {
    NEW_CALL:         'cad_sound_newCall',
    CALL_ATTACHED:    'cad_sound_callAttached',
    CALL_UPDATED:     'cad_sound_callUpdated',
    NEW_BOLO:         'cad_sound_newBolo',
  };

  /* ── On-page type → internal key ─────────────────────────── */
  var _typeToAudioKey = {};
  _typeToAudioKey[TYPES.NEW_CALL]      = 'newCall';
  _typeToAudioKey[TYPES.CALL_ATTACHED] = 'callAttached';
  _typeToAudioKey[TYPES.CALL_UPDATED]  = 'callUpdated';
  _typeToAudioKey[TYPES.NEW_BOLO]      = 'newBolo';

  /* ── Preferences (enabled / disabled) ───────────────────── */
  function defaultEnabled() {
    var prefs = {};
    for (var key in TYPES) {
      if (TYPES.hasOwnProperty(key)) {
        prefs[TYPES[key]] = true;
      }
    }
    return prefs;
  }

  function loadPrefs() {
    var defaults = defaultEnabled();
    try {
      var stored = localStorage.getItem('cad_alert_sounds_prefs');
      if (stored) {
        var parsed = JSON.parse(stored);
        for (var key in defaults) {
          if (defaults.hasOwnProperty(key) && typeof parsed[key] === 'boolean') {
            defaults[key] = parsed[key];
          }
        }
      }
    } catch (_) {}
    return defaults;
  }

  function savePrefs(prefs) {
    try {
      localStorage.setItem('cad_alert_sounds_prefs', JSON.stringify(prefs));
    } catch (_) {}
  }

  var _prefs = loadPrefs();

  /* ── Custom audio URLs ──────────────────────────────────── */
  function loadAudioUrls() {
    try {
      var stored = localStorage.getItem('cad_alert_sounds_audio');
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    return {};
  }

  function saveAudioUrls(urls) {
    try {
      localStorage.setItem('cad_alert_sounds_audio', JSON.stringify(urls));
    } catch (_) {}
  }

  var _audioUrls = loadAudioUrls();

  /* ── Default local audio paths (bundled in project) ─────── */
  var DEFAULT_AUDIO_PATHS = {
    newCall:      '/audio/new_call.mp3',
    callAttached: '/audio/attached_to_call.mp3',
    callUpdated:  '/audio/attached_call_updated.mp3',
    newBolo:      '/audio/new_bolo.mp3',
  };

  // If no custom URL has been saved yet, use the default project path
  function getEffectiveAudioUrl(audioKey) {
    if (_audioUrls[audioKey]) return _audioUrls[audioKey];
    return DEFAULT_AUDIO_PATHS[audioKey] || null;
  }

  /* ── Audio context (lazy, for generated tones) ──────────── */
  var _audioCtx = null;

  function getAudioCtx() {
    if (!_audioCtx) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      _audioCtx = new Ctor();
    }
    return _audioCtx;
  }

  function cleanupAudioCtx() {
    if (_audioCtx) {
      _audioCtx.close().catch(function () {});
      _audioCtx = null;
    }
  }

  /* ── Core tone player (fallback) ────────────────────────── */
  function playTone(frequency, duration, type, startTime) {
    var ctx = getAudioCtx();
    if (!ctx) return;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();

    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(frequency, startTime || ctx.currentTime);

    gain.gain.setValueAtTime(0.3, startTime || ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, (startTime || ctx.currentTime) + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime || ctx.currentTime);
    osc.stop((startTime || ctx.currentTime) + duration);
  }

  /* ── Generated tone patterns (default fallbacks) ────────── */
  function playNewCallTone() {
    var ctx = getAudioCtx();
    if (!ctx) return;
    var now = ctx.currentTime;
    playTone(523.25, 0.2, 'square', now);
    playTone(659.25, 0.25, 'square', now + 0.25);
  }

  function playCallAttachedTone() {
    var ctx = getAudioCtx();
    if (!ctx) return;
    var now = ctx.currentTime;
    playTone(523.25, 0.15, 'sine', now);
    playTone(659.25, 0.15, 'sine', now + 0.18);
    playTone(783.99, 0.25, 'sine', now + 0.36);
  }

  function playCallUpdatedTone() {
    var ctx = getAudioCtx();
    if (!ctx) return;
    var now = ctx.currentTime;
    playTone(440, 0.2, 'triangle', now);
  }

  function playNewBoloTone() {
    var ctx = getAudioCtx();
    if (!ctx) return;
    var now = ctx.currentTime;
    playTone(659.25, 0.2, 'sawtooth', now);
    playTone(523.25, 0.2, 'sawtooth', now + 0.22);
    playTone(392, 0.3, 'sawtooth', now + 0.44);
  }

  /* ── Custom audio file player ───────────────────────────── */
  function playCustomAudio(url, fallbackFn) {
    if (!url) { fallbackFn(); return; }
    try {
      var audio = new Audio(url);
      audio.volume = 0.5;

      /* If the audio takes too long to load, fall back */
      var loadTimer = setTimeout(function () {
        fallbackFn();
      }, 2000);

      audio.addEventListener('canplaythrough', function () {
        clearTimeout(loadTimer);
        audio.play().catch(function () {
          fallbackFn();
        });
      });

      audio.addEventListener('error', function () {
        clearTimeout(loadTimer);
        fallbackFn();
      });
    } catch (_) {
      fallbackFn();
    }
  }

  /* ── Unified play dispatcher ────────────────────────────── */
  function play(typeKey, fallbackFn) {
    if (!_prefs[typeKey]) return; // disabled

    var audioKey = _typeToAudioKey[typeKey];
    var audioUrl = audioKey ? getEffectiveAudioUrl(audioKey) : null;

    if (audioUrl) {
      // Try local project file first (will fall back to generated tone on failure)
      playCustomAudio(audioUrl, fallbackFn);
      return;
    }

    // Fall back to generated tone
    fallbackFn();
  }

  /* ── Public API ──────────────────────────────────────────── */

  function newCall()      { play(TYPES.NEW_CALL,      playNewCallTone); }
  function callAttached() { play(TYPES.CALL_ATTACHED, playCallAttachedTone); }
  function callUpdated()  { play(TYPES.CALL_UPDATED,  playCallUpdatedTone); }
  function newBolo()      { play(TYPES.NEW_BOLO,      playNewBoloTone); }

  function isEnabled(type) {
    return !!_prefs[type];
  }

  function setEnabled(type, enabled) {
    _prefs[type] = !!enabled;
    savePrefs(_prefs);
  }

  /**
   * Get the custom audio URL for a sound type, or null if not set.
   * @param {string} type - A key from AlertSounds.types
   * @returns {string|null}
   */
  function getCustomAudio(type) {
    var audioKey = _typeToAudioKey[type];
    if (!audioKey) return null;
    // Return the user-set URL, or the default project path, or null
    return _audioUrls[audioKey] || DEFAULT_AUDIO_PATHS[audioKey] || null;
  }

  /**
   * Set (or clear) a custom audio URL for a sound type.
   * Pass null or empty string to clear and use the generated tone.
   * @param {string} type - A key from AlertSounds.types
   * @param {string|null} url - URL to an audio file, or null to clear
   */
  function setCustomAudio(type, url) {
    var audioKey = _typeToAudioKey[type];
    if (!audioKey) return;
    if (url && typeof url === 'string' && url.trim()) {
      _audioUrls[audioKey] = url.trim();
    } else {
      delete _audioUrls[audioKey];
    }
    saveAudioUrls(_audioUrls);
  }

  /**
   * Get all custom audio URLs as an object keyed by the type constants.
   * @returns {Object}
   */
  function getAllCustomAudio() {
    var result = {};
    for (var typeKey in TYPES) {
      if (TYPES.hasOwnProperty(typeKey)) {
        var val = TYPES[typeKey];
        result[val] = getCustomAudio(val);
      }
    }
    return result;
  }

  /* ── Cleanup on page unload ────────────────────────────── */
  window.addEventListener('beforeunload', function () {
    cleanupAudioCtx();
  });

  /* ── Expose on global scope ──────────────────────────────── */
  window.AlertSounds = {
    types:            TYPES,
    newCall:          newCall,
    callAttached:     callAttached,
    callUpdated:      callUpdated,
    newBolo:          newBolo,
    isEnabled:        isEnabled,
    setEnabled:       setEnabled,
    getCustomAudio:   getCustomAudio,
    setCustomAudio:   setCustomAudio,
    getAllCustomAudio: getAllCustomAudio,
  };

})(window);
