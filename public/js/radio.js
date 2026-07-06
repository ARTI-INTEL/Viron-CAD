/**
 * radio.js  Ultimate CAD – WebRTC Radio Client
 *
 * Features:
 *   - Mesh WebRTC voice with push-to-talk
 *   - Dispatchers hear ALL channels simultaneously (LEO, FR, DOT)
 *   - Channel-labeled active speaker visualiser
 *   - Radio-style transmission beep sounds
 *   - Configurable PTT keybind
 *
 * Channels:
 *   LEO  → Law Enforcement talk group
 *   FR   → Fire & Rescue talk group
 *   DOT  → DOT / Public Works talk group
 *
 *   Dispatchers automatically listen + transmit to all 3 channels.
 *   Non-dispatchers only connect to their department's channel.
 */

(function (global) {
  'use strict';

  var Radio = {};
  var TOKEN_KEY = 'cad_token';
  var SERVER_KEY = 'cad_active_server';
  var DEPT_KEY = 'cad_department';
  var PTT_KEY_STORAGE = 'cad_radio_ptt_key';

  /* ── Constants ──────────────────────────────────────────── */
  var ALL_CHANNELS = { LEO: 'LEO', FR: 'FR', DOT: 'DOT' };
  var CHANNEL_COLORS = {
    LEO: '#00b2ff',
    FR:  '#ff6633',
    DOT: '#dcb207',
  };

  /* ── Per-channel state ─────────────────────────────────── */
  var channels = {};          // channel → { ws, peerId, peerConnections, peerAudioElements, peerAnalysers, isConnected, reconnectTimer }
  var activeChannels = [];    // which channels this user is connected to

  /* ── Shared state ───────────────────────────────────────── */
  var localStream = null;
  var channelTracks = {};     // channel → cloned audio track (per-channel TX control)
  var transmitChannel = null; // which channel to transmit on (dispatchers choose)
  var isPTTActive = false;
  var isTransmitting = false;
  var animFrameId = null;
  var audioCtx = null;
  var isMultiChannel = false; // true for dispatchers
  var baseChannel = null;    // the user's default channel (detected from department)

  /* ── DOM helpers ────────────────────────────────────────── */
  var $ = function (id) { return document.getElementById(id); };
  var get = function (key) { try { return localStorage.getItem(key); } catch (_) { return null; } };
  var set = function (key, val) { try { localStorage.setItem(key, val); } catch (_) {} };

  /* ── ICE servers ────────────────────────────────────────── */
  var ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  /* ════════════════════════════════════════════════════════════
     PTT KEYBIND
  ════════════════════════════════════════════════════════════ */

  function getPTTKey() {
    var stored = get(PTT_KEY_STORAGE);
    return stored || ' ';
  }

  function getPTTKeyDisplay() {
    var key = getPTTKey();
    if (key === ' ') return 'Space';
    if (key === 'Control') return 'Ctrl';
    if (key === 'Shift') return 'Shift';
    if (key === 'Alt') return 'Alt';
    return key;
  }

  /* ════════════════════════════════════════════════════════════
     CHANNEL DETECTION
  ════════════════════════════════════════════════════════════ */

  function detectChannels() {
    var dept = (get(DEPT_KEY) || '').toLowerCase();
    var urlParams = new URLSearchParams(window.location.search);
    var forced = urlParams.get('channel');

    if (forced) {
      if (forced.toUpperCase() === 'ALL') {
        isMultiChannel = true;
        return Object.keys(ALL_CHANNELS);
      }
      isMultiChannel = false;
      return [forced.toUpperCase()];
    }

    if (window.location.pathname.includes('dispatcher')) {
      isMultiChannel = true;
      return ['LEO', 'FR', 'DOT'];
    }

    if (dept.includes('fire') || dept.includes('rescue'))  { baseChannel = 'FR'; return ['FR']; }
    if (dept.includes('transport') || dept.includes('dot')) { baseChannel = 'DOT'; return ['DOT']; }
    baseChannel = 'LEO';
    return ['LEO'];
  }

  /* ════════════════════════════════════════════════════════════
     AUDIO CONTEXT & BEEPS
  ════════════════════════════════════════════════════════════ */

  function getAudioContext() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (_) {
        return null;
      }
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () {});
    }
    return audioCtx;
  }

  function playBeep(startBeep) {
    var ctx = getAudioContext();
    if (!ctx) return;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);

    if (startBeep) {
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    } else {
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }

  function areBeepsEnabled() {
    return get('cad_radio_beeps') !== '0';
  }

  /* ════════════════════════════════════════════════════════════
     WIDGET RENDERING
  ════════════════════════════════════════════════════════════ */

  function createWidget() {
    if ($('cad-radio-widget')) return;

    var widget = document.createElement('div');
    widget.id = 'cad-radio-widget';
    widget.className = 'cad-radio-widget';

    // Always show channel badges — clickable for all users
    var currentCh = activeChannels[0] || 'LEO';
    var channelHtml = '<div class="cr-channels-bar" id="cr-channels-bar">' +
        '<span class="cr-channel-badge cr-channel-badge--on" id="cr-badge-LEO" data-channel="LEO">LEO</span>' +
        '<span class="cr-channel-badge cr-channel-badge--off" id="cr-badge-FR" data-channel="FR">FR</span>' +
        '<span class="cr-channel-badge cr-channel-badge--off" id="cr-badge-DOT" data-channel="DOT">DOT</span>' +
      '</div>';

    // TX selector only for dispatchers (they hear all but choose TX channel)
    var txChannelHtml = isMultiChannel
      ? '<div class="cr-tx-row">' +
          '<label class="cr-tx-label">TX</label>' +
          '<div class="cr-tx-selector" id="cr-tx-selector">' +
            '<span class="cr-tx-option cr-tx-option--active" data-tx="LEO" style="--tx-color:#00b2ff">LEO</span>' +
            '<span class="cr-tx-option" data-tx="FR" style="--tx-color:#ff6633">FR</span>' +
            '<span class="cr-tx-option" data-tx="DOT" style="--tx-color:#dcb207">DOT</span>' +
          '</div>' +
        '</div>'
      : '';

    widget.innerHTML =
      '<div class="cr-header">' +
        '<span class="cr-title">📡 Radio</span>' +
        '<span class="cr-status" id="cr-status">Disconnected</span>' +
      '</div>' +
      '<div class="cr-body" id="cr-body">' +
        /* ── VU Meter / Active Speaker ── */
        '<div class="cr-vu-container" id="cr-vu-container">' +
          '<div class="cr-vu-bar-track">' +
            '<div class="cr-vu-bar-fill" id="cr-vu-bar-fill"></div>' +
          '</div>' +
          '<div class="cr-peers-vu" id="cr-peers-vu"></div>' +
        '</div>' +
        /* ── Channels (always visible, clickable) ── */
        channelHtml +
        txChannelHtml +
        /* ── Peer count ── */
        '<div class="cr-peer-count" id="cr-peer-count">Connecting...</div>' +
        /* ── PTT ── */
        '<button class="cr-ptt-btn" id="cr-ptt-btn">🔴 PTT (Space)</button>' +
        /* ── Volume ── */
        '<div class="cr-volume-row">' +
          '<label class="cr-volume-label">Volume</label>' +
          '<input type="range" class="cr-volume-slider" id="cr-volume-slider" min="0" max="100" value="80">' +
        '</div>' +
      '</div>';

    // Highlight the initial active channel badge
    var initBadge = $('cr-badge-' + currentCh);
    if (initBadge) {
      initBadge.className = 'cr-channel-badge cr-channel-badge--on';
    }

    document.body.appendChild(widget);
    bindUIEvents();
    updatePTTButtonLabel();
  }

  function bindUIEvents() {
    var pttBtn = $('cr-ptt-btn');
    var volumeSlider = $('cr-volume-slider');

    if (pttBtn) {
      pttBtn.addEventListener('mousedown', function (e) { e.preventDefault(); startTalking(); });
      pttBtn.addEventListener('mouseup', function (e) { e.preventDefault(); stopTalking(); });
      pttBtn.addEventListener('mouseleave', function () { stopTalking(); });
      pttBtn.addEventListener('touchstart', function (e) { e.preventDefault(); startTalking(); });
      pttBtn.addEventListener('touchend', function (e) { e.preventDefault(); stopTalking(); });
    }

    // Channel badge click — switch active channel (single-channel users) or
    // select TX channel (dispatchers)
    document.addEventListener('click', function (e) {
      var badge = e.target.closest('.cr-channel-badge');
      if (badge) {
        var ch = badge.getAttribute('data-channel');
        if (!ch) return;

        if (isMultiChannel) {
          // Dispatchers: clicking a channel badge switches TX channel
          if (ch !== transmitChannel) {
            transmitChannel = ch;
            document.querySelectorAll('.cr-tx-option').forEach(function (o) {
              o.classList.toggle('cr-tx-option--active', o.getAttribute('data-tx') === ch);
            });
            updatePTTButtonLabel();
          }
        } else {
          // Single-channel user: switch to this channel
          if (ch !== activeChannels[0]) {
            switchChannel(ch);
          }
        }
        return;
      }

      // Transmit channel selector (dispatchers only)
      if (isMultiChannel) {
        var opt = e.target.closest('.cr-tx-option');
        if (!opt) return;
        var ch = opt.getAttribute('data-tx');
        if (ch && ch !== transmitChannel) {
          transmitChannel = ch;
          document.querySelectorAll('.cr-tx-option').forEach(function (o) {
            o.classList.toggle('cr-tx-option--active', o.getAttribute('data-tx') === ch);
          });
          updatePTTButtonLabel();
        }
      }
    });

    if (volumeSlider) {
      volumeSlider.addEventListener('input', function () {
        adjustVolume(this.value / 100);
      });
    }

    // Global keyboard PTT
    document.addEventListener('keydown', function (e) {
      if (isInputFocused()) return;
      if (matchPTTKey(e) && !e.repeat) {
        e.preventDefault();
        startTalking();
      }
    });

    document.addEventListener('keyup', function (e) {
      if (isInputFocused()) return;
      if (matchPTTKey(e)) {
        e.preventDefault();
        stopTalking();
      }
    });
  }

  function isInputFocused() {
    var el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function matchPTTKey(e) {
    var pttKey = getPTTKey();
    if (pttKey === ' ') return e.key === ' ';
    return e.key === pttKey || e.code === pttKey || e.key.toLowerCase() === pttKey.toLowerCase();
  }

  function updatePTTButtonLabel() {
    var btn = $('cr-ptt-btn');
    if (btn) btn.textContent = '🔴 PTT (' + getPTTKeyDisplay() + ')';
  }

  function updateStatus(text, isActive) {
    var el = $('cr-status');
    if (el) {
      el.textContent = text;
      el.className = 'cr-status' + (isActive ? ' cr-status--active' : '');
    }
  }

  function updateChannelBadge(ch, connected) {
    var badge = $('cr-badge-' + ch);
    if (!badge) return;
    // For single-channel users, only the active channel shows as connected
    var isActive = isMultiChannel ? connected : (ch === activeChannels[0] && connected);
    badge.className = 'cr-channel-badge' + (isActive ? ' cr-channel-badge--on' : ' cr-channel-badge--off');
  }

  function updatePeerCount() {
    var el = $('cr-peer-count');
    if (!el) return;

    var totalPeers = 0;
    var parts = [];
    activeChannels.forEach(function (ch) {
      var chState = channels[ch];
      if (!chState) return;
      var count = Object.keys(chState.peerConnections).length;
      totalPeers += count;
      if (count > 0) {
        parts.push(ch + ':' + count);
      }
    });

    if (totalPeers === 0) {
      el.textContent = 'No one on air';
    } else {
      el.textContent = totalPeers + ' online' + (parts.length ? ' (' + parts.join(' ') + ')' : '');
    }
  }

  /* ════════════════════════════════════════════════════════════
     ACTIVE SPEAKER VISUALISER (VU Meter)
  ════════════════════════════════════════════════════════════ */

  function setupAnalyser(channel, peerId, stream) {
    var ctx = getAudioContext();
    if (!ctx) return;

    var chState = channels[channel];
    if (!chState) return;

    var fullId = channel + ':' + peerId;

    if (chState.peerAnalysers[fullId]) {
      try { chState.peerAnalysers[fullId].sourceNode.disconnect(); } catch (_) {}
      delete chState.peerAnalysers[fullId];
    }

    var sourceNode = ctx.createMediaStreamSource(stream);
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    sourceNode.connect(analyser);

    var dataArray = new Uint8Array(analyser.frequencyBinCount);

    chState.peerAnalysers[fullId] = {
      analyser: analyser,
      dataArray: dataArray,
      sourceNode: sourceNode,
      level: 0,
      channel: channel,
    };

    startVUMeter();
  }

  function startVUMeter() {
    if (animFrameId) return;
    animateVU();
  }

  function stopVUMeter() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function animateVU() {
    animFrameId = requestAnimationFrame(animateVU);

    var fillEl = $('cr-vu-bar-fill');
    var peersVuEl = $('cr-peers-vu');
    if (!fillEl) return;

    var maxLevel = 0;
    var speakingPeers = []; // { label, level, channel }

    activeChannels.forEach(function (ch) {
      var chState = channels[ch];
      if (!chState) return;

      Object.keys(chState.peerAnalysers).forEach(function (fullId) {
        var p = chState.peerAnalysers[fullId];
        if (!p || !p.analyser) return;

        try {
          p.analyser.getByteFrequencyData(p.dataArray);
          var sum = 0;
          for (var i = 0; i < p.dataArray.length; i++) {
            sum += p.dataArray[i];
          }
          var avg = sum / (p.dataArray.length * 255);
          p.level = p.level * 0.7 + avg * 0.3;

          if (p.level > maxLevel) maxLevel = p.level;

          if (p.level > 0.05) {
            var label = p.channel + ' ' + fullId.split(':')[1].replace('peer_', 'Unit ');
            speakingPeers.push({ label: label, level: p.level, channel: p.channel });
          }
        } catch (_) {}
      });
    });      if (isTransmitting && localStream) {
        maxLevel = Math.max(maxLevel, 0.6);
        var txLabel = isMultiChannel ? 'You → ' + (transmitChannel || '?') : 'You (' + activeChannels[0] + ')';
        speakingPeers.unshift({ label: txLabel, level: 0.6, channel: null });
      }

    // Sort speaking peers by level descending
    speakingPeers.sort(function (a, b) { return b.level - a.level; });

    // Update VU bar
    var percent = Math.min(maxLevel * 100, 100);
    fillEl.style.width = percent + '%';

    if (maxLevel > 0.7) {
      fillEl.style.background = 'linear-gradient(90deg, #00ff2f, #ffbb00)';
    } else if (maxLevel > 0.3) {
      fillEl.style.background = 'linear-gradient(90deg, #00ff2f, #00b2ff)';
    } else {
      fillEl.style.background = '#00ff2f';
    }

    // Update speaking indicators
    if (peersVuEl) {
      var indicators = peersVuEl.querySelectorAll('.cr-speaking-indicator');
      var oldCount = indicators.length;

      speakingPeers.forEach(function (sp, idx) {
        var indicator;
        if (idx < oldCount) {
          indicator = indicators[idx];
        } else {
          indicator = document.createElement('div');
          indicator.className = 'cr-speaking-indicator';
          peersVuEl.appendChild(indicator);
        }

        var dotColor = sp.channel ? (CHANNEL_COLORS[sp.channel] || '#00ff2f') : '#00ff2f';
        indicator.innerHTML =
          '<span class="cr-speaking-dot" style="background:' + dotColor + '"></span>' +
          '<span class="cr-speaking-name">' + sp.label + '</span>';
        indicator.style.opacity = '1';
      });

      while (peersVuEl.children.length > speakingPeers.length) {
        peersVuEl.removeChild(peersVuEl.lastChild);
      }
    }
  }

  /* ════════════════════════════════════════════════════════════
     WEBSOCKET SIGNALING (per channel)
  ════════════════════════════════════════════════════════════ */

  function getWSProtocol() {
    return window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  }

  function getWSUrl(channel) {
    var token = get(TOKEN_KEY) || '';
    var serverId = get(SERVER_KEY) || '';
    return getWSProtocol() + '//' + window.location.host +
      '/radio?token=' + encodeURIComponent(token) +
      '&serverId=' + encodeURIComponent(serverId) +
      '&channel=' + encodeURIComponent(channel);
  }

  function connectChannel(ch) {
    var chState = channels[ch];
    if (!chState) {
      chState = {
        ws: null,
        peerId: null,
        peerConnections: {},
        peerAudioElements: {},
        peerAnalysers: {},
        isConnected: false,
        reconnectTimer: null,
      };
      channels[ch] = chState;
    }

    if (chState.isConnected) return;
    if (chState.reconnectTimer) {
      clearTimeout(chState.reconnectTimer);
      chState.reconnectTimer = null;
    }

    var token = get(TOKEN_KEY);
    var serverId = get(SERVER_KEY);
    if (!token || !serverId) return;

    var url = getWSUrl(ch);

    try {
      chState.ws = new WebSocket(url);
    } catch (err) {
      scheduleChannelReconnect(ch);
      return;
    }

    var ws = chState.ws;

    ws.onopen = function () {
      chState.isConnected = true;
      updateChannelBadge(ch, true);
      updateOverallStatus();
    };

    ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
        handleSignalingMessage(ch, msg);
      } catch (_) {}
    };

    ws.onclose = function () {
      chState.isConnected = false;
      cleanupChannelPeers(ch);
      updateChannelBadge(ch, false);
      updateOverallStatus();
      scheduleChannelReconnect(ch);
    };

    ws.onerror = function () {};
  }

  function scheduleChannelReconnect(ch) {
    var chState = channels[ch];
    if (!chState) return;
    if (chState.reconnectTimer) return;
    chState.reconnectTimer = setTimeout(function () {
      chState.reconnectTimer = null;
      if (!chState.isConnected) {
        connectChannel(ch);
      }
    }, 5000);
  }

  function disconnectChannel(ch) {
    var chState = channels[ch];
    if (!chState) return;
    if (chState.reconnectTimer) {
      clearTimeout(chState.reconnectTimer);
      chState.reconnectTimer = null;
    }
    cleanupChannelPeers(ch);
    if (chState.ws) {
      try { chState.ws.close(); } catch (_) {}
      chState.ws = null;
    }
    chState.isConnected = false;
    updateChannelBadge(ch, false);
  }

  function disconnectAll() {
    activeChannels.forEach(function (ch) { disconnectChannel(ch); });
    updateOverallStatus();
  }

  function updateOverallStatus() {
    var connectedCount = 0;
    activeChannels.forEach(function (ch) {
      var cs = channels[ch];
      if (cs && cs.isConnected) connectedCount++;
    });

    if (connectedCount === 0) {
      updateStatus('Disconnected', false);
    } else if (isMultiChannel) {
      updateStatus(connectedCount + '/' + activeChannels.length + ' channels', true);
    } else {
      updateStatus(activeChannels[0], true);
    }
    updatePeerCount();
  }

  /* ════════════════════════════════════════════════════════════
     SIGNALING MESSAGE HANDLER
  ════════════════════════════════════════════════════════════ */

  function handleSignalingMessage(ch, msg) {
    var chState = channels[ch];
    if (!chState) return;

    switch (msg.type) {
      case 'joined':
        chState.peerId = msg.peerId;
        (msg.peers || []).forEach(function (peerId) {
          createPeerConnection(ch, peerId, true);
        });
        updateOverallStatus();
        break;

      case 'peer-joined':
        createPeerConnection(ch, msg.peerId, false);
        break;

      case 'peer-left':
        cleanupPeer(ch, msg.peerId);
        updateOverallStatus();
        break;

      case 'offer':
        handleOffer(ch, msg.sender, msg.sdp);
        break;

      case 'answer':
        handleAnswer(ch, msg.sender, msg.sdp);
        break;

      case 'ice-candidate':
        handleIceCandidate(ch, msg.sender, msg.candidate);
        break;

      case 'channel-active':
        // Update specific channel count
        updateOverallStatus();
        break;
    }
  }

  function sendToChannel(ch, obj) {
    var chState = channels[ch];
    if (chState && chState.ws && chState.ws.readyState === 1) {
      try { chState.ws.send(JSON.stringify(obj)); } catch (_) {}
    }
  }

  /* ════════════════════════════════════════════════════════════
     WEBRTC PEER CONNECTIONS (per channel)
  ════════════════════════════════════════════════════════════ */

  function createPeerConnection(ch, peerId, initiator) {
    var chState = channels[ch];
    if (!chState) return null;

    if (chState.peerConnections[peerId]) return chState.peerConnections[peerId];

    var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    chState.peerConnections[peerId] = pc;

    if (channelTracks[ch]) {
      pc.addTrack(channelTracks[ch], localStream);
    } else if (localStream) {
      localStream.getTracks().forEach(function (track) {
        pc.addTrack(track, localStream);
      });
    }

    pc.onicecandidate = function (event) {
      if (event.candidate) {
        sendToChannel(ch, { type: 'ice-candidate', target: peerId, candidate: event.candidate });
      }
    };

    pc.ontrack = function (event) {
      var fullId = ch + ':' + peerId;
      var audioEl = chState.peerAudioElements[fullId];
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        audioEl.volume = getVolumeLevel();
        chState.peerAudioElements[fullId] = audioEl;
      }
      audioEl.srcObject = event.streams[0];

      setupAnalyser(ch, peerId, event.streams[0]);
    };

    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        cleanupPeer(ch, peerId);
        updateOverallStatus();
      }
    };

    if (initiator) {
      pc.createOffer()
        .then(function (offer) { return pc.setLocalDescription(offer); })
        .then(function () { sendToChannel(ch, { type: 'offer', target: peerId, sdp: pc.localDescription }); })
        .catch(function () { cleanupPeer(ch, peerId); });
    }

    return pc;
  }

  function handleOffer(ch, senderId, sdp) {
    var chState = channels[ch];
    if (!chState) return;
    var pc = createPeerConnection(ch, senderId, false);
    if (!pc) return;
    pc.setRemoteDescription(new RTCSessionDescription(sdp))
      .then(function () { return pc.createAnswer(); })
      .then(function (answer) { return pc.setLocalDescription(answer); })
      .then(function () { sendToChannel(ch, { type: 'answer', target: senderId, sdp: pc.localDescription }); })
      .catch(function () { cleanupPeer(ch, senderId); });
  }

  function handleAnswer(ch, senderId, sdp) {
    var chState = channels[ch];
    if (!chState) return;
    var pc = chState.peerConnections[senderId];
    if (!pc) return;
    pc.setRemoteDescription(new RTCSessionDescription(sdp)).catch(function () {});
  }

  function handleIceCandidate(ch, senderId, candidate) {
    var chState = channels[ch];
    if (!chState) return;
    var pc = chState.peerConnections[senderId];
    if (!pc) return;
    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(function () {});
  }

  function cleanupPeer(ch, peerId) {
    var chState = channels[ch];
    if (!chState) return;

    var pc = chState.peerConnections[peerId];
    if (pc) {
      try { pc.close(); } catch (_) {}
      delete chState.peerConnections[peerId];
    }

    var fullId = ch + ':' + peerId;
    var audioEl = chState.peerAudioElements[fullId];
    if (audioEl) {
      try { audioEl.pause(); audioEl.srcObject = null; } catch (_) {}
      delete chState.peerAudioElements[fullId];
    }

    if (chState.peerAnalysers[fullId]) {
      try { chState.peerAnalysers[fullId].sourceNode.disconnect(); } catch (_) {}
      delete chState.peerAnalysers[fullId];
    }
  }

  function cleanupChannelPeers(ch) {
    var chState = channels[ch];
    if (!chState) return;
    Object.keys(chState.peerConnections).forEach(function (pid) {
      cleanupPeer(ch, pid);
    });
  }

  /* ── Channel switching (single-channel users) ───────────── */

  function switchChannel(newCh) {
    if (!newCh || newCh === activeChannels[0]) return;

    var oldCh = activeChannels[0];

    // Disconnect from old channel
    disconnectChannel(oldCh);

    // Stop the old cloned track
    if (channelTracks[oldCh]) {
      try { channelTracks[oldCh].stop(); } catch (_) {}
      delete channelTracks[oldCh];
    }

    // Update active channels
    activeChannels = [newCh];
    transmitChannel = newCh;

    // Clone mic track for the new channel if mic is available
    if (localStream) {
      var originalTrack = localStream.getAudioTracks()[0];
      if (originalTrack) {
        var cloned = originalTrack.clone();
        cloned.enabled = false;
        channelTracks[newCh] = cloned;
      }
    }

    // Update badge visuals
    document.querySelectorAll('.cr-channel-badge').forEach(function (b) {
      var ch = b.getAttribute('data-channel');
      b.className = 'cr-channel-badge' + (ch === newCh ? ' cr-channel-badge--on' : ' cr-channel-badge--off');
    });

    // Connect to the new channel
    connectChannel(newCh);

    updatePTTButtonLabel();
    updateOverallStatus();
  }

  /* ════════════════════════════════════════════════════════════
     AUDIO – MIC & PTT
  ════════════════════════════════════════════════════════════ */

  function addLocalStreamToChannel(ch) {
    var chState = channels[ch];
    if (!chState || !localStream) return;
    // Use channel-specific cloned track if available
    var track = channelTracks[ch] || localStream.getAudioTracks()[0];
    Object.keys(chState.peerConnections).forEach(function (peerId) {
      var pc = chState.peerConnections[peerId];
      if (pc) {
        pc.addTrack(track, localStream);
      }
    });
  }

  function setupMicrophone() {
    if (localStream) return Promise.resolve();

    return navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        localStream = stream;

        // Clone the mic track for each active channel (allows per-channel TX control)
        var originalTrack = stream.getAudioTracks()[0];
        activeChannels.forEach(function (ch) {
          var cloned = originalTrack.clone();
          cloned.enabled = false;
          channelTracks[ch] = cloned;
        });
        // Mute the original track
        originalTrack.enabled = false;

        // Add cloned tracks to existing peer connections
        activeChannels.forEach(function (ch) {
          addLocalStreamToChannel(ch);
        });

        return stream;
      })
      .catch(function (err) {
        console.warn('Radio: Could not access microphone:', err.message);
        updateStatus('No Mic Access', false);
        throw err;
      });
  }

  function startTalking() {
    if (isPTTActive) return;
    isPTTActive = true;

    var pttBtn = $('cr-ptt-btn');
    if (pttBtn) pttBtn.classList.add('cr-ptt-btn--active');

    if (areBeepsEnabled()) playBeep(true);

    if (!localStream) {
      setupMicrophone()
        .then(function () { enableMic(true); })
        .catch(function () {
          isPTTActive = false;
          if (pttBtn) pttBtn.classList.remove('cr-ptt-btn--active');
        });
    } else {
      enableMic(true);
    }
  }

  function stopTalking() {
    if (!isPTTActive) return;
    isPTTActive = false;

    var pttBtn = $('cr-ptt-btn');
    if (pttBtn) pttBtn.classList.remove('cr-ptt-btn--active');

    if (areBeepsEnabled()) playBeep(false);

    enableMic(false);
  }

  function enableMic(enabled) {
    if (!localStream) return;

    // Use per-channel cloned tracks for both multi and single channel
    Object.keys(channelTracks).forEach(function (ch) {
      channelTracks[ch].enabled = enabled && ch === transmitChannel;
    });

    isTransmitting = enabled;

    var pttBtn = $('cr-ptt-btn');
    if (pttBtn) {
      var txLabel = transmitChannel || activeChannels[0] || '?';
      pttBtn.textContent = enabled
        ? '🎙️ ' + txLabel + ' (' + getPTTKeyDisplay() + ')'
        : '🔴 PTT (' + getPTTKeyDisplay() + ')';
    }
  }

  function getVolumeLevel() {
    var slider = $('cr-volume-slider');
    return slider ? (slider.value / 100) : 0.8;
  }

  function adjustVolume(level) {
    activeChannels.forEach(function (ch) {
      var chState = channels[ch];
      if (!chState) return;
      Object.keys(chState.peerAudioElements).forEach(function (id) {
        var el = chState.peerAudioElements[id];
        if (el) el.volume = level;
      });
    });
  }

  /* ════════════════════════════════════════════════════════════
     RADIO TOGGLE – Bottom-right show/hide button
  ════════════════════════════════════════════════════════════ */

  var radioVisible = true;

  function createToggleButton() {
    if ($('cad-radio-toggle')) return;

    var btn = document.createElement('button');
    btn.id = 'cad-radio-toggle';
    btn.className = 'cad-radio-toggle';
    btn.textContent = '📡';
    btn.title = 'Toggle Radio';
    document.body.appendChild(btn);

    btn.addEventListener('click', function () {
      toggleRadio();
    });
  }

  function toggleRadio() {
    radioVisible = !radioVisible;
    var widget = $('cad-radio-widget');
    var btn = $('cad-radio-toggle');
    if (!widget || !btn) return;

    if (radioVisible) {
      widget.classList.remove('cad-radio-widget--collapsed');
      btn.classList.remove('cad-radio-toggle--hidden');
      btn.textContent = '📡';
      btn.title = 'Hide Radio';
    } else {
      widget.classList.add('cad-radio-widget--collapsed');
      btn.classList.add('cad-radio-toggle--hidden');
      btn.textContent = '📡';
      btn.title = 'Show Radio';
    }
  }

  /* ════════════════════════════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════════════════════════════ */

  Radio.toggle = toggleRadio;

  Radio.isVisible = function () { return radioVisible; };

  Radio.setPTTKey = function (key) {
    set(PTT_KEY_STORAGE, key);
    updatePTTButtonLabel();
    if (isTransmitting) {
      var btn = $('cr-ptt-btn');
      if (btn) {
        var txLabel = transmitChannel || activeChannels[0] || '?';
        btn.textContent = '🎙️ ' + txLabel + ' (' + getPTTKeyDisplay() + ')';
      }
    }
  };

  Radio.getPTTKey = getPTTKey;
  Radio.getPTTKeyDisplay = getPTTKeyDisplay;

  /* ════════════════════════════════════════════════════════════
     INITIALISATION
  ════════════════════════════════════════════════════════════ */

  Radio.init = function () {
    var token = get(TOKEN_KEY);
    var serverId = get(SERVER_KEY);
    if (!token || !serverId) {
      setTimeout(Radio.init, 3000);
      return;
    }

    activeChannels = detectChannels();
    transmitChannel = activeChannels[0]; // default TX channel
    createWidget();
    createToggleButton();
    setupMicrophone().catch(function () {});

    // Connect to all active channels
    activeChannels.forEach(function (ch) {
      connectChannel(ch);
    });

    updateOverallStatus();
  };

  Radio.destroy = function () {
    stopVUMeter();
    disconnectAll();
    // Stop per-channel cloned tracks
    Object.keys(channelTracks).forEach(function (ch) {
      try { channelTracks[ch].stop(); } catch (_) {}
    });
    channelTracks = {};
    if (localStream) {
      localStream.getTracks().forEach(function (t) { t.stop(); });
      localStream = null;
    }
    var widget = $('cad-radio-widget');
    if (widget) widget.remove();
    var toggleBtn = $('cad-radio-toggle');
    if (toggleBtn) toggleBtn.remove();
  };

  /* ── Expose globally ────────────────────────────────────── */
  global.CAD.Radio = Radio;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', Radio.init);
  } else {
    Radio.init();
  }

}(window));
