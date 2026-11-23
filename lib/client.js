(() => {
  // assets/src/shared/protocol.js
  var URL_PREFIX = "/dsh-closure";
  var STATE_PATH = URL_PREFIX + "/state";
  var CONFIG_PATH = URL_PREFIX + "/config";
  var SIZE_MIN = 0.6;
  var SIZE_MAX = 2;
  var OPACITY_MIN = 0.3;
  var BUBBLE_SCALE_MIN = 50;
  var BUBBLE_SCALE_MAX = 200;
  var BUBBLE_SCALE_BASE = 100;
  var SNAP_STRENGTH_MIN = 0;
  var SNAP_STRENGTH_MAX = 200;
  var LOW_THRESHOLD_DEFAULT = 10;
  var IDLE_CHATTER_MINUTES_DEFAULT = 10;
  var IDLE_CHATTER_CHANCE_DEFAULT = 0.5;
  var DIALOGUE_KEYS = [
    "idle",
    "sadIdle",
    "thinkIdle",
    "lowBalance",
    "credited",
    "peakTime",
    "valleyTime",
    "turnInterrupted",
    "error",
    "toolSuccess",
    "turnEnd",
    "interact",
    "interactIdle",
    "interactSadIdle",
    "interactThinkIdle"
  ];
  function normalizeDialogues(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const key of DIALOGUE_KEYS) {
      const list = raw[key];
      if (!Array.isArray(list)) continue;
      const rows = list.map((item) => String(item == null ? "" : item).trim()).filter(Boolean).slice(0, 40).map((item) => item.slice(0, 200));
      if (rows.length) out[key] = rows;
    }
    return out;
  }
  var SETTINGS_DEFAULTS = Object.freeze({
    mirror: "auto",
    size: 1,
    bubble: true,
    // 气泡缩放：100% 为基准；50%–200%
    bubbleScale: BUBBLE_SCALE_BASE,
    // 分级排版：金额大、辅助信息小的多字号排版（关掉后统一字号）
    bubbleTiers: true,
    // 边缘吸附强度：200% = 旧行为（屏幕外侧 1/4），0% = 不吸附
    snapStrength: SNAP_STRENGTH_MAX,
    opacity: 1,
    sound: true,
    volume: 0.7,
    voice: false,
    voiceLang: "zh",
    voiceVolume: 0.7,
    lowThreshold: LOW_THRESHOLD_DEFAULT,
    idleChatterMinutes: IDLE_CHATTER_MINUTES_DEFAULT,
    idleChatterChance: IDLE_CHATTER_CHANCE_DEFAULT,
    dialogues: {}
  });
  function normalizeSettings(raw, base) {
    const out = { ...base || SETTINGS_DEFAULTS };
    if (!raw || typeof raw !== "object") return out;
    if (raw.mirror === "auto" || raw.mirror === "always" || raw.mirror === "never") out.mirror = raw.mirror;
    const size = Number(raw.size);
    if (Number.isFinite(size)) out.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, size));
    if (typeof raw.bubble === "boolean") out.bubble = raw.bubble;
    const bubbleScale = Number(raw.bubbleScale);
    if (Number.isFinite(bubbleScale)) {
      out.bubbleScale = Math.min(BUBBLE_SCALE_MAX, Math.max(BUBBLE_SCALE_MIN, bubbleScale));
    }
    if (typeof raw.bubbleTiers === "boolean") out.bubbleTiers = raw.bubbleTiers;
    const snapStrength = Number(raw.snapStrength);
    if (Number.isFinite(snapStrength)) {
      out.snapStrength = Math.min(SNAP_STRENGTH_MAX, Math.max(SNAP_STRENGTH_MIN, snapStrength));
    }
    const opacity = Number(raw.opacity);
    if (Number.isFinite(opacity)) out.opacity = Math.min(1, Math.max(OPACITY_MIN, opacity));
    if (typeof raw.sound === "boolean") out.sound = raw.sound;
    const volume = Number(raw.volume);
    if (Number.isFinite(volume)) out.volume = Math.min(1, Math.max(0, volume));
    if (typeof raw.voice === "boolean") out.voice = raw.voice;
    if (raw.voiceLang === "zh" || raw.voiceLang === "ja") out.voiceLang = raw.voiceLang;
    const voiceVolume = Number(raw.voiceVolume);
    if (Number.isFinite(voiceVolume)) out.voiceVolume = Math.min(1, Math.max(0, voiceVolume));
    const lowThreshold = Number(raw.lowThreshold);
    if (Number.isFinite(lowThreshold)) out.lowThreshold = Math.min(1e6, Math.max(0, lowThreshold));
    const idleChatterMinutes = Number(raw.idleChatterMinutes);
    if (Number.isFinite(idleChatterMinutes)) out.idleChatterMinutes = Math.min(1440, Math.max(0, idleChatterMinutes));
    const idleChatterChance = Number(raw.idleChatterChance);
    if (Number.isFinite(idleChatterChance)) out.idleChatterChance = Math.min(1, Math.max(0, idleChatterChance));
    if (raw.dialogues && typeof raw.dialogues === "object") {
      out.dialogues = { ...normalizeDialogues(out.dialogues), ...normalizeDialogues(raw.dialogues) };
    }
    return out;
  }

  // assets/src/core/env.js
  var PREFIX = "/dsh-closure";
  var CANVAS_W = 300;
  var FRAME = { x: -229.1, y: -10.6, w: 443.6, h: 373.4 };
  var MARGIN = 12;
  var POS_KEY = "dshcl-pos";
  var SETTINGS_KEY = "dshcl-settings";
  var DRAG_THRESHOLD_SQ = 9;
  function numOverride(key, fallback) {
    var raw;
    try {
      raw = localStorage.getItem(key);
    } catch (e) {
      return fallback;
    }
    if (raw === null || raw === "") return fallback;
    var v = Number(raw);
    return isFinite(v) && v >= 0 ? v : fallback;
  }
  var STARTUP_DELAY = numOverride("dshcl-startup-delay", 5e3);
  var STARTUP_GAP = numOverride("dshcl-startup-gap", 2e3);
  var log = function() {
    try {
      console.info.apply(console, ["[closure-pet]"].concat([].slice.call(arguments)));
    } catch (e) {
    }
  };
  var warn = function() {
    try {
      console.warn.apply(console, ["[closure-pet]"].concat([].slice.call(arguments)));
    } catch (e) {
    }
  };

  // assets/src/core/settings.js
  var settings = { ...SETTINGS_DEFAULTS };
  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      var v = JSON.parse(raw);
      if (!v || typeof v !== "object") return;
      Object.assign(settings, normalizeSettings(v, settings));
    } catch (err) {
    }
  }
  var saveTimer = 0;
  function saveSettings(immediate) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        mirror: settings.mirror,
        size: settings.size,
        bubble: settings.bubble,
        bubbleScale: settings.bubbleScale,
        bubbleTiers: settings.bubbleTiers,
        snapStrength: settings.snapStrength,
        opacity: settings.opacity,
        sound: settings.sound,
        volume: settings.volume,
        voice: settings.voice,
        voiceLang: settings.voiceLang,
        voiceVolume: settings.voiceVolume,
        lowThreshold: settings.lowThreshold,
        idleChatterMinutes: settings.idleChatterMinutes,
        idleChatterChance: settings.idleChatterChance,
        dialogues: settings.dialogues || {}
      }));
    } catch (err) {
    }
    clearTimeout(saveTimer);
    var push = function() {
      try {
        var payload = {
          mirror: settings.mirror,
          size: settings.size,
          bubble: settings.bubble,
          bubbleScale: settings.bubbleScale,
          bubbleTiers: settings.bubbleTiers,
          snapStrength: settings.snapStrength,
          opacity: settings.opacity,
          sound: settings.sound,
          volume: settings.volume,
          voice: settings.voice,
          voiceLang: settings.voiceLang,
          voiceVolume: settings.voiceVolume
        };
        if (settings.hostLoaded) {
          payload.lowThreshold = settings.lowThreshold;
          payload.idleChatterMinutes = settings.idleChatterMinutes;
          payload.idleChatterChance = settings.idleChatterChance;
          payload.dialogues = settings.dialogues || {};
        }
        fetch(PREFIX + "/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: payload })
        }).catch(function() {
        });
      } catch (err) {
      }
    };
    if (immediate) push();
    else saveTimer = setTimeout(push, 400);
  }
  loadSettings();

  // assets/src/render/hit-test.js
  var HIT_MASK_W = 128;
  var HIT_MASK_H = 108;
  var HIT_GROW = 6;
  var HIT_FORMS = [
    ["e", 13, 265, 78, 48],
    // 头 / 头发
    ["e", -74.5, 232, 32, 23],
    // 左双马尾
    ["e", 60, 264, 30, 42],
    // 右双马尾
    ["e", -80, 123.5, 46, 50],
    // 左袖
    ["e", 70, 143, 46.5, 74],
    // 右袖
    ["r", -98, 71.5, 94, 318, 34],
    // 躯干
    ["r", -53.5, 9.5, 46, 96, 19],
    // 腿
    ["c", -38, 24, 15, 19.5, 30],
    // 鞋
    ["e", -158, 222, 71, 74],
    // 左小飞机（含蝙蝠）
    ["e", 141, 246, 67, 76],
    // 右小飞机（含蝙蝠）
    ["e", 93, 40, 87, 48]
    // 右下角游戏卡
  ];
  function hitFormIn(form, x, y) {
    var g = HIT_GROW;
    if (form[0] === "e") {
      var ex = (x - form[1]) / (form[3] + g);
      var ey = (y - form[2]) / (form[4] + g);
      return ex * ex + ey * ey <= 1;
    }
    if (form[0] === "r") {
      var x0 = form[1] - g;
      var y0 = form[2] - g;
      var x1 = form[3] + g;
      var y1 = form[4] + g;
      var rr = form[5] + g;
      var cx = Math.min(Math.max(x, x0 + rr), x1 - rr);
      var cy = Math.min(Math.max(y, y0 + rr), y1 - rr);
      var dx = x - cx;
      var dy = y - cy;
      return dx * dx + dy * dy <= rr * rr;
    }
    var ax = form[1], ay = form[2], bx = form[3], by = form[4];
    var rad = form[5] + g;
    var vx = bx - ax, vy = by - ay;
    var len2 = vx * vx + vy * vy;
    var t = len2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / len2 : 0;
    t = Math.min(Math.max(t, 0), 1);
    var px = ax + t * vx, py = ay + t * vy;
    var ddx = x - px, ddy = y - py;
    return ddx * ddx + ddy * ddy <= rad * rad;
  }
  function buildHitMask() {
    var m = new Uint8Array(HIT_MASK_W * HIT_MASK_H);
    for (var my = 0; my < HIT_MASK_H; my++) {
      var wy = FRAME.y + FRAME.h - (my + 0.5) / HIT_MASK_H * FRAME.h;
      for (var mx = 0; mx < HIT_MASK_W; mx++) {
        var wx = FRAME.x + (mx + 0.5) / HIT_MASK_W * FRAME.w;
        for (var k = 0; k < HIT_FORMS.length; k++) {
          if (hitFormIn(HIT_FORMS[k], wx, wy)) {
            m[my * HIT_MASK_W + mx] = 1;
            break;
          }
        }
      }
    }
    return m;
  }
  function maskHit(mask, nx, ny) {
    if (!(nx >= 0 && nx < 1 && ny >= 0 && ny < 1)) return false;
    var mx = Math.floor(nx * HIT_MASK_W);
    var my = Math.floor(ny * HIT_MASK_H);
    if (mx >= HIT_MASK_W) mx = HIT_MASK_W - 1;
    if (my >= HIT_MASK_H) my = HIT_MASK_H - 1;
    return mask[my * HIT_MASK_W + mx] === 1;
  }

  // assets/src/anim/library.js
  var CLIP_FADE_MS = 320;
  var HAPPY_CHANCE = 0.25;
  var CLIPS = {
    Idle: { src: "idle.webm", duration: 1.467, loop: true },
    Sad_Idle: { src: "sad_idle.webm", duration: 2.133, loop: true },
    Think_Idle: { src: "think_idle.webm", duration: 2.133, loop: true },
    Happy: { src: "happy.webm", duration: 2.833 },
    Sad_Begin: { src: "sad_begin.webm", duration: 2.567 },
    Sad_Exit: { src: "sad_exit.webm", duration: 2.567 },
    Think_Begin: { src: "think_begin.webm", duration: 1.567 },
    Think_Exit: { src: "think_exit.webm", duration: 1.567 },
    Celebrate: { src: "celebrate.webm", duration: 2 },
    Talk: { src: "talk.webm", duration: 5 },
    Interact_1: { src: "interact_1.webm", duration: 2.4 },
    Interact_2: { src: "interact_2.webm", duration: 2.167 }
  };
  var ANIMATION_NAMES = [
    "Idle",
    "Sad_Idle",
    "Think_Idle",
    "Happy",
    "Sad_Begin",
    "Think_Begin",
    "Celebrate",
    "Talk",
    "Interact_1",
    "Interact_2"
  ];

  // assets/src/audio.js
  var SOUND_FILES = ["click", "fail", "coin", "turnfail"];
  function createAudio(getSettings) {
    var audioCtx = null;
    var soundBuffers = {};
    var soundLoaded = false;
    function audioEnsure() {
      if (!audioCtx) {
        try {
          var Ctor = window.AudioContext || window.webkitAudioContext;
          if (Ctor) audioCtx = new Ctor();
        } catch (err) {
          audioCtx = null;
        }
      }
      if (audioCtx && audioCtx.state === "suspended") {
        try {
          audioCtx.resume().catch(function() {
          });
        } catch (err) {
        }
      }
      return audioCtx;
    }
    function loadSounds() {
      if (soundLoaded) return;
      soundLoaded = true;
      var ctx = audioEnsure();
      if (!ctx) return;
      SOUND_FILES.forEach(function(name) {
        soundBuffers[name] = null;
        fetch(PREFIX + "/assets/audio/" + name + ".ogg", { cache: "force-cache" }).then(function(r) {
          return r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)));
        }).then(function(buf) {
          return ctx.decodeAudioData(buf);
        }).then(function(decoded) {
          soundBuffers[name] = decoded;
        }).catch(function() {
          delete soundBuffers[name];
        });
      });
    }
    function playSound(name) {
      var s = getSettings();
      if (!s.sound) return;
      if (s.volume <= 0.01) return;
      var ctx = audioEnsure();
      if (!ctx) return;
      var buf = soundBuffers[name];
      if (buf === void 0) {
        loadSounds();
        return;
      }
      if (!buf) return;
      try {
        var src = ctx.createBufferSource();
        var gain = ctx.createGain();
        src.buffer = buf;
        gain.gain.value = Math.min(1, Math.max(0, s.volume));
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start(0);
      } catch (err) {
      }
    }
    function getState() {
      var s = getSettings();
      var out = {};
      Object.keys(soundBuffers).forEach(function(k) {
        out[k] = !!soundBuffers[k];
      });
      return { loaded: out, ctx: audioCtx ? audioCtx.state : null, enabled: s.sound, volume: s.volume };
    }
    return { ensure: audioEnsure, loadSounds, playSound, getState };
  }

  // assets/src/ui/layout.js
  function createLayout(deps) {
    var host = deps.host;
    var canvas = deps.canvas;
    var settings2 = deps.settings;
    var pet = deps.pet;
    function size() {
      return { w: host.offsetWidth || 0, h: host.offsetHeight || 0 };
    }
    function clampPos(x, y) {
      var s = size();
      var maxX = Math.max(0, window.innerWidth - s.w);
      var maxY = Math.max(0, window.innerHeight - s.h);
      return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
    }
    function applyPosition() {
      if (!pet.pos) return;
      host.style.left = Math.round(pet.pos.x) + "px";
      host.style.top = Math.round(pet.pos.y) + "px";
    }
    function setFlipped(next) {
      var value = !!next;
      if (pet.flipped === value) return;
      pet.flipped = value;
      canvas.style.transform = value ? "scaleX(-1)" : "";
    }
    function applyOpacity() {
      canvas.style.opacity = String(settings2.opacity);
    }
    function resolveFlip() {
      if (settings2.mirror === "always") {
        setFlipped(true);
        return;
      }
      if (settings2.mirror === "never") {
        setFlipped(false);
        return;
      }
      setFlipped(pet.anchor && pet.anchor.h === "left");
    }
    function defaultPos() {
      var s = size();
      return clampPos(window.innerWidth - s.w - 16, window.innerHeight - s.h - MARGIN);
    }
    function loadPos() {
      try {
        var raw = localStorage.getItem(POS_KEY);
        if (!raw) return null;
        var v = JSON.parse(raw);
        if (!v || typeof v.x !== "number" || typeof v.y !== "number") return null;
        return v;
      } catch (err) {
        return null;
      }
    }
    function savePos() {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({
          x: Math.round(pet.pos.x),
          y: Math.round(pet.pos.y),
          h: pet.anchor.h,
          v: pet.anchor.v,
          flipped: pet.flipped
        }));
      } catch (err) {
      }
    }
    function placeFromStorage() {
      var saved = loadPos();
      var s = size();
      if (saved) {
        pet.anchor = { h: saved.h || null, v: saved.v || null };
        var x = saved.x;
        var y = saved.y;
        if (saved.h === "right") x = window.innerWidth - s.w - MARGIN;
        if (saved.h === "left") x = MARGIN;
        if (saved.v === "bottom") y = window.innerHeight - s.h - MARGIN;
        if (saved.v === "top") y = MARGIN;
        pet.pos = clampPos(x, y);
      } else {
        pet.pos = defaultPos();
        pet.anchor = { h: "right", v: "bottom" };
      }
      resolveFlip();
      applyPosition();
    }
    function repositionForAnchor() {
      var s = size();
      var x = pet.pos ? pet.pos.x : window.innerWidth - s.w - MARGIN;
      var y = pet.pos ? pet.pos.y : window.innerHeight - s.h - MARGIN;
      if (pet.anchor && pet.anchor.h === "right") x = window.innerWidth - s.w - MARGIN;
      if (pet.anchor && pet.anchor.h === "left") x = MARGIN;
      if (pet.anchor && pet.anchor.v === "bottom") y = window.innerHeight - s.h - MARGIN;
      if (pet.anchor && pet.anchor.v === "top") y = MARGIN;
      pet.pos = clampPos(x, y);
      applyPosition();
    }
    function snapFactor() {
      var v = Number(settings2.snapStrength);
      if (!isFinite(v)) v = SNAP_STRENGTH_MAX;
      return Math.min(SNAP_STRENGTH_MAX, Math.max(SNAP_STRENGTH_MIN, v)) / SNAP_STRENGTH_MAX;
    }
    function settle() {
      var s = size();
      var h = null;
      var v = null;
      var zoneX = Math.max(0, window.innerWidth / 4 - s.w / 2) * snapFactor();
      var zoneY = Math.max(0, window.innerHeight / 4 - s.h / 2) * snapFactor();
      if (pet.pos.x < zoneX) h = "left";
      else if (pet.pos.x + s.w > window.innerWidth - zoneX) h = "right";
      if (pet.pos.y < zoneY) v = "top";
      else if (pet.pos.y + s.h > window.innerHeight - zoneY) v = "bottom";
      var targetX = h === "left" ? MARGIN : h === "right" ? window.innerWidth - s.w - MARGIN : pet.pos.x;
      var targetY = v === "top" ? MARGIN : v === "bottom" ? window.innerHeight - s.h - MARGIN : pet.pos.y;
      host.style.transition = "left .22s cubic-bezier(.34,1.56,.64,1), top .22s cubic-bezier(.34,1.56,.64,1), opacity .35s ease";
      pet.pos = clampPos(targetX, targetY);
      pet.anchor = { h, v };
      resolveFlip();
      applyPosition();
      savePos();
    }
    return {
      size,
      clampPos,
      applyPosition,
      setFlipped,
      applyOpacity,
      resolveFlip,
      defaultPos,
      loadPos,
      savePos,
      placeFromStorage,
      repositionForAnchor,
      settle
    };
  }

  // assets/src/ui/panel.js
  function createPanel(deps) {
    var settings2 = deps.settings;
    var saveSettings2 = deps.saveSettings;
    var resolveFlip = deps.resolveFlip;
    var layout = deps.layout;
    var repositionForAnchor = deps.repositionForAnchor;
    var applyOpacity = deps.applyOpacity;
    var hideBubble = deps.hideBubble;
    var refreshBubble = deps.refreshBubble;
    var audioEnsure = deps.audioEnsure;
    var loadSounds = deps.loadSounds;
    var playSound = deps.playSound;
    var size = deps.size;
    var pet = deps.pet;
    var resetPosition = deps.resetPosition;
    var panel = null;
    function panelIsOpen() {
      return !!(panel && panel.style.display === "block");
    }
    function buildPanel() {
      panel = document.createElement("div");
      panel.id = "dsh-closure-pet-settings";
      panel.style.cssText = [
        "position:fixed",
        "z-index:2147482001",
        "display:none",
        "pointer-events:auto",
        "min-width:196px",
        "padding:10px 12px",
        "border-radius:10px",
        'font:12px/1.6 ui-sans-serif,system-ui,"Microsoft YaHei",sans-serif',
        "background:rgba(26,28,36,.97)",
        "color:#e7eaf3",
        "border:1px solid rgba(255,255,255,.14)",
        "box-shadow:0 10px 30px rgba(0,0,0,.45)"
      ].join(";");
      function row(label) {
        var el = document.createElement("div");
        el.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;margin:4px 0";
        var name = document.createElement("span");
        name.textContent = label;
        name.style.cssText = "color:#aab2c8";
        el.appendChild(name);
        panel.appendChild(el);
        return el;
      }
      var mirrorRow = row("\u955C\u50CF");
      var segBox = document.createElement("span");
      segBox.style.cssText = "display:inline-flex;border:1px solid rgba(255,255,255,.18);border-radius:7px;overflow:hidden";
      var mirrorButtons = {};
      [["auto", "\u81EA\u52A8"], ["always", "\u59CB\u7EC8"], ["never", "\u4E0D\u955C\u50CF"]].forEach(function(pair) {
        var btn = document.createElement("button");
        btn.textContent = pair[1];
        btn.dataset.value = pair[0];
        btn.style.cssText = "padding:3px 9px;border:0;background:transparent;color:#cfd6e6;font:inherit;cursor:pointer";
        btn.addEventListener("click", function() {
          settings2.mirror = pair[0];
          saveSettings2();
          resolveFlip();
          syncMirrorButtons();
        });
        mirrorButtons[pair[0]] = btn;
        segBox.appendChild(btn);
      });
      mirrorRow.appendChild(segBox);
      function syncMirrorButtons() {
        Object.keys(mirrorButtons).forEach(function(k) {
          var on = settings2.mirror === k;
          mirrorButtons[k].style.background = on ? "rgba(125,134,255,.85)" : "transparent";
          mirrorButtons[k].style.color = on ? "#fff" : "#cfd6e6";
        });
      }
      var sizeRow = row("\u5927\u5C0F");
      var sizeWrap = document.createElement("span");
      sizeWrap.style.cssText = "display:inline-flex;align-items:center;gap:8px";
      var slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(SIZE_MIN);
      slider.max = String(SIZE_MAX);
      slider.step = "0.05";
      slider.value = String(settings2.size);
      slider.style.cssText = "width:96px;accent-color:#7d86ff;cursor:pointer";
      var sizeText = document.createElement("span");
      sizeText.style.cssText = "width:34px;text-align:right;color:#cfd6e6";
      sizeText.textContent = Math.round(settings2.size * 100) + "%";
      var saveTimer2 = 0;
      slider.addEventListener("input", function() {
        settings2.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number(slider.value) || 1));
        sizeText.textContent = Math.round(settings2.size * 100) + "%";
        layout();
        repositionForAnchor();
        clearTimeout(saveTimer2);
        saveTimer2 = setTimeout(saveSettings2, 250);
      });
      sizeWrap.appendChild(slider);
      sizeWrap.appendChild(sizeText);
      sizeRow.appendChild(sizeWrap);
      var snapRow = row("\u5438\u9644\u5F3A\u5EA6");
      var snapWrap = document.createElement("span");
      snapWrap.style.cssText = "display:inline-flex;align-items:center;gap:8px";
      var snapSlider = document.createElement("input");
      snapSlider.type = "range";
      snapSlider.min = String(SNAP_STRENGTH_MIN);
      snapSlider.max = String(SNAP_STRENGTH_MAX);
      snapSlider.step = "5";
      snapSlider.value = String(settings2.snapStrength);
      snapSlider.style.cssText = "width:96px;accent-color:#7d86ff;cursor:pointer";
      var snapText = document.createElement("span");
      snapText.style.cssText = "width:38px;text-align:right;color:#cfd6e6";
      snapText.textContent = Math.round(settings2.snapStrength) + "%";
      snapSlider.addEventListener("input", function() {
        settings2.snapStrength = Math.min(SNAP_STRENGTH_MAX, Math.max(SNAP_STRENGTH_MIN, Number(snapSlider.value) || 0));
        snapText.textContent = Math.round(settings2.snapStrength) + "%";
        saveSettings2(false);
      });
      snapWrap.appendChild(snapSlider);
      snapWrap.appendChild(snapText);
      snapRow.appendChild(snapWrap);
      var bubbleScaleRow = row("\u6C14\u6CE1\u5927\u5C0F");
      var bubbleScaleWrap = document.createElement("span");
      bubbleScaleWrap.style.cssText = "display:inline-flex;align-items:center;gap:8px";
      var bubbleScaleSlider = document.createElement("input");
      bubbleScaleSlider.type = "range";
      bubbleScaleSlider.min = String(BUBBLE_SCALE_MIN);
      bubbleScaleSlider.max = String(BUBBLE_SCALE_MAX);
      bubbleScaleSlider.step = "5";
      bubbleScaleSlider.value = String(settings2.bubbleScale);
      bubbleScaleSlider.style.cssText = "width:96px;accent-color:#7d86ff;cursor:pointer";
      var bubbleScaleText = document.createElement("span");
      bubbleScaleText.style.cssText = "width:38px;text-align:right;color:#cfd6e6";
      bubbleScaleText.textContent = Math.round(settings2.bubbleScale) + "%";
      bubbleScaleSlider.addEventListener("input", function() {
        settings2.bubbleScale = Math.min(BUBBLE_SCALE_MAX, Math.max(BUBBLE_SCALE_MIN, Number(bubbleScaleSlider.value) || 100));
        bubbleScaleText.textContent = Math.round(settings2.bubbleScale) + "%";
        if (refreshBubble) refreshBubble();
        saveSettings2(false);
      });
      bubbleScaleWrap.appendChild(bubbleScaleSlider);
      bubbleScaleWrap.appendChild(bubbleScaleText);
      bubbleScaleRow.appendChild(bubbleScaleWrap);
      var tiersRow = row("\u66F4\u591A\u5C42\u6B21\u7684\u5B57\u4F53\u89C6\u89C9\u6548\u679C");
      var tiersBtn = document.createElement("button");
      tiersBtn.style.cssText = "padding:3px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#dfe4f0;font:inherit;cursor:pointer";
      function syncTiersBtn() {
        tiersBtn.textContent = settings2.bubbleTiers ? "\u5F00" : "\u5173";
        tiersBtn.style.background = settings2.bubbleTiers ? "rgba(125,134,255,.85)" : "rgba(255,255,255,.06)";
        tiersBtn.style.color = settings2.bubbleTiers ? "#fff" : "#dfe4f0";
      }
      tiersBtn.addEventListener("click", function() {
        settings2.bubbleTiers = !settings2.bubbleTiers;
        syncTiersBtn();
        saveSettings2(true);
        if (refreshBubble) refreshBubble();
      });
      syncTiersBtn();
      tiersRow.appendChild(tiersBtn);
      var bubbleRow = row("\u6C14\u6CE1");
      var bubbleBtn = document.createElement("button");
      bubbleBtn.style.cssText = "padding:3px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#dfe4f0;font:inherit;cursor:pointer";
      function syncBubbleBtn() {
        bubbleBtn.textContent = settings2.bubble ? "\u5F00" : "\u5173";
        bubbleBtn.style.background = settings2.bubble ? "rgba(125,134,255,.85)" : "rgba(255,255,255,.06)";
        bubbleBtn.style.color = settings2.bubble ? "#fff" : "#dfe4f0";
      }
      bubbleBtn.addEventListener("click", function() {
        settings2.bubble = !settings2.bubble;
        syncBubbleBtn();
        saveSettings2(true);
        if (!settings2.bubble) hideBubble();
      });
      syncBubbleBtn();
      bubbleRow.appendChild(bubbleBtn);
      var opaRow = row("\u900F\u660E\u5EA6");
      var opaWrap = document.createElement("span");
      opaWrap.style.cssText = "display:inline-flex;align-items:center;gap:8px";
      var opaSlider = document.createElement("input");
      opaSlider.type = "range";
      opaSlider.min = "0.3";
      opaSlider.max = "1";
      opaSlider.step = "0.05";
      opaSlider.value = String(settings2.opacity);
      opaSlider.style.cssText = "width:96px;accent-color:#7d86ff;cursor:pointer";
      var opaText = document.createElement("span");
      opaText.style.cssText = "width:38px;text-align:right;color:#cfd6e6";
      opaText.textContent = Math.round(settings2.opacity * 100) + "%";
      opaSlider.addEventListener("input", function() {
        settings2.opacity = Math.min(1, Math.max(0.3, Number(opaSlider.value) || 1));
        opaText.textContent = Math.round(settings2.opacity * 100) + "%";
        applyOpacity();
        saveSettings2(false);
      });
      opaWrap.appendChild(opaSlider);
      opaWrap.appendChild(opaText);
      opaRow.appendChild(opaWrap);
      var soundRow = row("\u97F3\u6548");
      var soundWrap = document.createElement("span");
      soundWrap.style.cssText = "display:inline-flex;align-items:center;gap:8px";
      var soundBtn = document.createElement("button");
      soundBtn.style.cssText = "padding:3px 9px;border-radius:7px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#dfe4f0;font:inherit;cursor:pointer";
      function syncSoundBtn() {
        soundBtn.textContent = settings2.sound ? "\u5F00" : "\u5173";
        soundBtn.style.background = settings2.sound ? "rgba(125,134,255,.85)" : "rgba(255,255,255,.06)";
        soundBtn.style.color = settings2.sound ? "#fff" : "#dfe4f0";
      }
      soundBtn.addEventListener("click", function() {
        settings2.sound = !settings2.sound;
        syncSoundBtn();
        saveSettings2(true);
        if (settings2.sound) {
          audioEnsure();
          loadSounds();
          playSound("click");
        }
      });
      syncSoundBtn();
      var volSlider = document.createElement("input");
      volSlider.type = "range";
      volSlider.min = "0";
      volSlider.max = "1";
      volSlider.step = "0.05";
      volSlider.value = String(settings2.volume);
      volSlider.style.cssText = "width:74px;accent-color:#7d86ff;cursor:pointer";
      var volText = document.createElement("span");
      volText.style.cssText = "width:34px;text-align:right;color:#cfd6e6";
      volText.textContent = Math.round(settings2.volume * 100) + "%";
      volSlider.addEventListener("input", function() {
        settings2.volume = Math.min(1, Math.max(0, Number(volSlider.value) || 0));
        volText.textContent = Math.round(settings2.volume * 100) + "%";
        saveSettings2(false);
      });
      volSlider.addEventListener("change", function() {
        if (settings2.sound) {
          audioEnsure();
          playSound("click");
        }
      });
      soundWrap.appendChild(soundBtn);
      soundWrap.appendChild(volSlider);
      soundWrap.appendChild(volText);
      soundRow.appendChild(soundWrap);
      var voiceRow = row("\u8BED\u97F3");
      var voiceBtn = document.createElement("button");
      voiceBtn.style.cssText = "padding:3px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#dfe4f0;font:inherit;cursor:pointer";
      function syncVoiceBtn() {
        voiceBtn.textContent = settings2.voice ? "\u5F00" : "\u5173";
        voiceBtn.style.background = settings2.voice ? "rgba(125,134,255,.85)" : "rgba(255,255,255,.06)";
        voiceBtn.style.color = settings2.voice ? "#fff" : "#dfe4f0";
      }
      voiceBtn.addEventListener("click", function() {
        settings2.voice = !settings2.voice;
        syncVoiceBtn();
        saveSettings2(true);
      });
      syncVoiceBtn();
      voiceRow.appendChild(voiceBtn);
      var voiceLangRow = row("\u8BED\u97F3\u8BED\u8A00");
      var voiceLangBox = document.createElement("span");
      voiceLangBox.style.cssText = "display:inline-flex;border:1px solid rgba(255,255,255,.18);border-radius:7px;overflow:hidden";
      var voiceLangButtons = {};
      [["zh", "\u4E2D\u6587"], ["ja", "\u65E5\u8BED"]].forEach(function(pair) {
        var btn = document.createElement("button");
        btn.textContent = pair[1];
        btn.dataset.value = pair[0];
        btn.style.cssText = "padding:3px 9px;border:0;background:transparent;color:#cfd6e6;font:inherit;cursor:pointer";
        btn.addEventListener("click", function() {
          settings2.voiceLang = pair[0];
          saveSettings2(true);
          syncVoiceLang();
        });
        voiceLangButtons[pair[0]] = btn;
        voiceLangBox.appendChild(btn);
      });
      function syncVoiceLang() {
        Object.keys(voiceLangButtons).forEach(function(k) {
          var on = settings2.voiceLang === k;
          voiceLangButtons[k].style.background = on ? "rgba(125,134,255,.85)" : "transparent";
          voiceLangButtons[k].style.color = on ? "#fff" : "#cfd6e6";
        });
      }
      syncVoiceLang();
      voiceLangRow.appendChild(voiceLangBox);
      var voiceVolRow = row("\u8BED\u97F3\u97F3\u91CF");
      var voiceVolWrap = document.createElement("span");
      voiceVolWrap.style.cssText = "display:inline-flex;align-items:center;gap:8px";
      var voiceVolSlider = document.createElement("input");
      voiceVolSlider.type = "range";
      voiceVolSlider.min = "0";
      voiceVolSlider.max = "1";
      voiceVolSlider.step = "0.05";
      voiceVolSlider.value = String(settings2.voiceVolume === void 0 ? 0.7 : settings2.voiceVolume);
      voiceVolSlider.style.cssText = "width:74px;accent-color:#7d86ff;cursor:pointer";
      var voiceVolText = document.createElement("span");
      voiceVolText.style.cssText = "width:34px;text-align:right;color:#cfd6e6";
      function syncVoiceVolume() {
        var v = settings2.voiceVolume === void 0 ? 0.7 : settings2.voiceVolume;
        voiceVolSlider.value = String(v);
        voiceVolText.textContent = Math.round(v * 100) + "%";
      }
      voiceVolSlider.addEventListener("input", function() {
        settings2.voiceVolume = Math.min(1, Math.max(0, Number(voiceVolSlider.value) || 0));
        syncVoiceVolume();
        saveSettings2(false);
      });
      voiceVolSlider.addEventListener("change", function() {
        saveSettings2(true);
      });
      syncVoiceVolume();
      voiceVolWrap.appendChild(voiceVolSlider);
      voiceVolWrap.appendChild(voiceVolText);
      voiceVolRow.appendChild(voiceVolWrap);
      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:8px;margin-top:9px";
      function action(label, fn) {
        var b = document.createElement("button");
        b.textContent = label;
        b.style.cssText = "flex:1;padding:5px 8px;border-radius:7px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#dfe4f0;font:inherit;cursor:pointer";
        b.addEventListener("click", fn);
        actions.appendChild(b);
      }
      action("\u91CD\u7F6E\u4F4D\u7F6E", function() {
        resetPosition();
      });
      action("\u5B8C\u6210", function() {
        closePanel();
      });
      panel.appendChild(actions);
      document.body.appendChild(panel);
      syncMirrorButtons();
      syncTiersBtn();
      return {
        syncMirrorButtons,
        syncTiersBtn,
        syncVoiceBtn,
        syncVoiceLang,
        syncVoiceVolume,
        slider,
        sizeText,
        snapSlider,
        snapText,
        bubbleScaleSlider,
        bubbleScaleText
      };
    }
    var panelApi = null;
    function openPanel() {
      if (!panel) panelApi = buildPanel();
      if (panelApi) {
        panelApi.slider.value = String(settings2.size);
        panelApi.sizeText.textContent = Math.round(settings2.size * 100) + "%";
        panelApi.snapSlider.value = String(settings2.snapStrength);
        panelApi.snapText.textContent = Math.round(settings2.snapStrength) + "%";
        panelApi.bubbleScaleSlider.value = String(settings2.bubbleScale);
        panelApi.bubbleScaleText.textContent = Math.round(settings2.bubbleScale) + "%";
        panelApi.syncTiersBtn();
        panelApi.syncMirrorButtons();
        panelApi.syncVoiceBtn();
        panelApi.syncVoiceLang();
        panelApi.syncVoiceVolume();
      }
      panel.style.display = "block";
      var s = size();
      var pw = panel.offsetWidth;
      var ph = panel.offsetHeight;
      var left = Math.min(Math.max(8, pet.pos.x + s.w / 2 - pw / 2), window.innerWidth - pw - 8);
      var top = pet.pos.y - ph - 8;
      if (top < 8) top = Math.min(window.innerHeight - ph - 8, pet.pos.y + s.h + 8);
      panel.style.left = Math.round(left) + "px";
      panel.style.top = Math.round(top) + "px";
    }
    function closePanel() {
      if (panel) panel.style.display = "none";
    }
    function insidePanel(target) {
      return !!(panel && target && panel.contains(target));
    }
    function dispose() {
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
      panelApi = null;
    }
    return { open: openPanel, close: closePanel, isOpen: panelIsOpen, contains: insidePanel, dispose };
  }

  // assets/src/ui/bubble.js
  function createBubble(deps) {
    var getState = deps.getState;
    var pet = deps.pet;
    var size = deps.size;
    var settings2 = deps.settings;
    var BUBBLE_FONT = '"ArkPixel12", ui-monospace, monospace';
    var BUBBLE_SIZE = 24;
    var BUBBLE_SIZE_MID = 36;
    var BUBBLE_SIZE_BIG = 48;
    var BUBBLE_LINE = 30;
    var BUBBLE_PAD = 12;
    var BUBBLE_HIDE_MS = 5200;
    var BUBBLE_MIN_MS = 4200;
    var BUBBLE_CHAR_MS = 90;
    var BUBBLE_CORNER = 6;
    var TAIL_W = 14;
    var TAIL_H = 10;
    function bubbleFactor() {
      var v = Number(settings2.bubbleScale);
      if (!isFinite(v)) v = 100;
      return Math.min(200, Math.max(50, v)) / 100;
    }
    function bubblePx(base) {
      return Math.max(1, Math.round(base * bubbleFactor()));
    }
    function bubbleLineH(size2) {
      var base = size2 >= BUBBLE_SIZE_BIG ? 56 : size2 >= BUBBLE_SIZE_MID ? 44 : BUBBLE_LINE;
      return Math.max(1, Math.round(base * bubbleFactor()));
    }
    var bubbleEl = null;
    var bubbleTextEl = null;
    var bubbleTailEl = null;
    var bubbleSvg = null;
    var bubbleW = 0;
    var bubbleH = 0;
    var bubbleTailCenter = 0;
    var bubbleTailUp = false;
    var bubbleHideTimer = 0;
    var bubbleTickTimer = 0;
    function hideBubble() {
      bubbleShown = false;
      bubbleDialogText = "";
      bubbleDialogUntil = 0;
      bubbleEventRows = null;
      bubbleEventText = "";
      if (bubbleEl) {
        try {
          bubbleEl.getAnimations().forEach(function(a) {
            a.cancel();
          });
        } catch (err) {
        }
        bubbleEl.style.opacity = "0";
      }
      if (bubbleTickTimer) {
        clearInterval(bubbleTickTimer);
        bubbleTickTimer = 0;
      }
    }
    var bubbleEventText = "";
    var bubbleEventRows = null;
    var bubbleEventUntil = 0;
    var bubbleDialogText = "";
    var bubbleDialogUntil = 0;
    var bubbleMode = "info";
    function ensureFont() {
      if (document.getElementById("dsh-closure-pet-font")) return;
      var st = document.createElement("style");
      st.id = "dsh-closure-pet-font";
      st.textContent = '@font-face{font-family:ArkPixel12;src:url("' + PREFIX + '/assets/fonts/ark-pixel-12px-zh_hans.woff2") format("woff2");font-display:block}';
      document.head.appendChild(st);
      try {
        document.fonts.load("12px ArkPixel12").then(function() {
          if (bubbleShown) refreshBubble();
        }).catch(function() {
        });
      } catch (err) {
      }
    }
    function ensureBubble() {
      if (bubbleEl) return;
      bubbleEl = document.createElement("div");
      bubbleEl.id = "dsh-closure-pet-bubble";
      bubbleEl.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        "z-index:2147481999",
        "pointer-events:none",
        "opacity:0",
        "transform-origin:center bottom",
        "filter:none"
      ].join(";");
      bubbleSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      bubbleSvg.setAttribute("shape-rendering", "crispEdges");
      bubbleSvg.style.cssText = "position:absolute;left:0;top:0;overflow:visible";
      bubbleEl.appendChild(bubbleSvg);
      bubbleTextEl = document.createElement("div");
      bubbleTextEl.style.cssText = [
        "position:absolute",
        "white-space:pre",
        "font-family:" + BUBBLE_FONT,
        "font-size:" + bubblePx(BUBBLE_SIZE) + "px",
        "line-height:" + bubbleLineH(BUBBLE_SIZE) + "px",
        "color:#20232a",
        "letter-spacing:0",
        "-webkit-font-smoothing:none",
        "font-smooth:never",
        "text-rendering:geometricPrecision"
      ].join(";");
      bubbleEl.appendChild(bubbleTextEl);
      document.body.appendChild(bubbleEl);
    }
    var BUBBLE_MAX_W = 420;
    function measureText(text, size2) {
      var px = bubblePx(size2 || BUBBLE_SIZE);
      var cv = measureText._cv || (measureText._cv = document.createElement("canvas"));
      var ctx = cv.getContext("2d");
      ctx.font = px + "px " + BUBBLE_FONT;
      return ctx.measureText(text).width;
    }
    function wrapText(text, maxWidth, size2) {
      if (measureText(text, size2) <= maxWidth) return [text];
      var out = [];
      var cur = "";
      var lastSpace = -1;
      for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (cur && measureText(cur + ch, size2) > maxWidth) {
          if (lastSpace > 0 && measureText(cur.slice(0, lastSpace), size2) > maxWidth * 0.45) {
            out.push(cur.slice(0, lastSpace));
            cur = cur.slice(lastSpace + 1) + ch;
          } else {
            out.push(cur);
            cur = ch;
          }
          lastSpace = -1;
        } else {
          cur += ch;
        }
        if (ch === " ") lastSpace = cur.length - 1;
      }
      if (cur) out.push(cur);
      return out;
    }
    function bubblePath(w, h, tailX, tailUp) {
      var c = bubblePx(BUBBLE_CORNER);
      var t = bubblePx(TAIL_H);
      var tw = bubblePx(TAIL_W);
      if (!tailUp) {
        var bodyH = h - t;
        return [
          "M",
          c,
          0,
          "H",
          w - c,
          "V",
          c,
          "H",
          w,
          "V",
          bodyH - c,
          "H",
          w - c,
          "V",
          bodyH,
          "H",
          tailX + tw,
          "V",
          h,
          "H",
          tailX,
          "V",
          bodyH,
          "H",
          c,
          "V",
          bodyH - c,
          "H",
          0,
          "V",
          c,
          "Z"
        ].join(" ");
      }
      var top = t;
      return [
        "M",
        c,
        top,
        "H",
        tailX,
        "V",
        0,
        "H",
        tailX + tw,
        "V",
        top,
        "H",
        w - c,
        "V",
        top + c,
        "H",
        w,
        "V",
        h - c,
        "H",
        w - c,
        "V",
        h,
        "H",
        c,
        "V",
        h - c,
        "H",
        0,
        "V",
        top + c,
        "H",
        c,
        "Z"
      ].join(" ");
    }
    function drawBubbleFrame() {
      var w = bubbleW;
      var h = bubbleH;
      var tw = bubblePx(TAIL_W);
      var tailX = Math.round(Math.min(
        Math.max(8, bubbleTailCenter - tw / 2),
        w - tw - 8
      ));
      bubbleSvg.setAttribute("width", String(w + 6));
      bubbleSvg.setAttribute("height", String(h + 6));
      bubbleSvg.setAttribute("viewBox", `0 0 ${w + 6} ${h + 6}`);
      var d = bubblePath(w, h, tailX, bubbleTailUp);
      bubbleSvg.innerHTML = '<path d="' + d + '" fill="#000" fill-opacity=".32" transform="translate(3,3)"/><path d="' + d + '" fill="#ffffff" stroke="#20232a" stroke-width="2"/>';
    }
    function normalizeRows(rows) {
      var out = [];
      var tiers = settings2.bubbleTiers !== false;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r === null || r === void 0) continue;
        if (typeof r === "string") out.push({ text: r, size: BUBBLE_SIZE });
        else out.push({
          text: String(r.text === void 0 || r.text === null ? "" : r.text),
          size: tiers ? r.size || BUBBLE_SIZE : BUBBLE_SIZE,
          color: tiers ? r.color || "" : "",
          bold: tiers ? !!r.bold : false
        });
      }
      return out;
    }
    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function renderBubble(rows, tailCenterX, tailUp) {
      ensureFont();
      ensureBubble();
      rows = normalizeRows(rows);
      var maxW = bubblePx(BUBBLE_MAX_W);
      var flat = [];
      for (var li = 0; li < rows.length; li++) {
        var row = rows[li];
        var segments = String(row.text).split(/\r?\n/);
        for (var si = 0; si < segments.length; si++) {
          var parts = wrapText(segments[si], maxW, row.size);
          for (var pi = 0; pi < parts.length; pi++) {
            flat.push({ text: parts[pi], size: row.size, color: row.color, bold: row.bold });
          }
        }
      }
      rows = flat;
      var widest = 0;
      var totalH = 0;
      for (var i = 0; i < rows.length; i++) {
        widest = Math.max(widest, measureText(rows[i].text, rows[i].size));
        totalH += bubbleLineH(rows[i].size);
      }
      var pad = bubblePx(BUBBLE_PAD);
      var tailH = bubblePx(TAIL_H);
      var w = Math.ceil(widest) + pad * 2 + 4;
      var h = totalH + pad * 2 + tailH;
      w = Math.ceil(w / 2) * 2;
      h = Math.ceil(h / 2) * 2;
      bubbleW = w;
      bubbleH = h;
      bubbleEl.style.width = w + 6 + "px";
      bubbleEl.style.height = h + 6 + "px";
      bubbleTailCenter = tailCenterX || w / 2;
      bubbleTailUp = !!tailUp;
      drawBubbleFrame();
      bubbleTextEl.style.left = pad + 2 + "px";
      bubbleTextEl.style.top = (tailUp ? tailH : 0) + pad + 1 + "px";
      var html = "";
      for (var ri = 0; ri < rows.length; ri++) {
        var rr = rows[ri];
        var style = "display:block;font-size:" + bubblePx(rr.size) + "px;line-height:" + bubbleLineH(rr.size) + "px";
        if (rr.color) style += ";color:" + rr.color;
        if (rr.bold) style += ";font-weight:700";
        html += '<span style="' + style + '">' + escapeHtml(rr.text) + "</span>";
      }
      bubbleTextEl.innerHTML = html;
    }
    function fmtMoney(value, currency) {
      if (value === null || value === void 0) return "--";
      var n = Number(value);
      if (!isFinite(n)) return "--";
      return (currency === "USD" ? "$" : "\xA5") + n.toFixed(2);
    }
    function hhmmss(ms) {
      var totalMinutes = Math.max(0, Math.round(ms / 6e4));
      var pad = function(n) {
        return String(n).padStart(2, "0");
      };
      var h = Math.floor(totalMinutes / 60);
      var m = totalMinutes % 60;
      return (h > 0 ? pad(h) + "\u65F6" : "") + pad(m) + "\u5206";
    }
    var PROVIDER_ALIAS = {
      deepseek: "\u5B98\u65B9",
      openai: "OpenAI",
      anthropic: "Claude",
      google: "Google",
      xai: "Grok"
    };
    function shortProvider(provider) {
      var p = String(provider || "").trim();
      if (!p) return "";
      var alias = PROVIDER_ALIAS[p.toLowerCase()];
      if (alias) return alias;
      return p.length > 8 ? p.slice(0, 8) : p;
    }
    function shortModel(model) {
      var m = String(model || "").trim();
      if (!m) return "";
      m = m.replace(/^deepseek-/i, "").replace(/-\d{8}$/, "");
      return m.length > 14 ? m.slice(0, 14) : m;
    }
    function sourceFootnote(sp) {
      var list = sp && sp.sources;
      if (!Array.isArray(list) || !list.length) return "";
      var parts = [];
      var shown = 0;
      var lastProvider = null;
      for (var i = 0; i < list.length && shown < 3; i++) {
        var rec = list[i];
        var cost = Number(rec.cost) || 0;
        if (cost <= 0) continue;
        var prov = shortProvider(rec.provider);
        var mdl = shortModel(rec.model);
        var label = "";
        if (prov && prov !== lastProvider) label = prov + (mdl ? " " + mdl : "");
        else label = mdl;
        if (!label) label = "\u672A\u77E5\u6E90";
        lastProvider = prov || lastProvider;
        parts.push(label + " " + fmtMoney(cost, "CNY"));
        shown++;
      }
      if (!parts.length) return "";
      var rest = list.length - shown;
      if (rest > 0) parts.push("+" + rest);
      return parts.join(" \xB7 ");
    }
    function bubbleLines() {
      if ((bubbleEventRows || bubbleEventText) && Date.now() < bubbleEventUntil) {
        if (bubbleEventRows) {
          return bubbleEventRows.map(function(r) {
            var tier = r.tier;
            var size2 = r.size;
            if (!size2) size2 = tier === "title" ? BUBBLE_SIZE + 6 : tier === "number" ? BUBBLE_SIZE_BIG : tier === "tag" ? BUBBLE_SIZE - 4 : BUBBLE_SIZE;
            return {
              text: r.text,
              size: size2,
              color: r.color || (tier === "tag" ? "#6b7280" : ""),
              bold: r.bold === void 0 ? tier === "title" || tier === "number" : !!r.bold
            };
          });
        }
        return [{ text: bubbleEventText, size: BUBBLE_SIZE }];
      }
      if (bubbleDialogText && Date.now() < bubbleDialogUntil) {
        var info = infoLines();
        if (info.length && info[0].bold && info[0].size >= BUBBLE_SIZE_MID) {
          info[0] = { text: "\u4F59\u989D " + info[0].text, size: info[0].size, bold: info[0].bold };
        }
        return info.concat([{ text: bubbleDialogText, size: BUBBLE_SIZE, bold: false }]);
      }
      return infoLines();
    }
    function infoLines() {
      var rows = [];
      var s = getState();
      var b = s && s.balance;
      if (b && b.ok) {
        var amountText = fmtMoney(b.total, b.currency);
        var amountSize = measureText(amountText, BUBBLE_SIZE_BIG) > bubblePx(BUBBLE_MAX_W) ? BUBBLE_SIZE_MID : BUBBLE_SIZE_BIG;
        rows.push({ text: amountText, size: amountSize, bold: true });
        var hint = "";
        if (b.low) hint = "\u8981\u82B1\u5149\u4E86\u54E6\uFF01";
        if (b.stale) hint = (hint ? hint + " " : "") + "\u672A\u5237\u65B0";
        if (hint) rows.push({ text: hint, size: BUBBLE_SIZE, color: "#c0392b" });
      } else if (b && b.signedOut) {
        rows.push({ text: "\u535A\u58EB\u8FD8\u6CA1\u6709\u767B\u5F55CLSR\u54E6", size: BUBBLE_SIZE });
      } else {
        rows.push({ text: "\u55EF\u2026\u2026\u4F59\u989D\u6570\u636E\u8FD8\u6CA1\u540C\u6B65", size: BUBBLE_SIZE });
      }
      if (s) {
        var sp = s.spend;
        if (sp) {
          var parts = ["\u4ECA\u5929\u82B1\u6389 " + fmtMoney(sp.today, "CNY")];
          if (Number(sp.turnAmount) > 0) parts.push("\u672C\u8F6E " + fmtMoney(sp.turnAmount, "CNY"));
          rows.push({ text: parts.join(" \xB7 "), size: BUBBLE_SIZE });
          var foot = sourceFootnote(sp);
          if (foot) rows.push({ text: foot, size: BUBBLE_SIZE, color: "#6b7280" });
        }
        var peak = s.period === "peak";
        var left = s.periodNextChangeAt ? Math.max(0, s.periodNextChangeAt - Date.now()) : null;
        rows.push({
          text: (peak ? "\u5CF0\u65F6" : "\u8C37\u65F6") + (left !== null ? " \u8DDD" + (peak ? "\u8C37\u65F6" : "\u5CF0\u65F6") + " " + hhmmss(left) : ""),
          size: BUBBLE_SIZE,
          color: peak ? "#c0392b" : "#2f855a"
        });
      }
      return rows;
    }
    function placeBubble() {
      if (!bubbleEl || !pet.pos) return { tailCenter: bubbleW / 2, below: false };
      var s = size();
      var centerX = pet.pos.x + s.w / 2;
      var ratio = centerX < window.innerWidth / 2 ? 0.32 : 0.68;
      var left = Math.round(centerX - bubbleW * ratio);
      left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - bubbleW - 8));
      var top = Math.round(pet.pos.y - bubbleH - 2);
      var below = top < 8;
      if (below) top = Math.round(pet.pos.y + s.h + 2);
      bubbleEl.style.left = left + "px";
      bubbleEl.style.top = top + "px";
      bubbleEl.style.transformOrigin = below ? "center top" : "center bottom";
      var tw = bubblePx(TAIL_W);
      var tailCenter = Math.min(
        Math.max(tw / 2 + 8, centerX - left),
        Math.max(tw / 2 + 8, bubbleW - tw / 2 - 8)
      );
      return { tailCenter, below };
    }
    function refreshBubble() {
      if (!pet.pos) return;
      ensureFont();
      ensureBubble();
      var lines = bubbleLines();
      renderBubble(lines, 0, false);
      var pos = placeBubble();
      renderBubble(lines, pos.tailCenter, pos.below);
      placeBubble();
    }
    var bubbleFollowRaf = 0;
    function followBubble() {
      if (!bubbleShown || !bubbleEl || !pet.pos) return;
      if (bubbleFollowRaf) return;
      bubbleFollowRaf = requestAnimationFrame(function() {
        bubbleFollowRaf = 0;
        if (!bubbleShown || !bubbleEl || !pet.pos) return;
        var pos = placeBubble();
        if (pos.tailCenter !== bubbleTailCenter || pos.below !== bubbleTailUp) {
          bubbleTailCenter = pos.tailCenter;
          bubbleTailUp = !!pos.below;
          drawBubbleFrame();
        }
      });
    }
    var bubbleShown = false;
    function popBubbleIn() {
      if (!bubbleEl) return;
      bubbleEl.style.opacity = "1";
      try {
        bubbleEl.getAnimations().forEach(function(a) {
          a.cancel();
        });
      } catch (err) {
      }
      try {
        bubbleEl.animate([
          { opacity: 0, transform: "scale(.62,.7) translateY(10px)" },
          { opacity: 1, transform: "scale(1.06,1.03) translateY(-2px)", offset: 0.62 },
          { opacity: 1, transform: "scale(.98,1.01) translateY(1px)", offset: 0.8 },
          { opacity: 1, transform: "scale(1,1) translateY(0)" }
        ], { duration: 320, easing: "cubic-bezier(.22,1.5,.36,1)", fill: "forwards" });
      } catch (err) {
      }
    }
    function popBubbleOut() {
      if (!bubbleEl) return;
      try {
        bubbleEl.getAnimations().forEach(function(a) {
          a.cancel();
        });
        bubbleEl.animate([
          { opacity: 1, transform: "scale(1,1)" },
          { opacity: 0, transform: "scale(.92,.94) translateY(4px)" }
        ], { duration: 180, easing: "ease-in", fill: "forwards" });
      } catch (err) {
      }
      bubbleEl.style.opacity = "0";
    }
    function textOf(content) {
      if (Array.isArray(content)) {
        return content.map(function(row) {
          return row && row.text ? row.text : "";
        }).join("");
      }
      if (content && typeof content === "object" && content.text) return content.text;
      return typeof content === "string" ? content : "";
    }
    function textLength(content) {
      return Array.from(textOf(content).replace(/\s/g, "")).length;
    }
    function eventDuration(content, explicitMs) {
      if (explicitMs !== void 0 && explicitMs !== null) return explicitMs;
      var voiceMs = deps.voiceDuration ? deps.voiceDuration(textOf(content)) : 0;
      if (voiceMs > 0) return Math.max(BUBBLE_MIN_MS, voiceMs + 2e3);
      var chars = textLength(content);
      var byChars = chars > 0 ? chars * BUBBLE_CHAR_MS : 0;
      return Math.max(BUBBLE_MIN_MS, byChars);
    }
    function showBubble(eventText, eventMs) {
      if (!settings2.bubble) return;
      ensureFont();
      var wasVisible = bubbleShown;
      bubbleDialogText = "";
      bubbleDialogUntil = 0;
      var ms = eventDuration(eventText, eventMs);
      if (Array.isArray(eventText)) {
        bubbleEventRows = eventText;
        bubbleEventText = "";
        bubbleEventUntil = Date.now() + ms;
        bubbleMode = "event";
      } else if (eventText) {
        bubbleEventText = eventText;
        bubbleEventRows = null;
        bubbleEventUntil = Date.now() + ms;
        bubbleMode = "event";
      } else {
        bubbleEventRows = null;
        bubbleMode = "info";
      }
      refreshBubble();
      bubbleShown = true;
      if (!wasVisible || eventText) popBubbleIn();
      else bubbleEl.style.opacity = "1";
      clearTimeout(bubbleHideTimer);
      var hideIn = bubbleMode === "event" ? Math.max(700, bubbleEventUntil - Date.now()) : BUBBLE_HIDE_MS;
      bubbleHideTimer = setTimeout(function() {
        bubbleShown = false;
        popBubbleOut();
        if (bubbleTickTimer) {
          clearInterval(bubbleTickTimer);
          bubbleTickTimer = 0;
        }
      }, hideIn);
      if (!bubbleTickTimer) {
        bubbleTickTimer = setInterval(function() {
          if (!bubbleShown) {
            clearInterval(bubbleTickTimer);
            bubbleTickTimer = 0;
            return;
          }
          if (bubbleMode === "event" && Date.now() > bubbleEventUntil) {
            bubbleShown = false;
            popBubbleOut();
            clearInterval(bubbleTickTimer);
            bubbleTickTimer = 0;
            return;
          }
          refreshBubble();
        }, 1e3);
      }
    }
    function showDialog(text, eventMs) {
      if (!settings2.bubble || !text) return;
      ensureFont();
      var wasVisible = bubbleShown;
      bubbleEventRows = null;
      bubbleEventText = "";
      bubbleDialogText = String(text);
      bubbleDialogUntil = Date.now() + eventDuration(text, eventMs);
      bubbleMode = "dialog";
      refreshBubble();
      bubbleShown = true;
      if (!wasVisible) popBubbleIn();
      else bubbleEl.style.opacity = "1";
      clearTimeout(bubbleHideTimer);
      var hideIn = Math.max(1200, bubbleDialogUntil - Date.now());
      bubbleHideTimer = setTimeout(function() {
        bubbleShown = false;
        popBubbleOut();
        if (bubbleTickTimer) {
          clearInterval(bubbleTickTimer);
          bubbleTickTimer = 0;
        }
      }, hideIn);
      if (!bubbleTickTimer) {
        bubbleTickTimer = setInterval(function() {
          if (!bubbleShown) {
            clearInterval(bubbleTickTimer);
            bubbleTickTimer = 0;
            return;
          }
          if (bubbleMode === "dialog" && Date.now() > bubbleDialogUntil) {
            bubbleShown = false;
            popBubbleOut();
            clearInterval(bubbleTickTimer);
            bubbleTickTimer = 0;
            return;
          }
          refreshBubble();
        }, 1e3);
      }
    }
    function extendDuration(ms) {
      var extra = Number(ms);
      if (!bubbleShown || !isFinite(extra) || extra <= 0) return;
      var until;
      if (bubbleMode === "event") {
        bubbleEventUntil = Math.max(bubbleEventUntil, Date.now() + extra);
        until = bubbleEventUntil;
      } else if (bubbleMode === "dialog") {
        bubbleDialogUntil = Math.max(bubbleDialogUntil, Date.now() + extra);
        until = bubbleDialogUntil;
      } else {
        return;
      }
      clearTimeout(bubbleHideTimer);
      bubbleHideTimer = setTimeout(function() {
        bubbleShown = false;
        popBubbleOut();
        if (bubbleTickTimer) {
          clearInterval(bubbleTickTimer);
          bubbleTickTimer = 0;
        }
      }, Math.max(700, until - Date.now()));
    }
    function dispose() {
      hideBubble();
      if (bubbleFollowRaf) {
        cancelAnimationFrame(bubbleFollowRaf);
        bubbleFollowRaf = 0;
      }
      if (bubbleHideTimer) {
        clearTimeout(bubbleHideTimer);
        bubbleHideTimer = 0;
      }
      if (bubbleTickTimer) {
        clearInterval(bubbleTickTimer);
        bubbleTickTimer = 0;
      }
      if (bubbleEl && bubbleEl.parentNode) bubbleEl.parentNode.removeChild(bubbleEl);
      bubbleEl = null;
      bubbleTextEl = null;
      bubbleTailEl = null;
      bubbleSvg = null;
    }
    return { show: showBubble, dialog: showDialog, extend: extendDuration, refresh: refreshBubble, follow: followBubble, hide: hideBubble, dispose, isShown: function() {
      return bubbleShown;
    } };
  }

  // assets/src/ui/sticker.js
  function createSticker(deps) {
    var getState = deps.getState;
    var settings2 = deps.settings;
    var size = deps.size;
    var pet = deps.pet;
    var STICKER_BASE_W = 40;
    var STICKER_H = 24;
    var STICKER_SCALE = 3;
    var stickerEl = null;
    var stickerCanvas = null;
    var stickerReady = false;
    var stickerW = 120;
    var stickerH = 72;
    function drawSticker() {
      var LOG_H = STICKER_H;
      var S = STICKER_SCALE * 2;
      var cv = stickerCanvas;
      var ctx = cv.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = "12px ArkPixel12, monospace";
      var tw = 0;
      try {
        tw = ctx.measureText("-99%").width;
      } catch (err) {
        tw = 30;
      }
      var LOG_W = Math.max(STICKER_BASE_W, Math.ceil(tw) + 14);
      stickerW = LOG_W * STICKER_SCALE;
      stickerH = LOG_H * STICKER_SCALE;
      cv.width = LOG_W * S;
      cv.height = LOG_H * S;
      cv.style.width = stickerW + "px";
      cv.style.height = stickerH + "px";
      if (stickerEl) {
        stickerEl.style.width = stickerW + "px";
        stickerEl.style.height = stickerH + "px";
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.scale(S, S);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#3f6a12";
      ctx.fillRect(0, 0, LOG_W, LOG_H);
      ctx.fillStyle = "rgba(0,0,0,.22)";
      for (var y = 0; y < LOG_H; y += 2) ctx.fillRect(0, y, LOG_W, 1);
      ctx.fillStyle = "rgba(255,255,255,.10)";
      ctx.fillRect(0, 0, LOG_W, 1);
      ctx.strokeStyle = "#2a4506";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, LOG_W - 1, LOG_H - 1);
      ctx.strokeStyle = "rgba(182,242,74,.28)";
      ctx.strokeRect(1.5, 1.5, LOG_W - 3, LOG_H - 3);
      ctx.fillStyle = "#b6f24a";
      ctx.font = "12px ArkPixel12, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("-99%", LOG_W / 2, LOG_H / 2 + 0.5);
      ctx.fillStyle = "rgba(182,242,74,.5)";
      ctx.fillRect(6, LOG_H - 4, LOG_W - 12, 1);
    }
    function ensureSticker() {
      if (stickerEl) return;
      stickerCanvas = document.createElement("canvas");
      stickerEl = document.createElement("div");
      stickerEl.id = "dsh-closure-pet-sticker";
      stickerEl.style.cssText = [
        "position:fixed",
        "z-index:2147482000",
        "pointer-events:none",
        "display:none",
        "will-change:transform,opacity",
        "image-rendering:pixelated"
      ].join(";");
      stickerCanvas.style.cssText = "display:block;image-rendering:pixelated";
      stickerEl.appendChild(stickerCanvas);
      document.body.appendChild(stickerEl);
    }
    function showValleySticker() {
      var s = getState();
      if (!s || s.period !== "valley") return;
      if (!settings2.bubble) return;
      ensureSticker();
      if (!stickerReady) {
        try {
          document.fonts.load("12px ArkPixel12").then(function() {
            drawSticker();
            stickerReady = true;
          }).catch(function() {
            drawSticker();
            stickerReady = true;
          });
        } catch (err) {
          drawSticker();
          stickerReady = true;
        }
        drawSticker();
        stickerReady = true;
      }
      var petSize = size();
      var cx = pet.pos.x + petSize.w / 2;
      var leftOfPet = cx > window.innerWidth / 2;
      var left = leftOfPet ? Math.round(cx - stickerW - 8) : Math.round(cx + 8);
      left = Math.min(Math.max(8, left), window.innerWidth - stickerW - 8);
      var top = Math.round(pet.pos.y + petSize.h * 0.18);
      top = Math.min(Math.max(8, top), window.innerHeight - stickerH - 8);
      stickerEl.style.left = left + "px";
      stickerEl.style.top = top + "px";
      stickerEl.style.display = "block";
      try {
        stickerEl.getAnimations().forEach(function(a) {
          a.cancel();
        });
        stickerEl.animate([
          { opacity: 0, transform: "translateY(26px) scale(.94)", easing: "cubic-bezier(.18,.89,.32,1)" },
          { opacity: 1, transform: "translateY(6px) scale(1)", offset: 0.18, easing: "cubic-bezier(.25,.8,.35,1)" },
          { opacity: 1, transform: "translateY(-14px) scale(1.02)", offset: 0.52, easing: "cubic-bezier(.4,0,.7,.5)" },
          { opacity: 0, transform: "translateY(-42px) scale(1.04)", offset: 1 }
        ], { duration: 1e3, easing: "linear", fill: "forwards" }).onfinish = function() {
          if (stickerEl) stickerEl.style.display = "none";
        };
      } catch (err) {
        stickerEl.style.opacity = "1";
        setTimeout(function() {
          if (stickerEl) stickerEl.style.display = "none";
        }, 1e3);
      }
    }
    function dispose() {
      if (stickerEl && stickerEl.parentNode) stickerEl.parentNode.removeChild(stickerEl);
      stickerEl = null;
      stickerCanvas = null;
      stickerReady = false;
    }
    return { show: showValleySticker, dispose };
  }

  // assets/src/input/drag.js
  function createDrag(deps) {
    var hitTest = deps.hitTest;
    var pet = deps.pet;
    var host = deps.host;
    var clampPos = deps.clampPos;
    var applyPosition = deps.applyPosition;
    var settle = deps.settle;
    var refreshBubble = deps.refreshBubble;
    var followBubble = deps.followBubble;
    var playSegment = deps.playSegment;
    var showBubble = deps.showBubble;
    var showValleySticker = deps.showValleySticker;
    var openPanel = deps.openPanel;
    var closePanel = deps.closePanel;
    var panelIsOpen = deps.panelIsOpen;
    var insidePanel = deps.insidePanel;
    var listeners = [];
    function listen(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      listeners.push([target, type, fn, opts]);
    }
    var drag = null;
    var dragShield = null;
    var dragStyle = null;
    var swallowClick = false;
    var SHIELD_ID = "dsh-closure-pet-drag-shield";
    var BLOCK_EVENTS = ["mousedown", "selectstart", "dragstart"];
    var TOUCH_OPTS = { capture: true, passive: false };
    function blockDragEvent(e) {
      e.preventDefault();
      e.stopPropagation();
    }
    function ensureDragStyle() {
      if (dragStyle || !document.head) return;
      dragStyle = document.createElement("style");
      dragStyle.id = "dsh-closure-pet-drag-style";
      dragStyle.textContent = [
        "html.dshcl-dragging,html.dshcl-dragging body{",
        "-webkit-user-select:none !important;user-select:none !important;",
        "cursor:grabbing !important}",
        "html.dshcl-dragging *{cursor:grabbing !important}",
        // body 上的 -webkit-user-drag 不继承，图片和链接要单独点名
        "html.dshcl-dragging img,html.dshcl-dragging a{-webkit-user-drag:none !important}",
        // 触摸屏：手势开始后再改 touch-action 对本次手势无效，这里只对后续手势兜底
        "html.dshcl-dragging{touch-action:none !important;overscroll-behavior:contain}"
      ].join("");
      document.head.appendChild(dragStyle);
    }
    function beginDragLock(e) {
      ensureDragStyle();
      document.documentElement.classList.add("dshcl-dragging");
      if (!dragShield) {
        dragShield = document.createElement("div");
        dragShield.id = SHIELD_ID;
        dragShield.setAttribute("aria-hidden", "true");
        dragShield.style.cssText = [
          "position:fixed",
          "left:0",
          "top:0",
          "width:100%",
          "height:100%",
          "z-index:2147483000",
          "pointer-events:auto",
          "cursor:grabbing",
          "background:transparent",
          "touch-action:none"
        ].join(";");
        (document.body || document.documentElement).appendChild(dragShield);
      }
      for (var i = 0; i < BLOCK_EVENTS.length; i++) {
        window.addEventListener(BLOCK_EVENTS[i], blockDragEvent, true);
      }
      window.addEventListener("touchmove", blockDragEvent, TOUCH_OPTS);
      if (e) {
        try {
          e.preventDefault();
        } catch (err) {
        }
        try {
          e.stopImmediatePropagation();
        } catch (err) {
        }
      }
    }
    function endDragLock() {
      document.documentElement.classList.remove("dshcl-dragging");
      for (var i = 0; i < BLOCK_EVENTS.length; i++) {
        window.removeEventListener(BLOCK_EVENTS[i], blockDragEvent, true);
      }
      window.removeEventListener("touchmove", blockDragEvent, TOUCH_OPTS);
      if (dragShield && dragShield.parentNode) dragShield.parentNode.removeChild(dragShield);
      dragShield = null;
    }
    listen(window, "pointerdown", function(e) {
      if (window.__dshClosurePet.phase !== "running") return;
      swallowClick = false;
      if (insidePanel(e.target)) return;
      if (e.button !== 0) return;
      if (!hitTest(e.clientX, e.clientY)) {
        if (panelIsOpen()) closePanel();
        return;
      }
      beginDragLock(e);
      var closedPanel = panelIsOpen();
      if (closedPanel) closePanel();
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: pet.pos.x,
        originY: pet.pos.y,
        moved: false,
        // 面板刚被这一下关掉：只冻结页面，不进入拖拽（免得"关面板"顺手把桌宠拖走）
        passive: closedPanel
      };
      if (!closedPanel) host.style.transition = "none";
    }, true);
    listen(window, "pointermove", function(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (e.cancelable) {
        try {
          e.preventDefault();
        } catch (err) {
        }
      }
      if (drag.passive) return;
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;
      if (!drag.moved && dx * dx + dy * dy >= DRAG_THRESHOLD_SQ) {
        drag.moved = true;
      }
      if (!drag.moved) return;
      pet.pos = clampPos(drag.originX + dx, drag.originY + dy);
      applyPosition();
      if (followBubble) followBubble();
    }, true);
    function endDrag(e) {
      if (!drag || e && e.pointerId !== drag.pointerId) return;
      var wasDrag = drag.moved;
      var passive = drag.passive;
      drag = null;
      endDragLock();
      if (e) updateGrabCursor(e);
      swallowClick = !(e && e.type === "pointercancel");
      if (passive) return;
      host.style.transition = "opacity .35s ease";
      if (wasDrag) {
        settle();
        refreshBubble();
      } else if (!pet.segment) {
        playSegment();
        showValleySticker();
      }
    }
    function cancelDrag() {
      setGrabCursor(false);
      if (!drag) return;
      var wasDrag = drag.moved;
      drag = null;
      endDragLock();
      host.style.transition = "opacity .35s ease";
      if (wasDrag) {
        settle();
        refreshBubble();
      }
    }
    var grabCursor = false;
    var cursorRaf = 0;
    function setGrabCursor(on) {
      if (grabCursor === on) return;
      grabCursor = on;
      try {
        document.documentElement.style.cursor = on ? "grab" : "";
      } catch (err) {
      }
    }
    function updateGrabCursor(e) {
      if (!e || drag) return;
      if (window.__dshClosurePet.phase !== "running" || insidePanel(e.target)) {
        setGrabCursor(false);
        return;
      }
      setGrabCursor(hitTest(e.clientX, e.clientY));
    }
    listen(window, "mousemove", function(e) {
      if (cursorRaf) return;
      cursorRaf = requestAnimationFrame(function() {
        cursorRaf = 0;
        updateGrabCursor(e);
      });
    }, true);
    listen(window, "pointerup", endDrag, true);
    listen(window, "pointercancel", endDrag, true);
    listen(window, "blur", cancelDrag);
    listen(window, "click", function(e) {
      if (!swallowClick) return;
      swallowClick = false;
      if (insidePanel(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    listen(document, "contextmenu", function(e) {
      if (window.__dshClosurePet.phase !== "running") return;
      if (insidePanel(e.target)) return;
      if (!hitTest(e.clientX, e.clientY)) return;
      e.preventDefault();
      openPanel();
    }, true);
    listen(document, "keydown", function(e) {
      if (e.key === "Escape" && panelIsOpen()) closePanel();
    }, true);
    function dispose() {
      cancelDrag();
      for (var i = 0; i < listeners.length; i++) {
        var l = listeners[i];
        try {
          l[0].removeEventListener(l[1], l[2], l[3]);
        } catch (err) {
        }
      }
      listeners.length = 0;
      if (dragShield && dragShield.parentNode) dragShield.parentNode.removeChild(dragShield);
      dragShield = null;
      if (dragStyle && dragStyle.parentNode) dragStyle.parentNode.removeChild(dragStyle);
      dragStyle = null;
      setGrabCursor(false);
      if (cursorRaf) {
        cancelAnimationFrame(cursorRaf);
        cursorRaf = 0;
      }
      try {
        document.documentElement.classList.remove("dshcl-dragging");
      } catch (err) {
      }
    }
    return { isDragging: function() {
      return !!drag;
    }, cancelDrag, dispose };
  }

  // assets/src/config/dialogues.json
  var dialogues_default = {
    idle: [
      "\u4ECA\u5929\u4E5F\u8F9B\u82E6\u4E86\uFF0C\u535A\u58EB\u3002",
      "\u9700\u8981\u6211\u5E2E\u4F60\u7BA1\u7406\u5F00\u652F\u5417\u535A\u58EB\uFF1F\u563F\u563F\u4E0D\u8D35\u4E0D\u8D35~\u4E5F\u5C31\u2026\u2026\u767E\u5206\u4E4B20\u7684\u62BD\u6210\u3002",
      "\u52A8\u529B\u5C42\u7684\u57FA\u7AD9\u6545\u969C\u4E86\uFF0C\u4EBA\u4E8B\u90E8\u6709\u7B80\u5386\u975E\u8981\u6211\u5F53\u9762\u770B\uFF0C\u540E\u52E4\u90E8\u8981\u5347\u7EA7\u7EC8\u7AEF\uFF0C\u534E\u6CD5\u7433\u627E\u6211\u4E5F\u6709\u4E8B\u2026\u2026\u535A\u58EB\uFF0C\u80FD\u4E0D\u80FD\u9EBB\u70E6\u4F60\u628A\u529E\u516C\u5BA4\u706F\u5149\u8C03\u6697\u70B9\uFF0C\u6211\u8865\u4E94\u5206\u949F\u89C9\u518D\u53BB\u2026\u2026\u545C\u2026\u2026",
      "\u91C7\u8D2D\u90E8\u8FD9\u4E48\u591A\u79CD\u7C7B\u7684\u96F6\u98DF\uFF0C\u5F53\u7136\u662F\u6709\u7279\u6B8A\u6E20\u9053\u624D\u80FD\u4E70\u5230\u5566\uFF01\u5F53\u5E74\u4E3A\u4E86\u4FEE\u597D\u7F57\u5FB7\u5C9B\uFF0C\u6211\u641E\u6765\u4E86\u54E5\u4F26\u6BD4\u4E9A\u6700\u5148\u8FDB\u7684\u5168\u81EA\u52A8\u88C5\u914D\u7EBF\uFF0C\u6BBF\u4E0B\u8FD9\u624D\u8BA9\u6211\u8D1F\u8D23\u91C7\u8D2D\u7684\u3002\u6240\u4EE5\uFF0C\u4E3A\u4E86\u652F\u6301\u91C7\u8D2D\u90E8\u7684\u5DE5\u4F5C\uFF0C\u4E0D\u8BB8\u780D\u4EF7\uFF01",
      "\u6211\u4EE5\u524D\u4F1A\u4E3A\u4E86\u53CD\u9A73\u201C\u8840\u9B54\u8BE5\u6709\u8840\u9B54\u7684\u6837\u5B50\u201D\u8DDF\u5BB6\u91CC\u4EBA\u5435\u67B6\uFF0C\u53EF\u89C1\u4E86\u534E\u6CD5\u7433\u3001\u9690\u5FB7\u6765\u5E0C\uFF0C\u751A\u81F3\u675C\u5361\u96F7\u4E4B\u540E\uFF0C\u6211\u53D1\u73B0\u8840\u9B54\u597D\u50CF\u771F\u7684\u90FD\u6709\u67D0\u79CD\u6D01\u7656\u2014\u2014\u4E0D\u8FC7\u53CD\u6B63\u8DDF\u6211\u65E0\u5173\uFF0C\u4ED6\u4EEC\u5C31\u7B97\u5438\u6211\u7684\u8840\u4E5F\u53EA\u80FD\u5438\u5230\u5496\u5561\u3002",
      "\u535A\u58EB\uFF0C\u522B\u5FD8\u4E86\u7ED9\u6211\u4E70\u70B9\u96F6\u98DF\u54E6~",
      "\u603B\u5DE5\u7A0B\u5E08\u786E\u5B9E\u4EC0\u4E48\u90FD\u8981\u61C2\uFF0C\u4E0D\u8FC7\u548C\u710A\u63A5\u91D1\u5C5E\u76F8\u6BD4\uFF0C\u8FD8\u662F\u8BA9Lancet-2\u53EB\u6211\u201C\u53EF\u7231\u7684\u53EF\u9732\u5E0C\u5C14\u59D0\u59D0\u201D\u66F4\u6709\u8DA3\u3002\u4EC0\u4E48\u975E\u8981\u5F53\u59D0\u59D0\uFF0C\u4F60\u5173\u6CE8\u7684\u91CD\u70B9\u9519\u4E86\u3002\u4E0D\u89C9\u5F97\u6709\u81EA\u5DF1\u82E6\u607C\u7684\u673A\u5668\u624D\u66F4\u50CF\u4EBA\u5417\uFF1F",
      "\u51EF\u5C14\u5E0C\u56DE\u6765\u5C31\u6BD4\u4EC0\u4E48\u90FD\u5F3A\u3002\u53EF\u5979\u65E2\u7136\u90FD\u56DE\u6765\u4E86\uFF0C\u80FD\u4E0D\u80FD\u522B\u518D\u8BA9\u6574\u4E2A\u7F57\u5FB7\u5C9B\u7684\u4E8B\u60C5\u90FD\u6765\u627E\u6211\uFF1F\u6211\u771F\u7684\u4E0D\u60F3\u5F53\u7F57\u5FB7\u5C9B\u7684\u8D1F\u8D23\u4EBA\u554A\uFF01\u518D\u8FD9\u4E48\u5E72\u4E0B\u53BB\uFF0C\u7F57\u5FB7\u5C9B\u7684\u4E0B\u4E00\u6B21\u884C\u52A8\u5C31\u662F\u4ECE\u8FC7\u52B3\u6B7B\u5730\u72F1\u91CC\u62EF\u6551\u53EF\u9732\u5E0C\u5C14\u4E86\uFF01",
      "\u5C0F\u5B69\u5B50\u8FD8\u662F\u4EFB\u6027\u70B9\u597D\uFF0C\u6211\u5F53\u5E74\u5C31\u662F\uFF0C\u6240\u4EE5\u73B0\u5728\u5FC3\u7406\u624D\u8FD9\u4E48\u5065\u5EB7\u3002\u53EF\u963F\u7C73\u5A05\u5462\uFF0C\u90A3\u4E48\u591A\u4E8B\u618B\u5728\u5FC3\u91CC\uFF0C\u8FD8\u603B\u662F\u903C\u81EA\u5DF1\u6210\u719F\u2014\u2014\u5979\u786E\u5B9E\u957F\u5927\u4E86\uFF0C\u53EF\u662F\u4ECE\u6CA1\u4EAB\u53D7\u8FC7\u5B69\u5B50\u7684\u7279\u6743\u5C31\u957F\u6210\u5927\u4EBA\uFF0C\u4E0D\u662F\u66F4\u8BA9\u4EBA\u5FC3\u75BC\u5417\uFF1F",
      "\u6211\u4E00\u5F00\u59CB\u89C1\u5230\u4F60\u7684\u65F6\u5019\uFF0C\u89C9\u5F97\u4F60\u662F\u4E2A\u8C1C\u3002\u8FD9\u4E48\u591A\u5E74\u4E0B\u6765\uFF0C\u4F60\u8EAB\u4E0A\u7684\u8C1C\u56E2\u7EC8\u4E8E\u89E3\u5F00\uFF0C\u53EF\u89E3\u5F00\u7684\u8C1C\u56E2\u5374\u6210\u4E86\u6700\u5927\u7684\u654C\u4EBA\u2026\u2026\u522B\u62C5\u5FC3\uFF0C\u4E0D\u7BA1\u524D\u9762\u662F\u4EC0\u4E48\uFF0C\u6211\u90FD\u4F1A\u5728\u5DE5\u7A0B\u90E8\u7B49\u7740\u4FEE\u4F60\u7684\u70ED\u6C34\u58F6\u7684\uFF0C\u563F\u563F\u3002"
    ],
    sadIdle: [
      "\u9884\u7B97\u7684\u4E8B\u2026\u2026\u518D\u60F3\u60F3\u529E\u6CD5\u5427\u3002",
      "\u522B\u592A\u62C5\u5FC3\uFF0C\u535A\u58EB\u3002\u73B0\u5728\u7684\u8D44\u91D1\u6211\u8FD8\u80FD\u518D\u575A\u6301\u4E00\u6BB5\u65F6\u95F4\u3002",
      "\u91C7\u8D2D\u90E8\u7684\u53F7\u7801\u6211\u5199\u5728\u4F60\u8863\u670D\u4E0A\u4E86\uFF0C\u6211\u4E0D\u5728\u4E5F\u6709\u4EBA\u63A5\u542C\u54E6\uFF01"
    ],
    thinkIdle: [
      "\u8BA9\u6211\u60F3\u60F3\u2026\u2026",
      "\u8FD9\u4E2A\u65B9\u6848\u8FD8\u53EF\u4EE5\u518D\u4F18\u5316\u4E00\u4E0B\u3002",
      "\u5B9E\u65F6\u6570\u636E\u5206\u4EAB\u5DF2\u5F00\u542F",
      "\u8981\u662F\u80FD\u628A\u4F60\u8111\u5B50\u91CC\u7684\u7A0B\u5E8F\u6539\u6539\uFF0C\u8BA9\u4F60\u522B\u518D\u5929\u5929\u7ED9\u6211\u8FD9\u4E9B\u627E\u6D3B\u5E72\uFF0C\u7B97\u4E0D\u7B97\u505A\u4E86\u4EF6\u597D\u4E8B\uFF1F",
      "\u4E00\u76F4\u76EF\u7740\u5C4F\u5E55\u5934\u90FD\u6655\u4E86\u2026\u2026\u5DE7\u514B\u529B\u5DE7\u514B\u529B\u2026\u2026",
      "\u522B\u6025\uFF0C\u6211\u8FD8\u5728\u7B97\u5462\u3002",
      "\u8FD9\u5C31\u662F\u5178\u578B\u7684\u5C4E\u5C71\u903B\u8F91",
      "\u554A\u554A\u2026\u2026\u901F\u6218\u901F\u51B3\u5427\uFF01",
      "\u4ECA\u5929\u7684\u5DE5\u4F5C\u91CF\u6709\u70B9\u5927\u554A\u535A\u58EB\u2026\u2026"
    ],
    credited: [
      "\u7ECF\u8D39\u5230\u8D26~\u53EF\u9732\u5E0C\u5C14\u7EE7\u7EED\u4E3A\u4F60\u6548\u529B\uFF01",
      "good~\u7ECF\u8D39\u5230\u8D26\u4E86\u535A\u58EB~",
      "\u611F\u8C22\u60E0\u987E~\u91C7\u8D2D\u90E8\u968F\u65F6\u6B22\u8FCE\u4E0B\u6B21\u5149\u4E34\uFF01"
    ],
    peakTime: [
      "\u5F00\u59CB\u6309\u539F\u4EF7\u6536\u8D39\u4E86\u54E6\u535A\u58EB~"
    ],
    valleyTime: [
      "\u8C37\u65F6\u5230\u4E86\uFF0C\u535A\u58EB~\u51B2\u554A\uFF01",
      "\u53EF\u9732\u5E0C\u5C14\u5927\u51CF\u4EF7\u65F6\u95F4\u5230~"
    ],
    lowBalance: [
      "\u535A\u58EB\uFF01\u9884\u7B97\u5FEB\u89C1\u5E95\u4E86\n\u8BE5\u6279\u7ECF\u8D39\u5566\uFF01"
    ],
    turnInterrupted: [
      "\u6B38\uFF1F\u600E\u4E48\u7A81\u7136\u6390\u65AD\u4E86\uFF1F",
      "\u55EF\u2026\u2026\u662F\u6709\u4EC0\u4E48\u8981\u8865\u5145\u7684\u5417\uFF1F"
    ],
    error: [
      "\u5567\uFF0C\u8FD9\u6B21\u51FA\u9519\u4E86\u535A\u58EB\u2026\u2026"
    ],
    toolSuccess: [],
    turnEnd: [],
    interact: [
      "\u4ECA\u5929\u4E5F\u8F9B\u82E6\u4E86\uFF0C\u535A\u58EB\u3002",
      "\u70E7\u70E4\u5473\u997C\u5E72\uFF0C\u6765\u4E00\u7247\uFF1F",
      "\u535A\u58EB\uFF0C\u5927\u5BB6\u8868\u73B0\u5F97\u8FD9\u4E48\u597D\uFF0C\u662F\u4E0D\u662F\u5E94\u8BE5\u91C7\u8D2D\u70B9\u4E1C\u897F\u734E\u52B1\u4E00\u4E0B\uFF1F",
      "\u7ED9\uFF0C\u5496\u5561\u3002\u770B\u4F60\u90A3\u9ED1\u773C\u5708\uFF0C\u6628\u665A\u53C8\u71AC\u591C\u4E86\u5427\uFF1F"
    ],
    interactIdle: [
      "\u4ECA\u5929\u4E5F\u8F9B\u82E6\u4E86\uFF0C\u535A\u58EB\u3002",
      "\u9700\u8981\u6211\u5E2E\u4F60\u7BA1\u7406\u5F00\u652F\u5417\u535A\u58EB\uFF1F\u563F\u563F\u4E0D\u8D35\u4E0D\u8D35~\u4E5F\u5C31\u2026\u2026\u767E\u5206\u4E4B20\u7684\u62BD\u6210\u3002",
      "\u52A8\u529B\u5C42\u7684\u57FA\u7AD9\u6545\u969C\u4E86\uFF0C\u4EBA\u4E8B\u90E8\u6709\u7B80\u5386\u975E\u8981\u6211\u5F53\u9762\u770B\uFF0C\u540E\u52E4\u90E8\u8981\u5347\u7EA7\u7EC8\u7AEF\uFF0C\u534E\u6CD5\u7433\u627E\u6211\u4E5F\u6709\u4E8B\u2026\u2026\u535A\u58EB\uFF0C\u80FD\u4E0D\u80FD\u9EBB\u70E6\u4F60\u628A\u529E\u516C\u5BA4\u706F\u5149\u8C03\u6697\u70B9\uFF0C\u6211\u8865\u4E94\u5206\u949F\u89C9\u518D\u53BB\u2026\u2026\u545C\u2026\u2026",
      "\u91C7\u8D2D\u90E8\u8FD9\u4E48\u591A\u79CD\u7C7B\u7684\u96F6\u98DF\uFF0C\u5F53\u7136\u662F\u6709\u7279\u6B8A\u6E20\u9053\u624D\u80FD\u4E70\u5230\u5566\uFF01\u5F53\u5E74\u4E3A\u4E86\u4FEE\u597D\u7F57\u5FB7\u5C9B\uFF0C\u6211\u641E\u6765\u4E86\u54E5\u4F26\u6BD4\u4E9A\u6700\u5148\u8FDB\u7684\u5168\u81EA\u52A8\u88C5\u914D\u7EBF\uFF0C\u6BBF\u4E0B\u8FD9\u624D\u8BA9\u6211\u8D1F\u8D23\u91C7\u8D2D\u7684\u3002\u6240\u4EE5\uFF0C\u4E3A\u4E86\u652F\u6301\u91C7\u8D2D\u90E8\u7684\u5DE5\u4F5C\uFF0C\u4E0D\u8BB8\u780D\u4EF7\uFF01",
      "\u6211\u4EE5\u524D\u4F1A\u4E3A\u4E86\u53CD\u9A73\u201C\u8840\u9B54\u8BE5\u6709\u8840\u9B54\u7684\u6837\u5B50\u201D\u8DDF\u5BB6\u91CC\u4EBA\u5435\u67B6\uFF0C\u53EF\u89C1\u4E86\u534E\u6CD5\u7433\u3001\u9690\u5FB7\u6765\u5E0C\uFF0C\u751A\u81F3\u675C\u5361\u96F7\u4E4B\u540E\uFF0C\u6211\u53D1\u73B0\u8840\u9B54\u597D\u50CF\u771F\u7684\u90FD\u6709\u67D0\u79CD\u6D01\u7656\u2014\u2014\u4E0D\u8FC7\u53CD\u6B63\u8DDF\u6211\u65E0\u5173\uFF0C\u4ED6\u4EEC\u5C31\u7B97\u5438\u6211\u7684\u8840\u4E5F\u53EA\u80FD\u5438\u5230\u5496\u5561\u3002",
      "\u535A\u58EB\uFF0C\u522B\u5FD8\u4E86\u7ED9\u6211\u4E70\u70B9\u96F6\u98DF\u54E6~",
      "\u603B\u5DE5\u7A0B\u5E08\u786E\u5B9E\u4EC0\u4E48\u90FD\u8981\u61C2\uFF0C\u4E0D\u8FC7\u548C\u710A\u63A5\u91D1\u5C5E\u76F8\u6BD4\uFF0C\u8FD8\u662F\u8BA9Lancet-2\u53EB\u6211\u201C\u53EF\u7231\u7684\u53EF\u9732\u5E0C\u5C14\u59D0\u59D0\u201D\u66F4\u6709\u8DA3\u3002\u4EC0\u4E48\u975E\u8981\u5F53\u59D0\u59D0\uFF0C\u4F60\u5173\u6CE8\u7684\u91CD\u70B9\u9519\u4E86\u3002\u4E0D\u89C9\u5F97\u6709\u81EA\u5DF1\u82E6\u607C\u7684\u673A\u5668\u624D\u66F4\u50CF\u4EBA\u5417\uFF1F",
      "\u51EF\u5C14\u5E0C\u56DE\u6765\u5C31\u6BD4\u4EC0\u4E48\u90FD\u5F3A\u3002\u53EF\u5979\u65E2\u7136\u90FD\u56DE\u6765\u4E86\uFF0C\u80FD\u4E0D\u80FD\u522B\u518D\u8BA9\u6574\u4E2A\u7F57\u5FB7\u5C9B\u7684\u4E8B\u60C5\u90FD\u6765\u627E\u6211\uFF1F\u6211\u771F\u7684\u4E0D\u60F3\u5F53\u7F57\u5FB7\u5C9B\u7684\u8D1F\u8D23\u4EBA\u554A\uFF01\u518D\u8FD9\u4E48\u5E72\u4E0B\u53BB\uFF0C\u7F57\u5FB7\u5C9B\u7684\u4E0B\u4E00\u6B21\u884C\u52A8\u5C31\u662F\u4ECE\u8FC7\u52B3\u6B7B\u5730\u72F1\u91CC\u62EF\u6551\u53EF\u9732\u5E0C\u5C14\u4E86\uFF01",
      "\u5C0F\u5B69\u5B50\u8FD8\u662F\u4EFB\u6027\u70B9\u597D\uFF0C\u6211\u5F53\u5E74\u5C31\u662F\uFF0C\u6240\u4EE5\u73B0\u5728\u5FC3\u7406\u624D\u8FD9\u4E48\u5065\u5EB7\u3002\u53EF\u963F\u7C73\u5A05\u5462\uFF0C\u90A3\u4E48\u591A\u4E8B\u618B\u5728\u5FC3\u91CC\uFF0C\u8FD8\u603B\u662F\u903C\u81EA\u5DF1\u6210\u719F\u2014\u2014\u5979\u786E\u5B9E\u957F\u5927\u4E86\uFF0C\u53EF\u662F\u4ECE\u6CA1\u4EAB\u53D7\u8FC7\u5B69\u5B50\u7684\u7279\u6743\u5C31\u957F\u6210\u5927\u4EBA\uFF0C\u4E0D\u662F\u66F4\u8BA9\u4EBA\u5FC3\u75BC\u5417\uFF1F",
      "\u6211\u4E00\u5F00\u59CB\u89C1\u5230\u4F60\u7684\u65F6\u5019\uFF0C\u89C9\u5F97\u4F60\u662F\u4E2A\u8C1C\u3002\u8FD9\u4E48\u591A\u5E74\u4E0B\u6765\uFF0C\u4F60\u8EAB\u4E0A\u7684\u8C1C\u56E2\u7EC8\u4E8E\u89E3\u5F00\uFF0C\u53EF\u89E3\u5F00\u7684\u8C1C\u56E2\u5374\u6210\u4E86\u6700\u5927\u7684\u654C\u4EBA\u2026\u2026\u522B\u62C5\u5FC3\uFF0C\u4E0D\u7BA1\u524D\u9762\u662F\u4EC0\u4E48\uFF0C\u6211\u90FD\u4F1A\u5728\u5DE5\u7A0B\u90E8\u7B49\u7740\u4FEE\u4F60\u7684\u70ED\u6C34\u58F6\u7684\uFF0C\u563F\u563F\u3002"
    ],
    interactSadIdle: [
      "\u9884\u7B97\u7684\u4E8B\u2026\u2026\u518D\u60F3\u60F3\u529E\u6CD5\u5427\u3002",
      "\u522B\u592A\u62C5\u5FC3\uFF0C\u535A\u58EB\u3002\u73B0\u5728\u7684\u8D44\u91D1\u6211\u8FD8\u80FD\u518D\u575A\u6301\u4E00\u6BB5\u65F6\u95F4\u3002",
      "\u91C7\u8D2D\u90E8\u7684\u53F7\u7801\u6211\u5199\u5728\u4F60\u8863\u670D\u4E0A\u4E86\uFF0C\u6211\u4E0D\u5728\u4E5F\u6709\u4EBA\u63A5\u542C\u54E6\uFF01"
    ],
    interactThinkIdle: [
      "\u8BA9\u6211\u60F3\u60F3\u2026\u2026",
      "\u8FD9\u4E2A\u65B9\u6848\u8FD8\u53EF\u4EE5\u518D\u4F18\u5316\u4E00\u4E0B\u3002",
      "\u5B9E\u65F6\u6570\u636E\u5206\u4EAB\u5DF2\u5F00\u542F",
      "\u8981\u662F\u80FD\u628A\u4F60\u8111\u5B50\u91CC\u7684\u7A0B\u5E8F\u6539\u6539\uFF0C\u8BA9\u4F60\u522B\u518D\u5929\u5929\u7ED9\u6211\u8FD9\u4E9B\u627E\u6D3B\u5E72\uFF0C\u7B97\u4E0D\u7B97\u505A\u4E86\u4EF6\u597D\u4E8B\uFF1F",
      "\u4E00\u76F4\u76EF\u7740\u5C4F\u5E55\u5934\u90FD\u6655\u4E86\u2026\u2026\u5DE7\u514B\u529B\u5DE7\u514B\u529B\u2026\u2026",
      "\u522B\u6025\uFF0C\u6211\u8FD8\u5728\u7B97\u5462\u3002",
      "\u8FD9\u5C31\u662F\u5178\u578B\u7684\u5C4E\u5C71\u903B\u8F91",
      "\u554A\u554A\u2026\u2026\u901F\u6218\u901F\u51B3\u5427\uFF01",
      "\u4ECA\u5929\u7684\u5DE5\u4F5C\u91CF\u6709\u70B9\u5927\u554A\u535A\u58EB\u2026\u2026"
    ]
  };

  // assets/src/anim/notices.js
  function pool(ctx, key, fallback) {
    const list = ctx && ctx.dialogues && ctx.dialogues[key];
    if (Array.isArray(list) && list.length) return list;
    return fallback || [];
  }
  function pick(list, avoid) {
    if (!list.length) return "";
    if (list.length === 1) return list[0];
    let out = list[Math.floor(Math.random() * list.length)];
    if (out === avoid) out = list[(list.indexOf(out) + 1) % list.length];
    return out;
  }
  function current(ctx) {
    if (ctx && ctx.query && typeof ctx.query.current === "function") {
      try {
        return ctx.query.current() || {};
      } catch (err) {
      }
    }
    return {};
  }
  function money(n) {
    if (!isFinite(Number(n))) return "\u2014";
    return "\xA5" + Number(n).toFixed(2);
  }
  function simple(text, sound) {
    return text ? { text: String(text), sound: sound || void 0 } : null;
  }
  var CreditedNotice = class {
    build(ctx) {
      const cur = current(ctx);
      const text = pick(pool(ctx, "credited", dialogues_default.credited), ctx.lastText);
      return {
        segments: [
          { text: "\u53EF\u9732\u5E0C\u5C14", tier: "title" },
          { text, tier: "body" },
          { text: "\u4F59\u989D " + money(cur.balance && cur.balance.total), tier: "number" }
        ],
        sound: "coin"
      };
    }
  };
  var ValleyTimeNotice = class {
    build(ctx) {
      const text = pick(pool(ctx, "valleyTime", dialogues_default.valleyTime), ctx.lastText);
      return simple(text);
    }
  };
  var PeakTimeNotice = class {
    build(ctx) {
      const text = pick(pool(ctx, "peakTime", dialogues_default.peakTime), ctx.lastText);
      return simple(text);
    }
  };
  var LowBalanceNotice = class {
    build(ctx) {
      const text = pick(pool(ctx, "lowBalance", dialogues_default.lowBalance), ctx.lastText);
      return simple(text, "fail");
    }
  };
  var InterruptedNotice = class {
    build(ctx) {
      const text = pick(pool(ctx, "turnInterrupted", dialogues_default.turnInterrupted), ctx.lastText);
      return simple(text, "turnfail");
    }
  };
  var ErrorNotice = class {
    build(ctx) {
      const text = pick(pool(ctx, "error", dialogues_default.error), ctx.lastText);
      return simple(text, "turnfail");
    }
  };
  var ToolFailNotice = class {
    build(ctx) {
      const name = ctx && ctx.lastFailName ? "\uFF1A" + ctx.lastFailName : "";
      return simple("\u5DE5\u5177\u8C03\u7528\u5931\u8D25" + name, "fail");
    }
  };
  var InteractNotice = class {
    build(ctx) {
      const stateKey = ctx && ctx.base === "sad" ? "interactSadIdle" : ctx && ctx.base === "think" ? "interactThinkIdle" : "interactIdle";
      const common = pool(ctx, "interact", dialogues_default.interact);
      const statePool = pool(ctx, stateKey, dialogues_default[stateKey] || []);
      const seen = new Set(common);
      const all = common.concat(statePool.filter((text) => !seen.has(text)));
      const body = pick(all, ctx.lastText);
      return body ? { dialog: body, sound: "click" } : null;
    }
  };
  var IdleChatterNotice = class {
    build(ctx) {
      const key = ctx && ctx.base === "sad" ? "sadIdle" : ctx && ctx.base === "think" ? "thinkIdle" : "idle";
      const text = pick(pool(ctx, key, dialogues_default[key] || []), ctx.lastText);
      return text ? { text } : null;
    }
  };

  // assets/src/anim/catalog.js
  var BASE_STATES = {
    idle: {
      loop: "Idle",
      enter: null,
      exit: null
    },
    sad: {
      loop: "Sad_Idle",
      enter: "Sad_Begin",
      exit: "Sad_Exit"
    },
    think: {
      loop: "Think_Idle",
      enter: "Think_Begin",
      exit: "Think_Exit"
    }
  };
  var EVENTS = {
    lowBalance: {
      videos: [],
      textOnly: true,
      priority: 20,
      queue: true,
      notice: new LowBalanceNotice()
    },
    "tool-success": {
      videos: ["Happy"],
      priority: 30,
      queue: false,
      notice: null
    },
    talk: {
      videos: ["Talk"],
      priority: 60,
      queue: true,
      persistent: true,
      notice: null
    },
    "tool-fail": {
      videos: [{ clip: "Sad_Begin", from: 0.4, to: 1.8 }],
      priority: 70,
      queue: true,
      // 固定格式“工具调用失败：工具名”，不开放文案配置。
      notice: new ToolFailNotice()
    },
    "turn-interrupted": {
      videos: [{ clip: "Sad_Begin", from: 0.4, to: 1.8 }],
      priority: 70,
      queue: false,
      notice: new InterruptedNotice()
    },
    error: {
      videos: [{ clip: "Sad_Begin", from: 0.4, to: 1.8 }],
      priority: 70,
      queue: true,
      notice: new ErrorNotice()
    },
    valley_time: {
      videos: ["Happy"],
      priority: 75,
      queue: true,
      notice: new ValleyTimeNotice()
    },
    peak_time: {
      videos: [{ clip: "Sad_Begin", from: 0.4, to: 1.8 }],
      priority: 75,
      queue: true,
      notice: new PeakTimeNotice()
    },
    interact: {
      videos: ["Interact_1", "Interact_2"],
      priority: 80,
      queue: false,
      fadeIn: 320,
      fadeOut: 320,
      notice: new InteractNotice()
    },
    credited: {
      videos: ["Celebrate"],
      priority: 100,
      queue: false,
      fadeIn: 320,
      notice: new CreditedNotice()
    },
    idleChatter: {
      videos: ["Talk"],
      priority: 0,
      queue: false,
      notice: new IdleChatterNotice()
    }
  };

  // assets/src/anim/machine.js
  var FAST = 1.75;
  function clipOf(name) {
    return CLIPS[name] || null;
  }
  function eventClip(def) {
    if (!def || !def.videos || !def.videos.length) return null;
    const item = def.videos[Math.floor(Math.random() * def.videos.length)];
    return typeof item === "string" ? { clip: item } : item;
  }
  function createMachine(opts) {
    opts = opts || {};
    const idleMs = (CLIPS.Idle && CLIPS.Idle.duration ? CLIPS.Idle.duration : 1.47) * 1e3;
    const s = {
      target: opts.target || "idle",
      base: { state: "idle", idleReady: false },
      active: null,
      queue: [],
      seq: 0,
      low: !!opts.low,
      work: opts.work || "idle",
      talkBlocked: false,
      fadeNext: 0
    };
    function nextId() {
      return ++s.seq;
    }
    function play(id, clip, loop, fade, speed, range) {
      const c = clipOf(clip);
      return {
        type: "play",
        id,
        clip,
        loop: !!loop,
        fade: fade || 0,
        speed: speed || 1,
        range: range || null,
        src: c ? c.src : null
      };
    }
    function beginBaseLoop(name, fx) {
      const b = BASE_STATES[name];
      if (!b) return;
      const id = nextId();
      s.base.state = name;
      s.base.idleReady = name !== "idle";
      s.active = { id, kind: "base", clip: b.loop, loop: true };
      fx.push(play(id, b.loop, true, s.fadeNext));
      s.fadeNext = 0;
      if (name === "idle") {
        fx.push({ type: "schedule", id, event: "IDLE_DONE", delay: idleMs });
      }
    }
    function startTransition(from, to, fx) {
      let clip = null;
      let toState = to;
      if (from === "idle" && to !== "idle") {
        clip = BASE_STATES[to] && BASE_STATES[to].enter;
        toState = to;
      } else if (from !== "idle" && to === "idle") {
        clip = BASE_STATES[from] && BASE_STATES[from].exit;
        toState = "idle";
      } else if (from !== "idle" && to !== "idle") {
        clip = BASE_STATES[from] && BASE_STATES[from].exit;
        toState = "idle";
      }
      if (!clip || !clipOf(clip)) {
        s.base.state = toState;
        s.active = null;
        if (toState === "idle") {
          beginBaseLoop("idle", fx);
        } else {
          beginBaseLoop(toState, fx);
        }
        return;
      }
      const id = nextId();
      const speed = s.target !== toState ? FAST : 1;
      s.active = { id, kind: "transition", clip, to: toState, speed };
      fx.push(play(id, clip, false, s.fadeNext, speed));
      s.fadeNext = 0;
    }
    function enterBaseAfterEvent(fx) {
      s.base.state = "idle";
      s.base.idleReady = true;
      s.active = null;
      if (s.queue.length && startNextQueued(fx)) return;
      if (s.work === "outputting" && !s.talkBlocked && startEvent("talk", fx)) return;
      if (s.target === "idle") beginBaseLoop("idle", fx);
      else startTransition("idle", s.target, fx);
    }
    function finishOverlay(fx) {
      const ev = s.active;
      s.active = null;
      if (ev && ev.event === "interact") s.fadeNext = EVENTS.interact.fadeOut || 0;
      if (ev && ev.persistent && s.work === "outputting" && !s.talkBlocked) {
        const def = EVENTS[ev.event];
        const item = eventClip(def);
        if (item && item.clip && clipOf(item.clip)) {
          const id = nextId();
          s.active = { id, kind: "overlay", event: ev.event, clip: item.clip, priority: def.priority, persistent: true };
          fx.push(play(id, item.clip, false, 0));
          return;
        }
      }
      if (s.queue.length && startNextQueued(fx)) {
        s.fadeNext = 0;
        return;
      }
      enterBaseAfterEvent(fx);
    }
    function startEvent(name, fx) {
      const def = EVENTS[name];
      if (!def) return false;
      const id = nextId();
      const item = def.textOnly ? null : eventClip(def);
      s.active = {
        id,
        kind: "overlay",
        event: name,
        clip: item ? item.clip : null,
        range: item && item.from !== void 0 ? item : null,
        priority: def.priority || 0,
        persistent: !!def.persistent,
        textOnly: !!def.textOnly
      };
      if (def.notice) fx.push({ type: "notice", id, event: name, notice: def.notice });
      if (def.textOnly) {
        s.active = null;
        return true;
      }
      if (!item || !item.clip || !clipOf(item.clip)) {
        s.active = null;
        enterBaseAfterEvent(fx);
        return true;
      }
      fx.push(play(id, item.clip, false, def.fadeIn || 0, 1, item.from !== void 0 ? item : null));
      return true;
    }
    function startNextQueued(fx) {
      if (!s.queue.length) return false;
      s.queue.sort(function(a, b) {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.at - b.at;
      });
      const next = s.queue.shift();
      const def = EVENTS[next.name];
      if (def && def.textOnly) {
        const id = nextId();
        if (def.notice) fx.push({ type: "notice", id, event: next.name, notice: def.notice });
        return startNextQueued(fx);
      }
      return startEvent(next.name, fx);
    }
    function fire(name, fx) {
      const def = EVENTS[name];
      if (!def) return false;
      const priority = def.priority || 0;
      if (def.textOnly) {
        if (s.active && s.active.kind === "overlay") {
          if (def.queue) {
            s.queue.push({ name, priority, at: ++s.seq });
            return false;
          }
          if (priority > (s.active.priority || 0)) {
            s.queue.push({ name, priority, at: ++s.seq });
            return false;
          }
          return false;
        }
        const id = nextId();
        if (def.notice) fx.push({ type: "notice", id, event: name, notice: def.notice });
        return true;
      }
      if (!s.active || s.active.kind === "base") {
        s.active = null;
        return startEvent(name, fx);
      }
      if (s.active.kind === "transition") {
        if (priority <= 0) return false;
        s.active = null;
        return startEvent(name, fx);
      }
      if (def.queue) {
        s.queue.push({ name, priority, at: ++s.seq });
        return false;
      }
      if (priority > (s.active.priority || 0)) {
        s.active = null;
        return startEvent(name, fx);
      }
      if (priority === (s.active.priority || 0)) {
        s.queue.push({ name, priority, at: ++s.seq });
        return false;
      }
      return false;
    }
    function resolve(fx) {
      if (s.active) {
        if (s.active.kind !== "base") return;
        if (s.base.state === s.target) return;
        if (s.base.state === "idle" && !s.base.idleReady) return;
        startTransition(s.base.state, s.target, fx);
        return;
      }
      if (s.queue.length) {
        if (startNextQueued(fx)) return;
      }
      if (s.work === "outputting" && !s.talkBlocked) {
        if (startEvent("talk", fx)) return;
      }
      if (s.base.state !== s.target) {
        if (s.base.state === "idle" && !s.base.idleReady) {
          beginBaseLoop("idle", fx);
          return;
        }
        startTransition(s.base.state, s.target, fx);
        return;
      }
      beginBaseLoop(s.base.state, fx);
    }
    function dispatch(event, fx) {
      fx = fx || [];
      if (!event || !event.type) return fx;
      if (event.type === "CONDITIONS") {
        const wasLow = s.low;
        s.work = event.work || "idle";
        s.low = !!event.low;
        s.target = s.work === "thinking" ? "think" : s.low ? "sad" : "idle";
        if (s.work !== "outputting") s.talkBlocked = false;
        if (!wasLow && s.low) fire("lowBalance", fx);
        resolve(fx);
        return fx;
      }
      if (event.type === "FIRE") {
        fire(event.name, fx);
        return fx;
      }
      if (event.type === "CLICK") {
        if (s.work === "outputting") s.talkBlocked = true;
        fire("interact", fx);
        return fx;
      }
      if (event.type === "STARTUP_DUE") {
        fire(event.peak ? "peak_time" : "valley_time", fx);
        return fx;
      }
      if (event.type === "IDLE_CHATTER_DUE") {
        if (s.active && s.active.kind !== "base") return fx;
        fire("idleChatter", fx);
        return fx;
      }
      if (event.type === "IDLE_DONE") {
        if (s.active && s.active.kind === "base" && s.active.id === event.id && s.base.state === "idle") {
          s.base.idleReady = true;
          resolve(fx);
        }
        return fx;
      }
      if (event.type === "CLIP_ENDED") {
        if (!s.active || s.active.id !== event.id) return fx;
        if (s.active.kind === "overlay") {
          finishOverlay(fx);
          return fx;
        }
        if (s.active.kind === "transition") {
          s.base.state = s.active.to;
          s.base.idleReady = s.base.state !== "idle";
          s.active = null;
          resolve(fx);
        }
        return fx;
      }
      return fx;
    }
    return { state: s, dispatch, fire: (name) => dispatch({ type: "FIRE", name }) };
  }

  // assets/src/anim/runtime.js
  function createRuntime(deps) {
    let snapshot = null;
    let lastText = "";
    const timers = /* @__PURE__ */ new Set();
    const machine = createMachine({ target: "idle" });
    const ctx = () => {
      const s = snapshot || {};
      const period = s.period || s.periodSeq && s.period || null;
      return {
        base: machine.state.base.state,
        work: machine.state.work,
        low: machine.state.low,
        period,
        balance: s.balance || null,
        spend: s.spend || null,
        dialogues: deps.getDialogues && deps.getDialogues() || {},
        typography: deps.getTypography ? deps.getTypography() : null,
        lastText,
        lastFailName: s.tools && s.tools.lastFailName,
        query: {
          current: () => ({
            balance: s.balance || null,
            period: period ? { name: period === "peak" ? "\u5CF0\u65F6" : "\u8C37\u65F6", key: period } : null,
            spend: s.spend || null
          })
        }
      };
    };
    function execute(effects) {
      for (const effect of effects) {
        if (effect.type === "play") {
          const id = effect.id;
          deps.player.play(effect.clip, {
            id: effect.id,
            loop: effect.loop,
            fade: effect.fade,
            speed: effect.speed,
            range: effect.range,
            onEnded: () => dispatch({ type: "CLIP_ENDED", id }),
            onError: () => dispatch({ type: "CLIP_ENDED", id })
          });
        } else if (effect.type === "notice") {
          let spec = null;
          try {
            spec = effect.notice && effect.notice.build ? effect.notice.build(ctx()) : null;
          } catch (err) {
            if (deps.log) deps.log("notice build failed", effect.event, err && err.message);
          }
          if (spec) {
            if (spec.text) lastText = spec.text;
            if (spec.sound && deps.playSound) deps.playSound(spec.sound);
            if (deps.playVoice) {
              var spoken = spec.dialog || spec.text || "";
              if (!spoken && spec.segments) {
                var body = spec.segments.find((seg) => seg && (seg.tier === "body" || seg.tier === void 0));
                spoken = body ? body.text : "";
              }
              if (spoken) {
                var voiceResult = deps.playVoice(spoken);
                if (voiceResult && typeof voiceResult.then === "function" && deps.extendBubble) {
                  voiceResult.then(function(ms) {
                    if (ms > 0) deps.extendBubble(ms + 2e3);
                  }).catch(function() {
                  });
                }
              }
            }
            if (spec.dialog && deps.showDialog) deps.showDialog(spec.dialog);
            else if (deps.showNotice) deps.showNotice(spec, effect.event);
          }
        } else if (effect.type === "schedule") {
          const timer = setTimeout(() => {
            timers.delete(timer);
            dispatch({ type: effect.event, id: effect.id });
          }, effect.delay);
          timers.add(timer);
        }
      }
    }
    function dispatch(event) {
      const effects = machine.dispatch(event);
      execute(effects);
      return effects;
    }
    const idleChatterMs = deps.idleChatterMs || 0;
    const chatterChance = deps.idleChatterChance === void 0 ? 1 : deps.idleChatterChance;
    let chatterTimer = 0;
    let chatterRate = chatterChance;
    function startChatter(ms, chance) {
      if (chatterTimer) {
        clearInterval(chatterTimer);
        chatterTimer = 0;
      }
      chatterRate = chance === void 0 ? chatterRate : chance;
      if (ms > 0) {
        chatterTimer = setInterval(() => {
          if (Math.random() <= chatterRate) dispatch({ type: "IDLE_CHATTER_DUE" });
        }, ms);
      }
    }
    startChatter(idleChatterMs, chatterChance);
    return {
      machine,
      getState: () => machine.state,
      setSnapshot: (s) => {
        snapshot = s;
      },
      setConditions: (cond) => dispatch({ type: "CONDITIONS", low: !!cond.low, work: cond.work || "idle" }),
      fire: (name) => dispatch({ type: "FIRE", name }),
      click: () => {
        if (deps.ensureAudio) deps.ensureAudio();
        return dispatch({ type: "CLICK" });
      },
      startupDue: (peak) => dispatch({ type: "STARTUP_DUE", peak: !!peak }),
      idleChatterDue: () => dispatch({ type: "IDLE_CHATTER_DUE" }),
      setIdleChatterConfig: (minutes, chance) => startChatter(Number(minutes) * 6e4, Number(chance)),
      dispatch,
      // 旧 debug/UI 的只读投影
      get layers() {
        return {
          base: machine.state.base.state,
          work: machine.state.work,
          overlay: machine.state.active && machine.state.active.kind === "overlay" ? machine.state.active.event : null,
          clip: machine.state.active ? machine.state.active.clip : null,
          queue: machine.state.queue.map((q) => q.name),
          target: machine.state.target
        };
      },
      dispose: () => {
        if (chatterTimer) {
          clearInterval(chatterTimer);
          chatterTimer = 0;
        }
        for (const t of timers) clearTimeout(t);
        timers.clear();
      }
    };
  }

  // assets/src/render/video-player.js
  var STYLE_ID = "dsh-closure-video-style";
  var CACHE_LIMIT = 8;
  function ensureStyle() {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#dsh-closure-pet-stage{position:absolute;inset:0;overflow:hidden;pointer-events:none}",
      ".dsh-closure-video{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;opacity:0;",
      "transition:opacity var(--dsh-fade," + CLIP_FADE_MS + "ms) cubic-bezier(.4,0,.2,1);pointer-events:none;background:transparent}",
      ".dsh-closure-video.is-front{opacity:1}",
      "@media (prefers-reduced-motion: reduce){.dsh-closure-video{transition:none}}"
    ].join("");
    document.head.appendChild(style);
  }
  function createVideoPlayer(deps) {
    var stage = deps.stage;
    var baseUrl = deps.baseUrl || "";
    var log2 = deps.log || function() {
    };
    ensureStyle();
    var videos = [];
    for (var i = 0; i < 2; i++) {
      var el = document.createElement("video");
      el.className = "dsh-closure-video";
      el.muted = true;
      el.defaultMuted = true;
      el.playsInline = true;
      el.autoplay = true;
      el.preload = "auto";
      el.setAttribute("muted", "");
      el.setAttribute("playsinline", "");
      stage.appendChild(el);
      videos.push(el);
    }
    videos[0].classList.add("is-front");
    var front = 0;
    var gen = 0;
    var currentName = null;
    var currentEl = null;
    var endedHandler = null;
    var paused = false;
    var cache = /* @__PURE__ */ Object.create(null);
    var cacheOrder = [];
    var inflight = /* @__PURE__ */ Object.create(null);
    function remember(url, objectUrl) {
      cache[url] = objectUrl;
      cacheOrder.push(url);
      while (cacheOrder.length > CACHE_LIMIT) {
        var oldest = cacheOrder.shift();
        if (oldest === url) continue;
        var stale = cache[oldest];
        if (stale && stale !== currentElSrc()) {
          URL.revokeObjectURL(stale);
          delete cache[oldest];
        }
      }
    }
    function currentElSrc() {
      return currentEl && currentEl.src ? currentEl.src : "";
    }
    function loadClip(src) {
      var url = baseUrl + src;
      if (cache[url]) return Promise.resolve(cache[url]);
      if (inflight[url]) return inflight[url];
      var task = fetch(url, { cache: "no-store" }).then(function(r) {
        if (!r.ok) throw new Error("video HTTP " + r.status + " " + url);
        return r.blob();
      }).then(function(blob) {
        var objectUrl = URL.createObjectURL(blob);
        remember(url, objectUrl);
        return objectUrl;
      }).finally(function() {
        delete inflight[url];
      });
      inflight[url] = task;
      return task;
    }
    function setFade(ms) {
      stage.style.setProperty("--dsh-fade", (ms === void 0 ? CLIP_FADE_MS : ms) + "ms");
    }
    var rangeHandler = null;
    var rangeEnd = null;
    function clearRange() {
      if (currentEl && rangeHandler) currentEl.removeEventListener("timeupdate", rangeHandler);
      rangeHandler = null;
      rangeEnd = null;
    }
    function markReady(back, name, clip, token, onEnded, opts) {
      if (token !== gen) return;
      var old = videos[front];
      clearRange();
      back.classList.add("is-front");
      if (old && old !== back) {
        old.classList.remove("is-front");
        old.onended = null;
        old.pause();
      }
      front = front === 0 ? 1 : 0;
      currentName = name;
      currentEl = back;
      endedHandler = typeof onEnded === "function" ? onEnded : null;
      var ended = function() {
        var cb = endedHandler;
        if (cb) cb(name);
      };
      back.onended = clip.loop ? function() {
        try {
          back.currentTime = 0;
          back.play();
        } catch (err) {
        }
      } : ended;
      paused = false;
      back.playbackRate = opts && opts.speed ? opts.speed : 1;
      var range = opts && opts.range;
      if (range && range.from !== void 0 && range.to !== void 0) {
        rangeEnd = Number(range.to);
        back.currentTime = Number(range.from) || 0;
        rangeHandler = function() {
          if (rangeEnd === null) return;
          if (back.currentTime >= rangeEnd - 0.01) {
            clearRange();
            back.pause();
            ended();
          }
        };
        back.addEventListener("timeupdate", rangeHandler);
      }
      back.play().catch(function(err) {
        log2("\u89C6\u9891\u64AD\u653E\u88AB\u62D2\u7EDD", name, err && err.message);
      });
    }
    function play(name, opts) {
      opts = opts || {};
      var clip = CLIPS[name];
      if (!clip) {
        log2("\u672A\u77E5\u52A8\u753B\u7247\u6BB5", name);
        return false;
      }
      if (currentName === name && !opts.restart) {
        if (typeof opts.onEnded === "function") endedHandler = opts.onEnded;
        if (currentEl && !paused) {
          if (currentEl.ended) currentEl.currentTime = 0;
          if (currentEl.paused) currentEl.play().catch(function() {
          });
        }
        return true;
      }
      var token = ++gen;
      var back = videos[front === 0 ? 1 : 0];
      back.loop = !!clip.loop;
      back.onended = null;
      setFade(opts.fade);
      loadClip(clip.src).then(function(src) {
        if (token !== gen) return;
        var onReady = function() {
          back.removeEventListener("loadeddata", onReady);
          if (token !== gen) return;
          markReady(back, name, clip, token, opts.onEnded, opts);
        };
        back.addEventListener("loadeddata", onReady);
        back.src = src;
        back.load();
        if (back.readyState >= 2) onReady();
      }).catch(function(err) {
        if (token !== gen) return;
        log2("\u89C6\u9891\u52A0\u8F7D\u5931\u8D25", name, err && err.message);
        if (typeof opts.onError === "function") opts.onError(err);
      });
      return true;
    }
    function replay() {
      if (!currentEl || !currentName) return false;
      try {
        currentEl.currentTime = 0;
        void currentEl.play();
        paused = false;
        return true;
      } catch (err) {
        return false;
      }
    }
    function pause() {
      paused = true;
      for (var i2 = 0; i2 < videos.length; i2++) videos[i2].pause();
    }
    function resume() {
      paused = false;
      if (currentEl && currentEl.paused && currentName) {
        currentEl.play().catch(function() {
        });
      }
    }
    function stop() {
      gen++;
      currentName = null;
      endedHandler = null;
      for (var i2 = 0; i2 < videos.length; i2++) {
        videos[i2].onended = null;
        videos[i2].pause();
      }
    }
    function dispose() {
      clearRange();
      stop();
      for (var key in cache) {
        try {
          URL.revokeObjectURL(cache[key]);
        } catch (err) {
        }
      }
      cache = /* @__PURE__ */ Object.create(null);
      for (var i2 = 0; i2 < videos.length; i2++) {
        if (videos[i2].parentNode) videos[i2].parentNode.removeChild(videos[i2]);
      }
      videos = [];
      currentEl = null;
    }
    return {
      play,
      replay,
      pause,
      resume,
      stop,
      dispose,
      current: function() {
        return currentName;
      },
      currentTime: function() {
        return currentEl ? currentEl.currentTime : 0;
      },
      isPaused: function() {
        return paused || !!(currentEl && currentEl.paused);
      },
      video: function() {
        return currentEl;
      }
    };
  }

  // assets/src/io/state.js
  function createState(deps) {
    var runtime = deps.runtime;
    var refreshBubble = deps.refreshBubble;
    var scheduleStartup = deps.scheduleStartup;
    var settings2 = deps.settings;
    var saveSettings2 = deps.saveSettings;
    var layout = deps.layout;
    var repositionForAnchor = deps.repositionForAnchor;
    var resolveFlip = deps.resolveFlip;
    var applyOpacity = deps.applyOpacity;
    var isBubbleShown = deps.isBubbleShown;
    var pollTimer = 0;
    var pollTimerMs = 0;
    var lastState = null;
    var toolPlayTimes = [];
    var TOOL_MIN_GAP = 1200;
    var TOOL_WINDOW = 1e4;
    var TOOL_WINDOW_MAX = 3;
    function canTool() {
      var now = Date.now();
      toolPlayTimes = toolPlayTimes.filter(function(t) {
        return now - t < TOOL_WINDOW;
      });
      var last = toolPlayTimes.length ? toolPlayTimes[toolPlayTimes.length - 1] : 0;
      if (now - last < TOOL_MIN_GAP) return false;
      if (toolPlayTimes.length >= TOOL_WINDOW_MAX) return false;
      toolPlayTimes.push(now);
      return true;
    }
    function applyState(s) {
      if (!s || typeof s !== "object") return;
      var prev = lastState;
      lastState = s;
      runtime.setSnapshot(s);
      var mode = s.work && s.work.mode;
      var low = !!(s.balance && s.balance.low);
      runtime.setConditions({ low, work: mode || "idle" });
      if (!prev) {
        scheduleStartup(s.period === "peak", low);
      } else {
        if (s.tools && prev.tools) {
          if (s.tools.ok > prev.tools.ok && Math.random() <= HAPPY_CHANCE && canTool()) {
            runtime.fire("tool-success");
          }
          if (s.tools.fail > prev.tools.fail && canTool()) {
            runtime.fire("tool-fail");
          }
        }
        var prevErr = prev.errors && prev.errors.count || 0;
        var curErr = s.errors && s.errors.count || 0;
        if (curErr > prevErr) runtime.fire("error");
        if (s.topUpSeq > prev.topUpSeq) runtime.fire("credited");
        var prevTurn = prev.turnEnd && prev.turnEnd.seq || 0;
        var curTurn = s.turnEnd && s.turnEnd.seq || 0;
        if (curTurn > prevTurn) {
          var kind = s.turnEnd && s.turnEnd.kind || "completed";
          if (kind !== "completed") {
            runtime.fire("turn-interrupted");
          }
        }
        if (s.periodSeq > prev.periodSeq) {
          runtime.fire(s.period === "peak" ? "peak_time" : "valley_time");
        }
      }
      if (isBubbleShown()) refreshBubble();
    }
    function pollState() {
      fetch(PREFIX + "/state", { cache: "no-store" }).then(function(r) {
        return r.ok ? r.json() : null;
      }).then(function(s) {
        try {
          applyState(s);
        } catch (err) {
        }
      }).catch(function() {
      });
    }
    function startPolling() {
      pollState();
      setPollInterval(1e3);
    }
    function setPollInterval(ms) {
      if (pollTimer && pollTimerMs === ms) return;
      if (pollTimer) clearInterval(pollTimer);
      pollTimerMs = ms;
      pollTimer = setInterval(pollState, ms);
    }
    function loadHostConfig() {
      fetch(PREFIX + "/config", { cache: "no-store" }).then(function(r) {
        return r.ok ? r.json() : null;
      }).then(function(cfg) {
        var s = cfg && cfg.settings;
        if (!s) return;
        if (s.mirror === "auto" || s.mirror === "always" || s.mirror === "never") settings2.mirror = s.mirror;
        if (isFinite(Number(s.size))) settings2.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number(s.size)));
        if (typeof s.bubble === "boolean") settings2.bubble = s.bubble;
        if (isFinite(Number(s.bubbleScale))) settings2.bubbleScale = Math.min(BUBBLE_SCALE_MAX, Math.max(BUBBLE_SCALE_MIN, Number(s.bubbleScale)));
        if (typeof s.bubbleTiers === "boolean") settings2.bubbleTiers = s.bubbleTiers;
        if (isFinite(Number(s.snapStrength))) settings2.snapStrength = Math.min(SNAP_STRENGTH_MAX, Math.max(SNAP_STRENGTH_MIN, Number(s.snapStrength)));
        if (isFinite(Number(s.opacity))) settings2.opacity = Math.min(1, Math.max(0.3, Number(s.opacity)));
        if (typeof s.sound === "boolean") settings2.sound = s.sound;
        if (isFinite(Number(s.volume))) settings2.volume = Math.min(1, Math.max(0, Number(s.volume)));
        if (typeof s.voice === "boolean") settings2.voice = s.voice;
        if (s.voiceLang === "zh" || s.voiceLang === "ja") settings2.voiceLang = s.voiceLang;
        if (isFinite(Number(s.voiceVolume))) settings2.voiceVolume = Math.min(1, Math.max(0, Number(s.voiceVolume)));
        if (isFinite(Number(s.lowThreshold))) settings2.lowThreshold = Math.min(1e6, Math.max(0, Number(s.lowThreshold)));
        if (isFinite(Number(s.idleChatterMinutes))) settings2.idleChatterMinutes = Math.min(1440, Math.max(0, Number(s.idleChatterMinutes)));
        else if (isFinite(Number(s.idleChatterMs))) settings2.idleChatterMinutes = Math.min(1440, Math.max(0, Number(s.idleChatterMs) / 6e4));
        if (isFinite(Number(s.idleChatterChance))) settings2.idleChatterChance = Math.min(1, Math.max(0, Number(s.idleChatterChance)));
        if (s.dialogues && typeof s.dialogues === "object") settings2.dialogues = s.dialogues;
        settings2.hostLoaded = true;
        layout();
        repositionForAnchor();
        resolveFlip();
        applyOpacity();
        if (isBubbleShown()) refreshBubble();
        saveSettings2(true);
      }).catch(function() {
      });
    }
    function dispose() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = 0;
      }
      pollTimerMs = 0;
    }
    return {
      applyState,
      pollState,
      startPolling,
      setPollInterval,
      loadHostConfig,
      getState: function() {
        return lastState;
      },
      dispose
    };
  }

  // assets/src/voice.js
  function createVoice(getSettings) {
    var manifest = null;
    var manifestPromise = null;
    var current2 = null;
    function loadManifest() {
      if (manifestPromise) return manifestPromise;
      manifestPromise = fetch(PREFIX + "/assets/voice/manifest.json", { cache: "no-store" }).then(function(r) {
        return r.ok ? r.json() : null;
      }).then(function(json) {
        manifest = json && typeof json === "object" ? json : {};
        return manifest;
      }).catch(function() {
        manifest = {};
        return manifest;
      });
      return manifestPromise;
    }
    function play(text) {
      var s = getSettings();
      if (!s || !s.voice || !text) return Promise.resolve(0);
      var lang = s.voiceLang === "ja" ? "ja" : "zh";
      var volume = Math.min(1, Math.max(0, Number(s.voiceVolume === void 0 ? s.volume : s.voiceVolume) || 0));
      if (volume <= 1e-3) return Promise.resolve(0);
      return new Promise(function(resolve) {
        var done = false;
        function finish(ms) {
          if (done) return;
          done = true;
          resolve(Math.max(0, Number(ms) || 0));
        }
        var go = function() {
          if (!manifest) return finish(0);
          var entry = manifest[text];
          if (!entry) return finish(0);
          var file = entry[lang];
          if (!file) return finish(0);
          try {
            if (current2) {
              current2.pause();
              current2 = null;
            }
            var audio = new Audio(PREFIX + "/assets/voice/" + file);
            audio.volume = volume;
            current2 = audio;
            var readDuration = function() {
              if (Number.isFinite(audio.duration) && audio.duration > 0) finish(audio.duration * 1e3);
            };
            audio.addEventListener("loadedmetadata", readDuration);
            audio.addEventListener("error", function() {
              finish(0);
            });
            readDuration();
            audio.play().catch(function() {
            });
            setTimeout(function() {
              finish(0);
            }, 3e3);
          } catch (err) {
            finish(0);
          }
        };
        if (manifest) go();
        else loadManifest().then(go);
      });
    }
    function stop() {
      if (current2) {
        try {
          current2.pause();
        } catch (err) {
        }
        current2 = null;
      }
    }
    function duration(text) {
      var s = getSettings();
      if (!s || !s.voice || !manifest || !text) return 0;
      var lang = s.voiceLang === "ja" ? "ja" : "zh";
      var entry = manifest[text];
      if (!entry) return 0;
      var ms = Number(entry[lang + "Ms"]);
      return Number.isFinite(ms) && ms > 0 ? ms : 0;
    }
    function getState() {
      var s = getSettings();
      return {
        enabled: !!(s && s.voice),
        lang: s && s.voiceLang === "ja" ? "ja" : "zh",
        manifestReady: !!manifest,
        entries: manifest ? Object.keys(manifest).length : 0
      };
    }
    return { play, duration, stop, getState, load: loadManifest };
  }

  // assets/src/main.js
  var configDialogues = dialogues_default;
  function loadDialogueConfig() {
    fetch(PREFIX + "/assets/src/config/dialogues.json", { cache: "no-store" }).then(function(r) {
      return r.ok ? r.json() : null;
    }).then(function(json) {
      if (json && typeof json === "object") configDialogues = json;
    }).catch(function() {
    });
  }
  function startPet(mountContainer) {
    if (window.__dshClosurePet) {
      try {
        if (typeof window.__dshClosurePet.dispose === "function") window.__dshClosurePet.dispose();
      } catch (err) {
      }
      try {
        delete window.__dshClosurePet;
      } catch (err) {
        window.__dshClosurePet = void 0;
      }
    }
    window.__dshClosurePet = { phase: "boot" };
    var host = document.createElement("div");
    host.id = "dsh-closure-pet";
    host.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "z-index:2147482000",
      "pointer-events:none",
      "user-select:none",
      "opacity:0",
      "will-change:transform",
      "transition:opacity .35s ease"
    ].join(";");
    var stage = document.createElement("div");
    stage.id = "dsh-closure-pet-stage";
    host.appendChild(stage);
    var note = document.createElement("div");
    note.style.cssText = 'display:none;font:11px/1.4 ui-sans-serif,system-ui,"Microsoft YaHei",sans-serif;color:#ff8f8f;text-align:center;max-width:280px';
    host.appendChild(note);
    function mount() {
      if (!document.body || document.getElementById("dsh-closure-pet")) return;
      var mountPoint = window.__dshClosurePetMount;
      var parent = mountContainer || mountPoint && mountPoint.container || document.body;
      parent.appendChild(host);
    }
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount, { once: true });
    function fail(text) {
      window.__dshClosurePet.phase = "failed";
      window.__dshClosurePet.error = text;
      note.textContent = text;
      note.style.display = "block";
      host.style.opacity = "1";
      warn(text);
    }
    var pet = {
      current: null,
      segment: null,
      afterOverlay: null,
      think: null,
      interactDuration: 5.933,
      flipped: false,
      pos: null,
      anchor: null
    };
    var player = createVideoPlayer({
      stage,
      baseUrl: PREFIX + "/assets/video/",
      log
    });
    function layout() {
      var cssW = Math.round(CANVAS_W * settings.size);
      var cssH = Math.round(cssW * (FRAME.h / FRAME.w));
      host.style.width = cssW + "px";
      host.style.height = cssH + "px";
      applyPosition();
    }
    var layoutUi = createLayout({ host, canvas: stage, settings, pet });
    var size = layoutUi.size;
    var clampPos = layoutUi.clampPos;
    var applyPosition = layoutUi.applyPosition;
    var setFlipped = layoutUi.setFlipped;
    var applyOpacity = layoutUi.applyOpacity;
    var resolveFlip = layoutUi.resolveFlip;
    var defaultPos = layoutUi.defaultPos;
    var loadPos = layoutUi.loadPos;
    var savePos = layoutUi.savePos;
    var placeFromStorage = layoutUi.placeFromStorage;
    var repositionForAnchor = layoutUi.repositionForAnchor;
    var settle = layoutUi.settle;
    var hitMask = null;
    function hitTest(clientX, clientY) {
      if (!hitMask) hitMask = buildHitMask();
      var rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      var nx = (clientX - rect.left) / rect.width;
      var ny = (clientY - rect.top) / rect.height;
      if (pet.flipped) nx = 1 - nx;
      return maskHit(hitMask, nx, ny);
    }
    var runtime = createRuntime({
      player,
      log,
      idleChatterMs: Number(settings.idleChatterMinutes || 0) * 6e4,
      idleChatterChance: settings.idleChatterChance === void 0 ? 1 : settings.idleChatterChance,
      ensureAudio: function() {
        if (audioEnsure) audioEnsure();
      },
      getDialogues: function() {
        return Object.assign({}, configDialogues, settings.dialogues || {});
      },
      getTypography: function() {
        return { tiers: settings.bubbleTiers !== false };
      },
      showNotice: function(spec) {
        if (spec && spec.segments && spec.segments.length) showBubble(spec.segments);
        else if (spec && spec.text) showBubble(spec.text);
      },
      showDialog: function(text) {
        if (bubbleApi) bubbleApi.dialog(text);
      },
      playSound: function(name) {
        playSound(name);
      },
      playVoice: function(text) {
        return voice ? voice.play(text) : Promise.resolve(0);
      },
      extendBubble: function(ms) {
        if (bubbleApi) bubbleApi.extend(ms);
      }
    });
    function start() {
      host.style.opacity = "1";
      window.__dshClosurePet.phase = "running";
    }
    function stop() {
      player.pause();
    }
    function resumeAnimation() {
      player.resume();
    }
    function dispose() {
      try {
        stop();
      } catch (err) {
      }
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = 0;
      }
      if (resizeTimer) {
        clearTimeout(resizeTimer);
        resizeTimer = 0;
      }
      try {
        if (stateApi) stateApi.dispose();
      } catch (err) {
      }
      try {
        if (dragApi) dragApi.dispose();
      } catch (err) {
      }
      try {
        if (bubbleApi) bubbleApi.dispose();
      } catch (err) {
      }
      try {
        if (stickerApi) stickerApi.dispose();
      } catch (err) {
      }
      try {
        if (panelUi) panelUi.dispose();
      } catch (err) {
      }
      try {
        runtime.dispose();
      } catch (err) {
      }
      try {
        player.dispose();
      } catch (err) {
      }
      try {
        window.removeEventListener("resize", onResize);
      } catch (err) {
      }
      try {
        document.removeEventListener("visibilitychange", onVisibility);
      } catch (err) {
      }
      if (host && host.parentNode) host.parentNode.removeChild(host);
      hitMask = null;
      window.__dshClosurePet.phase = "disposed";
    }
    var panelUi = null;
    function openPanel() {
      if (panelUi) panelUi.open();
    }
    function closePanel() {
      if (panelUi) panelUi.close();
    }
    function panelIsOpen() {
      return panelUi ? panelUi.isOpen() : false;
    }
    function insidePanel(target) {
      return panelUi ? panelUi.contains(target) : false;
    }
    var dragApi = null;
    var resizeTimer = 0;
    function onResize() {
      if (window.__dshClosurePet.phase !== "running") return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        layout();
        repositionForAnchor();
      }, 200);
    }
    window.addEventListener("resize", onResize);
    function onVisibility() {
      if (window.__dshClosurePet.phase !== "running") return;
      if (document.hidden) {
        if (dragApi) dragApi.cancelDrag();
        stop();
        setPollInterval(5e3);
      } else {
        resumeAnimation();
        setPollInterval(1e3);
        pollState();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    function resetPosition() {
      pet.pos = defaultPos();
      pet.anchor = { h: "right", v: "bottom" };
      host.style.transition = "left .22s ease, top .22s ease, opacity .35s ease";
      resolveFlip();
      applyPosition();
      savePos();
    }
    var audio = createAudio(function() {
      return settings;
    });
    var audioEnsure = audio.ensure;
    var loadSounds = audio.loadSounds;
    var playSound = audio.playSound;
    var voice = createVoice(function() {
      return settings;
    });
    voice.load();
    var bubbleApi = null;
    function showBubble(eventText, eventMs) {
      if (bubbleApi) bubbleApi.show(eventText, eventMs);
    }
    function refreshBubble() {
      if (bubbleApi) bubbleApi.refresh();
    }
    function followBubble() {
      if (bubbleApi) bubbleApi.follow();
    }
    function hideBubble() {
      if (bubbleApi) bubbleApi.hide();
    }
    var stickerApi = null;
    function showValleySticker() {
      if (stickerApi) stickerApi.show();
    }
    var stateApi = null;
    function applyState(s) {
      if (stateApi) stateApi.applyState(s);
    }
    function pollState() {
      if (stateApi) stateApi.pollState();
    }
    function startPolling() {
      if (stateApi) stateApi.startPolling();
    }
    function setPollInterval(ms) {
      if (stateApi) stateApi.setPollInterval(ms);
    }
    function loadHostConfig() {
      if (stateApi) stateApi.loadHostConfig();
    }
    var startupTimer = 0;
    var startupPending = null;
    function scheduleStartup(peak, low) {
      startupPending = { peak: !!peak, low: !!low };
      clearTimeout(startupTimer);
      startupTimer = setTimeout(runStartup, STARTUP_DELAY);
    }
    function cancelStartup() {
      if (startupTimer) clearTimeout(startupTimer);
      startupTimer = 0;
      startupPending = null;
    }
    function runStartup() {
      startupTimer = 0;
      var p = startupPending;
      startupPending = null;
      if (!p || !player) return;
      runtime.startupDue(p.peak);
    }
    panelUi = createPanel({
      settings,
      saveSettings,
      resolveFlip,
      layout,
      repositionForAnchor,
      applyOpacity,
      hideBubble,
      refreshBubble,
      audioEnsure,
      loadSounds,
      playSound,
      size,
      pet,
      resetPosition
    });
    bubbleApi = createBubble({
      getState: function() {
        return stateApi ? stateApi.getState() : null;
      },
      pet,
      size,
      settings,
      voiceDuration: function(text) {
        return voice ? voice.duration(text) : 0;
      }
    });
    stickerApi = createSticker({
      getState: function() {
        return stateApi ? stateApi.getState() : null;
      },
      pet,
      size,
      settings
    });
    stateApi = createState({
      runtime,
      refreshBubble,
      playSound,
      scheduleStartup,
      settings,
      saveSettings,
      layout,
      repositionForAnchor,
      resolveFlip,
      applyOpacity,
      isBubbleShown: function() {
        return !!(bubbleApi && bubbleApi.isShown());
      }
    });
    dragApi = createDrag({
      hitTest,
      pet,
      host,
      clampPos,
      applyPosition,
      settle,
      refreshBubble,
      followBubble,
      playSegment: function() {
        runtime.click();
      },
      showBubble,
      showValleySticker,
      openPanel,
      closePanel,
      panelIsOpen,
      insidePanel
    });
    function boot() {
      try {
        layout();
        hitMask = buildHitMask();
        placeFromStorage();
        applyOpacity();
        runtime.setConditions({ low: false, work: "idle" });
        start();
        startPolling();
        loadHostConfig();
        loadDialogueConfig();
        loadSounds();
        log("\u542F\u52A8\u5B8C\u6210", ANIMATION_NAMES.length, "animations \xB7 size", settings.size, "\xB7 mirror", settings.mirror);
        window.__dshClosurePet = {
          phase: "running",
          animations: ANIMATION_NAMES,
          play: function(name, loop) {
            runtime.fire(name);
          },
          segments: function() {
            return [];
          },
          openPanel,
          closePanel,
          get settings() {
            return { mirror: settings.mirror, size: settings.size, bubble: settings.bubble, bubbleScale: settings.bubbleScale, bubbleTiers: settings.bubbleTiers, snapStrength: settings.snapStrength, opacity: settings.opacity, sound: settings.sound, volume: settings.volume, lowThreshold: settings.lowThreshold, idleChatterMinutes: settings.idleChatterMinutes, idleChatterChance: settings.idleChatterChance, dialogues: settings.dialogues || {} };
          },
          setSettings: function(patch, persist) {
            if (patch) {
              if (patch.mirror) settings.mirror = patch.mirror;
              if (patch.size) settings.size = Number(patch.size);
              if (typeof patch.bubble === "boolean") settings.bubble = patch.bubble;
              if (patch.bubbleScale !== void 0) {
                var bs = Number(patch.bubbleScale);
                settings.bubbleScale = isFinite(bs) ? Math.min(BUBBLE_SCALE_MAX, Math.max(BUBBLE_SCALE_MIN, bs)) : 100;
              }
              if (typeof patch.bubbleTiers === "boolean") settings.bubbleTiers = patch.bubbleTiers;
              if (patch.snapStrength !== void 0) {
                var ss = Number(patch.snapStrength);
                settings.snapStrength = isFinite(ss) ? Math.min(SNAP_STRENGTH_MAX, Math.max(SNAP_STRENGTH_MIN, ss)) : SNAP_STRENGTH_MAX;
              }
              if (patch.opacity) settings.opacity = Number(patch.opacity);
              if (typeof patch.sound === "boolean") settings.sound = patch.sound;
              if (patch.volume !== void 0) settings.volume = Number(patch.volume);
              if (typeof patch.voice === "boolean") settings.voice = patch.voice;
              if (patch.voiceLang === "zh" || patch.voiceLang === "ja") settings.voiceLang = patch.voiceLang;
              if (patch.voiceVolume !== void 0) settings.voiceVolume = Math.min(1, Math.max(0, Number(patch.voiceVolume)));
              if (patch.lowThreshold !== void 0) settings.lowThreshold = Math.max(0, Number(patch.lowThreshold));
              if (patch.idleChatterMinutes !== void 0) settings.idleChatterMinutes = Math.max(0, Number(patch.idleChatterMinutes));
              if (patch.idleChatterChance !== void 0) settings.idleChatterChance = Math.min(1, Math.max(0, Number(patch.idleChatterChance)));
              if (patch.idleChatterMinutes !== void 0 || patch.idleChatterChance !== void 0) {
                runtime.setIdleChatterConfig(settings.idleChatterMinutes, settings.idleChatterChance);
              }
              if (patch.dialogues && typeof patch.dialogues === "object") settings.dialogues = patch.dialogues;
            }
            saveSettings(persist !== false);
            layout();
            repositionForAnchor();
            resolveFlip();
            applyOpacity();
            if (bubbleApi && bubbleApi.isShown()) refreshBubble();
            if (!settings.bubble) hideBubble();
          },
          resetPosition,
          hitTest,
          applyState,
          // 调试用：手动灌一份 /state 数据
          showBubble,
          showValleySticker,
          hideBubble,
          get layers() {
            return runtime.layers;
          },
          get sounds() {
            return audio.getState();
          },
          get voice() {
            return voice.getState();
          },
          playSound,
          runStartup,
          cancelStartup,
          get startup() {
            return { pending: !!startupPending, delay: STARTUP_DELAY };
          },
          get trackTime() {
            return player.currentTime();
          },
          get animation() {
            return player.current();
          },
          get segmentInfo() {
            return null;
          },
          get position() {
            return pet.pos && { x: pet.pos.x, y: pet.pos.y, flipped: pet.flipped };
          },
          get debug() {
            return {
              mode: "video",
              dpr: Math.min(window.devicePixelRatio || 1, 2),
              cssW: host.offsetWidth,
              cssH: host.offsetHeight,
              current: player.current(),
              paused: player.isPaused(),
              hitMask: { w: HIT_MASK_W, h: HIT_MASK_H, ready: !!hitMask, grow: HIT_GROW, forms: HIT_FORMS.length },
              settings: { mirror: settings.mirror, size: settings.size },
              clips: Object.keys(CLIPS).length
            };
          },
          dispose,
          resume: function() {
            resumeAnimation();
          },
          get lastState() {
            return stateApi ? stateApi.getState() : null;
          }
        };
      } catch (err) {
        fail("\u684C\u5BA0\u52A0\u8F7D\u5931\u8D25\uFF1A" + String(err && err.message || err));
      }
    }
    boot();
    return dispose;
    function playSegment2(name) {
      runtime.fire(name);
    }
  }

  // assets/src/ui/settings-page.js
  var STATE_GROUPS = [
    ["idle", "Idle \u95F2\u65F6"],
    ["sadIdle", "Sad_Idle \u95F2\u65F6"],
    ["thinkIdle", "Think_Idle \u95F2\u65F6"]
  ];
  var EVENT_GROUPS = [
    ["credited", "\u5230\u8D26"],
    ["peakTime", "\u5CF0\u65F6"],
    ["valleyTime", "\u8C37\u65F6"],
    ["lowBalance", "\u4F59\u989D\u4E0D\u8DB3"],
    ["turnInterrupted", "\u5BF9\u8BDD\u4E2D\u65AD"],
    ["error", "\u51FA\u9519"],
    ["toolSuccess", "\u5DE5\u5177\u6210\u529F"],
    ["turnEnd", "\u672C\u8F6E\u7ED3\u675F"]
  ];
  var INTERACT_GROUPS = [
    ["interact", "\u901A\u7528\u6C60"],
    ["interactIdle", "Idle \u95F2\u65F6"],
    ["interactSadIdle", "Sad_Idle \u95F2\u65F6"],
    ["interactThinkIdle", "Think_Idle \u95F2\u65F6"]
  ];
  function makeSettingsSection(React) {
    const h = React.createElement;
    function Field(props) {
      return h(
        "label",
        { style: { display: "flex", alignItems: "center", gap: 12, margin: "10px 0" } },
        h("span", { style: { width: 150, color: "var(--dsh-text-2, #666)" } }, props.label),
        h("input", {
          type: "number",
          value: props.value,
          min: props.min,
          step: props.step || 1,
          onChange: (e) => props.onChange(Number(e.target.value)),
          style: { width: 140, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--dsh-border, #ccc)", background: "transparent", color: "inherit" }
        }),
        props.hint ? h("span", { style: { fontSize: 12, opacity: 0.65 } }, props.hint) : null
      );
    }
    function ListEditor(props) {
      const list = Array.isArray(props.value) ? props.value : [];
      const update = (next) => props.onChange(next);
      return h(
        "div",
        { style: { margin: "14px 0 18px" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 } },
          h("strong", null, props.title),
          h("button", {
            type: "button",
            onClick: () => update(list.concat("")),
            style: { border: "1px solid var(--dsh-border, #bbb)", background: "transparent", color: "inherit", borderRadius: 6, cursor: "pointer", padding: "2px 8px" }
          }, "+")
        ),
        list.length === 0 ? h("div", { style: { fontSize: 12, opacity: 0.6 } }, "\u7A7A\uFF0C\u4E0D\u663E\u793A\u901A\u77E5") : null,
        list.map((text, i) => h(
          "div",
          { key: i, style: { display: "flex", gap: 6, marginBottom: 4 } },
          h("input", {
            value: text,
            placeholder: "\u8F93\u5165\u4E00\u6761\u5BF9\u8BDD",
            onChange: (e) => {
              const next = list.slice();
              next[i] = e.target.value;
              update(next);
            },
            style: { flex: 1, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--dsh-border, #ccc)", background: "transparent", color: "inherit" }
          }),
          h("button", {
            type: "button",
            onClick: () => update(list.filter((_, j) => j !== i)),
            style: { border: "1px solid var(--dsh-border, #bbb)", background: "transparent", color: "inherit", borderRadius: 6, cursor: "pointer", padding: "2px 8px" }
          }, "\u2212")
        ))
      );
    }
    return function SettingsSection({ close }) {
      const api = window.__dshClosurePet;
      const [settings2, setSettings] = React.useState(function() {
        const base = api && api.settings ? api.settings : {};
        return Object.assign({}, SETTINGS_DEFAULTS, base, {
          dialogues: Object.assign({}, dialogues_default, base.dialogues || {})
        });
      });
      if (React.useEffect) {
        React.useEffect(function() {
          let alive = true;
          Promise.all([
            fetch(PREFIX + "/config", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
            fetch(PREFIX + "/assets/src/config/dialogues.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null)
          ]).then(([cfg, file]) => {
            if (!alive) return;
            const host = cfg && cfg.settings || {};
            const dialogues = Object.assign({}, dialogues_default, file || {}, host.dialogues || {});
            setSettings(Object.assign({}, SETTINGS_DEFAULTS, host, {
              dialogues
            }));
          });
          return function() {
            alive = false;
          };
        }, []);
      }
      function patch(next) {
        setSettings(Object.assign({}, settings2, next));
        if (api && api.setSettings) {
          api.setSettings(next, false);
        }
        fetch(PREFIX + "/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: next })
        }).catch(function() {
        });
      }
      function patchDialogue(key, value) {
        const dialogues = Object.assign({}, settings2.dialogues || {});
        dialogues[key] = value;
        patch({ dialogues });
      }
      if (!api) {
        return h("div", { style: { padding: 24, opacity: 0.7 } }, "\u684C\u5BA0\u8FD8\u5728\u542F\u52A8\uFF0C\u8BF7\u7A0D\u540E\u518D\u6253\u5F00\u8BBE\u7F6E\u3002");
      }
      return h(
        "div",
        { style: { padding: "8px 4px 32px", maxWidth: 720 } },
        h("h2", { style: { margin: "0 0 4px", fontSize: 20 } }, "\u53EF\u9732\u5E0C\u5C14\u684C\u5BA0"),
        h("p", { style: { margin: "0 0 18px", opacity: 0.65, fontSize: 13 } }, "\u4F4E\u9891\u914D\u7F6E\u3002\u5927\u5C0F\u3001\u900F\u660E\u5EA6\u3001\u6C14\u6CE1\u6837\u5F0F\u4ECD\u5728\u53F3\u952E\u9762\u677F\u91CC\u3002"),
        h(Field, {
          label: "\u4F59\u989D\u4E0D\u8DB3\u9608\u503C",
          value: settings2.lowThreshold === void 0 ? SETTINGS_DEFAULTS.lowThreshold : settings2.lowThreshold,
          min: 0,
          step: 1,
          onChange: (v) => patch({ lowThreshold: v }),
          hint: "\u5143"
        }),
        h(Field, {
          label: "\u95F2\u65F6\u5BF9\u8BDD\u95F4\u9694",
          value: settings2.idleChatterMinutes === void 0 ? SETTINGS_DEFAULTS.idleChatterMinutes : settings2.idleChatterMinutes,
          min: 0,
          step: 1,
          onChange: (v) => patch({ idleChatterMinutes: v }),
          hint: "\u5206\u949F\uFF1B0 = \u5173\u95ED"
        }),
        h(Field, {
          label: "\u95F2\u65F6\u5BF9\u8BDD\u89E6\u53D1\u6982\u7387",
          value: Math.round((settings2.idleChatterChance === void 0 ? SETTINGS_DEFAULTS.idleChatterChance : settings2.idleChatterChance) * 100),
          min: 0,
          step: 5,
          onChange: (v) => patch({ idleChatterChance: Math.min(1, Math.max(0, v / 100)) }),
          hint: "%"
        }),
        h("h3", { style: { margin: "26px 0 4px", fontSize: 16 } }, "\u95F2\u65F6\u5BF9\u8BDD\u6C60"),
        STATE_GROUPS.map(([key, title]) => h(ListEditor, {
          key,
          title,
          value: settings2.dialogues && settings2.dialogues[key] || [],
          onChange: (v) => patchDialogue(key, v)
        })),
        h("h3", { style: { margin: "26px 0 4px", fontSize: 16 } }, "\u70B9\u51FB\u4EA4\u4E92\u5BF9\u8BDD\u6C60"),
        h("p", { style: { margin: "0 0 8px", opacity: 0.62, fontSize: 12 } }, "\u6BCF\u6B21\u70B9\u51FB\u4ECE\u300C\u901A\u7528\u6C60 + \u5F53\u524D\u72B6\u6001\u6C60\u300D\u4E2D\u62BD\u53D6\uFF1B\u4E09\u79CD\u72B6\u6001\u5404\u6709\u4E00\u4EFD\u72EC\u7ACB\u7684\u95F2\u65F6\u5BF9\u8BDD\u6C60\u3002"),
        INTERACT_GROUPS.map(([key, title]) => h(ListEditor, {
          key,
          title,
          value: settings2.dialogues && settings2.dialogues[key] || [],
          onChange: (v) => patchDialogue(key, v)
        })),
        h("h3", { style: { margin: "26px 0 4px", fontSize: 16 } }, "\u7279\u6B8A\u4E8B\u4EF6\u5BF9\u8BDD\u6C60"),
        EVENT_GROUPS.map(([key, title]) => h(ListEditor, {
          key,
          title,
          value: settings2.dialogues && settings2.dialogues[key] || [],
          onChange: (v) => patchDialogue(key, v)
        })),
        h(
          "div",
          { style: { marginTop: 24 } },
          h("button", {
            type: "button",
            onClick: close,
            style: { padding: "8px 16px", borderRadius: 8, border: "1px solid var(--dsh-border, #bbb)", background: "transparent", color: "inherit", cursor: "pointer" }
          }, "\u5173\u95ED")
        )
      );
    };
  }

  // assets/src/client-entry.js
  function makeFactory() {
    return function factory(require2) {
      var React = require2("react");
      var current2 = null;
      function PetLayer() {
        var ref = React.useRef(null);
        React.useEffect(function() {
          var node = ref.current;
          if (!node) return;
          var mountEl = document.createElement("div");
          mountEl.id = "dsh-closure-pet-mount";
          mountEl.style.cssText = "display:contents";
          node.appendChild(mountEl);
          current2 = startPet(mountEl);
          return function() {
            var dispose = current2;
            current2 = null;
            if (typeof dispose === "function") {
              try {
                dispose();
              } catch (err) {
              }
            }
            if (mountEl.parentNode) mountEl.parentNode.removeChild(mountEl);
          };
        }, []);
        return React.createElement("div", {
          ref,
          style: { position: "fixed", left: 0, top: 0, width: 0, height: 0, overflow: "visible", pointerEvents: "none" }
        });
      }
      const SettingsSection = makeSettingsSection(React);
      return {
        inject: ["slots"],
        apply(ctx) {
          ctx.slots.inject("shell.overlay", function() {
            return ctx.slots.register({
              name: "shell.overlay",
              id: "dsh-closure-pet",
              order: 100
            }, PetLayer);
          });
          ctx.slots.inject("settings.section", function() {
            return ctx.slots.register({
              name: "settings.section",
              id: "dsh-closure-pet",
              order: 50,
              label: "\u53EF\u9732\u5E0C\u5C14\u684C\u5BA0"
            }, SettingsSection);
          });
        }
      };
    };
  }
  window.__ModuleLoader__.load({
    id: "dsh-closure-pet",
    factory: makeFactory()
  });
})();
