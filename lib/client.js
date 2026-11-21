(() => {
  // assets/src/shared/protocol.js
  var URL_PREFIX = "/dsh-closure";
  var STATE_PATH = URL_PREFIX + "/state";
  var CONFIG_PATH = URL_PREFIX + "/config";
  var HARDWARE_PATH = URL_PREFIX + "/hardware";
  var SIZE_MIN = 0.6;
  var SIZE_MAX = 2;
  var OPACITY_MIN = 0.3;
  var BUBBLE_SCALE_MIN = 50;
  var BUBBLE_SCALE_MAX = 200;
  var BUBBLE_SCALE_BASE = 100;
  var SNAP_STRENGTH_MIN = 0;
  var SNAP_STRENGTH_MAX = 200;
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
    // 硬件状态挂牌（CPU / 内存 / GPU 实时读数）：默认关，右键面板里开
    plate: false
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
    if (typeof raw.plate === "boolean") out.plate = raw.plate;
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
  var INTERACT_SPLIT = 2.1;
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
        plate: settings.plate
      }));
    } catch (err) {
    }
    clearTimeout(saveTimer);
    var push = function() {
      try {
        fetch(PREFIX + "/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings })
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
  var THINK_CHANCE = 0.5;
  var THINK_ROLL_MS = 1e4;
  var HAPPY_CHANCE = 0.25;
  var SAD_ENTRY = "Sad_Begin";
  var INTERACT_ACTIONS = ["Interact_B"];
  var CLIPS = {
    Idle: { src: "idle.webm", duration: 1.467, loop: true },
    Sad_Idle: { src: "sad_idle.webm", duration: 2.133, loop: true },
    Happy: { src: "happy.webm", duration: 2.833 },
    Sad_Begin: { src: "sad_begin.webm", duration: 2.567 },
    Special_A: { src: "special_a.webm", duration: 2 },
    Special_B: { src: "special_b.webm", duration: 2.667 },
    Talk: { src: "talk.webm", duration: 5 },
    Interact_A: { src: "interact_a.webm", duration: 2.1 },
    Interact_B: { src: "interact_b.webm", duration: 3.833 }
  };
  var ANIMATION_NAMES = [
    "Idle",
    "Sad_Idle",
    "Happy",
    "Sad_Begin",
    "Special_A",
    "Special_B",
    "Talk",
    "Interact"
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
      var plateRow = row("\u786C\u4EF6\u6302\u724C");
      var plateBtn = document.createElement("button");
      plateBtn.style.cssText = "padding:3px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#dfe4f0;font:inherit;cursor:pointer";
      function syncPlateBtn() {
        plateBtn.textContent = settings2.plate ? "\u5F00" : "\u5173";
        plateBtn.style.background = settings2.plate ? "rgba(125,134,255,.85)" : "rgba(255,255,255,.06)";
        plateBtn.style.color = settings2.plate ? "#fff" : "#dfe4f0";
      }
      plateBtn.addEventListener("click", function() {
        settings2.plate = !settings2.plate;
        syncPlateBtn();
        saveSettings2(true);
        if (deps.applyPlate) deps.applyPlate();
      });
      syncPlateBtn();
      plateRow.appendChild(plateBtn);
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
        syncPlateBtn,
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
        panelApi.syncPlateBtn();
        panelApi.syncMirrorButtons();
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
    var bubbleEventUntil = 0;
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
      if (bubbleEventText && Date.now() < bubbleEventUntil) {
        return [{ text: bubbleEventText, size: BUBBLE_SIZE }];
      }
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
    function showBubble(eventText, eventMs) {
      if (!settings2.bubble) return;
      ensureFont();
      var wasVisible = bubbleShown;
      if (eventText) {
        bubbleEventText = eventText;
        bubbleEventUntil = Date.now() + (eventMs || 3600);
        bubbleMode = "event";
      } else {
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
    return { show: showBubble, refresh: refreshBubble, follow: followBubble, hide: hideBubble, dispose, isShown: function() {
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

  // assets/src/ui/plate-format.js
  var PLATE_MAX_ROW_WIDTH = 430;
  var PLATE_LINE_HEIGHT = 22;
  var PLATE_PADDING_Y = 4;
  var PLATE_PADDING_X = 10;
  var PLATE_GROUP_GAP = 12;
  var PLATE_SEGMENT_GAP = 5;
  var PLATE_DOT_SIZE = 5;
  var PLATE_FONT_SIZE = 11.3;
  var LEVEL_WARN = 75;
  var LEVEL_ERROR = 90;
  var PLATE_PALETTE = {
    light: {
      surface: "rgba(255,255,255,.88)",
      border: "rgba(15,17,21,.14)",
      shadow: "0 4px 14px rgba(15,17,21,.16)",
      colors: {
        ok: { text: "#1E2A38", dot: "#2F7DD1" },
        warn: { text: "#9A5B00", dot: "#D98324" },
        error: { text: "#B42318", dot: "#E5484D" },
        idle: { text: "#68727F", dot: "#9AA4B2" }
      }
    },
    dark: {
      surface: "rgba(15,19,26,.86)",
      border: "rgba(255,255,255,.14)",
      shadow: "0 4px 14px rgba(0,0,0,.45)",
      colors: {
        ok: { text: "#E9F1FA", dot: "#63C8FF" },
        warn: { text: "#FFD07A", dot: "#FFC65C" },
        error: { text: "#FF9B9B", dot: "#FF7A7A" },
        idle: { text: "#96A2B0", dot: "#5C6875" }
      }
    }
  };
  function normalizeScheme(raw) {
    const s = String(raw === null || raw === void 0 ? "" : raw).toLowerCase();
    if (s.includes("dark")) return "dark";
    return "light";
  }
  function pickPalette(scheme) {
    return PLATE_PALETTE[normalizeScheme(scheme)];
  }
  function levelOf(percent) {
    if (percent === null || percent === void 0) return "idle";
    const v = Number(percent);
    if (!Number.isFinite(v)) return "idle";
    if (v >= LEVEL_ERROR) return "error";
    if (v >= LEVEL_WARN) return "warn";
    return "ok";
  }
  function formatPercent(percent) {
    if (percent === null || percent === void 0) return "--";
    const v = Number(percent);
    if (!Number.isFinite(v)) return "--";
    return Math.round(v) + "%";
  }
  function formatGigabytes(bytes) {
    if (bytes === null || bytes === void 0) return "--";
    const v = Number(bytes);
    if (!Number.isFinite(v) || v < 0) return "--";
    return (v / (1024 * 1024 * 1024)).toFixed(1) + "G";
  }
  function formatGpuLine(gpu) {
    const g = gpu || {};
    const index = Number.isFinite(Number(g.index)) ? Number(g.index) : 0;
    const parts = ["GPU" + index, formatPercent(g.usage)];
    const used = formatGigabytes(g.memUsed);
    const total = formatGigabytes(g.memTotal);
    if (used !== "--" && total !== "--") parts.push(used.replace(/G$/, "") + "/" + total);
    if (Number.isFinite(Number(g.temp)) && g.temp !== null && g.temp !== void 0) {
      parts.push(Math.round(Number(g.temp)) + "\xB0C");
    }
    return parts.join(" ");
  }
  function buildSegments(sample) {
    const s = sample || {};
    const segs = [{ key: "cpu", text: "CPU " + formatPercent(s.cpu), level: levelOf(s.cpu) }];
    const gpus = Array.isArray(s.gpus) ? s.gpus : [];
    for (let i = 0; i < gpus.length; i++) {
      const g = gpus[i] || {};
      const index = Number.isFinite(Number(g.index)) ? Number(g.index) : i;
      segs.push({ key: "gpu" + index, text: formatGpuLine(g), level: levelOf(g.usage) });
    }
    const memPercent = s.mem && s.mem.percent !== void 0 ? s.mem.percent : null;
    segs.push({ key: "mem", text: "\u5185\u5B58 " + formatPercent(memPercent), level: levelOf(memPercent) });
    return segs;
  }

  // assets/src/ui/plate.js
  var POLL_MS = 2e3;
  function currentScheme() {
    try {
      var inline = document.documentElement.style && document.documentElement.style.colorScheme;
      if (inline) return normalizeScheme(inline);
    } catch (err) {
    }
    try {
      var computed = window.getComputedStyle(document.documentElement).colorScheme;
      if (computed) return normalizeScheme(computed);
    } catch (err) {
    }
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    } catch (err) {
    }
    return "light";
  }
  function createPlate(deps) {
    var settings2 = deps.settings;
    var pet = deps.pet;
    var size = deps.size;
    var el = null;
    var rowEl = null;
    var segNodes = {};
    var timer = 0;
    var running = false;
    var inflight = false;
    var lastSample = null;
    var lastSampleAt = 0;
    var lastError = null;
    var lastPos = null;
    var theme = currentScheme();
    var palette = pickPalette(theme);
    var mediaQuery = null;
    var attrObserver = null;
    function createSeg() {
      var wrap = document.createElement("span");
      wrap.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "gap:" + PLATE_SEGMENT_GAP + "px",
        "white-space:nowrap"
      ].join(";");
      var dot = document.createElement("span");
      dot.style.cssText = [
        "display:inline-block",
        "width:" + PLATE_DOT_SIZE + "px",
        "height:" + PLATE_DOT_SIZE + "px",
        "border-radius:50%",
        "flex:0 0 auto",
        "background:" + palette.colors.idle.dot
      ].join(";");
      var text = document.createElement("span");
      text.style.cssText = "color:" + palette.colors.idle.text + ";white-space:nowrap";
      wrap.appendChild(dot);
      wrap.appendChild(text);
      return { wrap, dot, text };
    }
    function ensure() {
      if (el) return;
      el = document.createElement("div");
      el.id = "dsh-closure-pet-plate";
      el.setAttribute("data-cl-pet-plate", "");
      el.setAttribute("data-cl-pet-plate-scheme", theme);
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        "display:none",
        "z-index:2147481998",
        // 低于气泡(2147481999)、高于皮肤 .cl-scene
        "pointer-events:none",
        "user-select:none",
        // fixed + 只给 left 时宽度是 shrink-to-fit，会被右侧剩余空间压成多行 → 明确按内容撑开
        "width:max-content",
        "max-width:" + PLATE_MAX_ROW_WIDTH + "px",
        "padding:" + PLATE_PADDING_Y + "px " + PLATE_PADDING_X + "px",
        "border-radius:8px",
        "font-size:" + PLATE_FONT_SIZE + "px",
        "line-height:" + PLATE_LINE_HEIGHT + "px",
        // 字体族故意不写：继承宿主 / 皮肤设置
        "font-variant-numeric:tabular-nums",
        "letter-spacing:.02em",
        "backdrop-filter:blur(6px)",
        "transition:opacity .18s ease, background-color .18s ease, border-color .18s ease",
        "opacity:0"
      ].join(";");
      rowEl = document.createElement("div");
      rowEl.style.cssText = [
        "display:flex",
        "flex-wrap:wrap",
        "align-items:center",
        "column-gap:" + PLATE_GROUP_GAP + "px",
        "row-gap:0px"
      ].join(";");
      el.appendChild(rowEl);
      document.body.appendChild(el);
      applyPalette();
      render(null);
    }
    function applyPalette() {
      if (!el) return;
      el.setAttribute("data-cl-pet-plate-scheme", theme);
      el.style.background = palette.surface;
      el.style.border = "1px solid " + palette.border;
      el.style.boxShadow = palette.shadow;
    }
    function syncTheme() {
      var next = currentScheme();
      if (next === theme) return;
      theme = next;
      palette = pickPalette(theme);
      applyPalette();
      render(lastSample);
    }
    function render(sample) {
      if (!el) return;
      var segs = buildSegments(sample);
      var seen = {};
      for (var i = 0; i < segs.length; i++) {
        var seg = segs[i];
        seen[seg.key] = true;
        var node = segNodes[seg.key];
        if (!node) {
          node = createSeg();
          segNodes[seg.key] = node;
          rowEl.appendChild(node.wrap);
        }
        if (rowEl.childNodes[i] !== node.wrap) rowEl.insertBefore(node.wrap, rowEl.childNodes[i] || null);
        var color = palette.colors[seg.level] || palette.colors.idle;
        node.dot.style.background = color.dot;
        node.text.style.color = color.text;
        node.text.textContent = seg.text;
      }
      Object.keys(segNodes).forEach(function(key) {
        if (seen[key]) return;
        var stale = segNodes[key];
        if (stale.wrap.parentNode) stale.wrap.parentNode.removeChild(stale.wrap);
        delete segNodes[key];
      });
      position();
    }
    function position() {
      if (!el || !pet.pos || !size) return;
      var s = size();
      var w = el.offsetWidth || 0;
      var h = el.offsetHeight || 0;
      if (!w || !h) return;
      var left = pet.pos.x + s.w / 2 - w / 2;
      var top = pet.pos.y - h - 8;
      if (top < 8) top = pet.pos.y + s.h + 8;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
      var next = { left: Math.round(left), top: Math.round(top) };
      if (lastPos && lastPos.left === next.left && lastPos.top === next.top) return;
      lastPos = next;
      el.style.left = next.left + "px";
      el.style.top = next.top + "px";
    }
    function shouldPoll() {
      if (settings2.plate !== true) return false;
      if (!running) return false;
      if (document.hidden) return false;
      try {
        if (document.documentElement.hasAttribute("data-dsh-idle-crt")) return false;
      } catch (err) {
      }
      return true;
    }
    function show() {
      ensure();
      syncTheme();
      if (el.style.display !== "block") {
        el.style.display = "block";
        lastPos = null;
      }
      position();
      requestAnimationFrame(function() {
        if (el) el.style.opacity = "1";
      });
    }
    function hide() {
      if (!el) return;
      el.style.opacity = "0";
      el.style.display = "none";
      lastPos = null;
    }
    function stopTimer() {
      if (!timer) return;
      clearInterval(timer);
      timer = 0;
    }
    async function poll() {
      if (!shouldPoll()) {
        sync();
        return;
      }
      syncTheme();
      if (!shouldPoll()) {
        sync();
        return;
      }
      if (inflight) return;
      inflight = true;
      try {
        var res = await fetch(HARDWARE_PATH, { cache: "no-store" });
        if (!res || !res.ok) throw new Error("HTTP " + (res && res.status || 0));
        var data = await res.json();
        if (!data || data.ok !== true) throw new Error("bad payload");
        lastSample = data;
        lastSampleAt = Date.now();
        lastError = null;
        render(data);
      } catch (err) {
        lastError = String(err && err.message || err);
      } finally {
        inflight = false;
      }
    }
    function sync() {
      if (!shouldPoll()) {
        stopTimer();
        hide();
        return;
      }
      show();
      if (!timer) {
        timer = setInterval(poll, POLL_MS);
        poll();
      }
    }
    function onMediaChange() {
      syncTheme();
    }
    function onAttrChange() {
      syncTheme();
    }
    function watchTheme() {
      if (mediaQuery) return;
      try {
        if (window.matchMedia) {
          mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
          if (mediaQuery.addEventListener) mediaQuery.addEventListener("change", onMediaChange);
          else if (mediaQuery.addListener) mediaQuery.addListener(onMediaChange);
        }
      } catch (err) {
        mediaQuery = null;
      }
      try {
        attrObserver = new MutationObserver(onAttrChange);
        attrObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme", "data-ds-theme-source"] });
      } catch (err) {
        attrObserver = null;
      }
    }
    function unwatchTheme() {
      try {
        if (mediaQuery) {
          if (mediaQuery.removeEventListener) mediaQuery.removeEventListener("change", onMediaChange);
          else if (mediaQuery.removeListener) mediaQuery.removeListener(onMediaChange);
        }
      } catch (err) {
      }
      mediaQuery = null;
      try {
        if (attrObserver) attrObserver.disconnect();
      } catch (err) {
      }
      attrObserver = null;
    }
    function start() {
      running = true;
      watchTheme();
      syncTheme();
      sync();
    }
    function pause() {
      running = false;
      stopTimer();
      hide();
    }
    function resume() {
      running = true;
      watchTheme();
      syncTheme();
      sync();
    }
    function follow() {
      if (el && el.style.display === "block") position();
    }
    function applySettings() {
      if (!settings2.plate) {
        stopTimer();
        hide();
        return;
      }
      if (running) sync();
    }
    function dispose() {
      stopTimer();
      unwatchTheme();
      running = false;
      if (el && el.parentNode) el.parentNode.removeChild(el);
      el = null;
      rowEl = null;
      segNodes = {};
      lastPos = null;
      lastSample = null;
    }
    function debug() {
      return {
        active: !!(el && el.style.display === "block"),
        enabled: settings2.plate === true,
        running,
        theme,
        schemeAttr: el ? el.getAttribute("data-cl-pet-plate-scheme") : null,
        lastSampleAt,
        lastError,
        sample: lastSample
      };
    }
    return {
      start,
      pause,
      resume,
      follow,
      applySettings,
      dispose,
      debug,
      getSample: function() {
        return lastSample;
      },
      getTheme: function() {
        return theme;
      }
    };
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
        showBubble();
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

  // assets/src/anim/director.js
  function createDirector(deps) {
    var pet = deps.pet;
    var player = deps.player;
    var log2 = deps.log;
    var getAudioEnsure = deps.getAudioEnsure || function() {
      return deps.audioEnsure;
    };
    var getPlaySound = deps.getPlaySound || function() {
      return deps.playSound;
    };
    var layers = { base: "Idle", work: null, overlay: null };
    var talkLock = false;
    var pendingOverlay = null;
    var thinkToken = 0;
    var thinkTimer = 0;
    var pendingFade = null;
    var suppressedTalk = false;
    function desiredName() {
      if (suppressedTalk && layers.work === "Talk") return layers.overlay || layers.base;
      return layers.overlay || layers.work || layers.base;
    }
    function stopThinking() {
      thinkToken++;
      if (thinkTimer) {
        clearTimeout(thinkTimer);
        thinkTimer = 0;
      }
      pet.think = null;
    }
    function playLoop(name, force) {
      if (!player) return;
      if (pet.current === name && !force) return;
      if (name !== "Talk") {
        talkLock = false;
        pendingOverlay = null;
      }
      stopThinking();
      pet.enteringSad = false;
      pet.afterOverlay = null;
      pet.current = name;
      pet.segment = null;
      var fade = pendingFade === null ? 0 : pendingFade;
      pendingFade = null;
      player.play(name, { fade });
    }
    function startAnimation(name) {
      if (name !== "Special_B") stopThinking();
      if (name === "Talk") return playTalkOnce();
      if (name === "Special_B") return startThinking();
      return playLoop(name, true);
    }
    function startThinking() {
      if (!player) return;
      stopThinking();
      pet.enteringSad = false;
      var token = thinkToken;
      layers.overlay = null;
      pet.segment = null;
      pet.interactDuration = pet.interactDuration || 5.933;
      pet.think = { mode: "idle" };
      var firstRoll = true;
      function alive() {
        return token === thinkToken && layers.work === "Special_B";
      }
      function backToBase() {
        pet.think.mode = "idle";
        if (layers.base === "Sad_Idle" && pet.current !== "Sad_Idle" && pet.current !== SAD_ENTRY) {
          playSadEntry(0, true);
          return;
        }
        pet.current = layers.base;
        player.play(layers.base, { fade: 0 });
      }
      function schedule() {
        if (thinkTimer) clearTimeout(thinkTimer);
        thinkTimer = setTimeout(function() {
          thinkTimer = 0;
          if (!alive()) return;
          roll();
        }, THINK_ROLL_MS);
      }
      function roll() {
        if (!alive() || pet.think.mode !== "idle") return;
        if (pet.enteringSad) {
          schedule();
          return;
        }
        var hit = firstRoll || Math.random() < THINK_CHANCE;
        firstRoll = false;
        if (!hit) {
          log2("think skip");
          backToBase();
          schedule();
          return;
        }
        pet.think.mode = "full";
        pet.current = "Special_B";
        player.play("Special_B", {
          fade: 0,
          onEnded: function() {
            if (!alive()) return;
            backToBase();
            schedule();
          },
          onError: function() {
            if (!alive()) return;
            backToBase();
            schedule();
          }
        });
        log2("think play", "Special_B");
      }
      roll();
    }
    function syncAnimation(force) {
      if (!player) return;
      if (deps.getStartupHold()) return;
      if (suppressedTalk && layers.work !== "Talk") suppressedTalk = false;
      var want = desiredName();
      if (pet.enteringSad) {
        var thinkingIdle = layers.work === "Special_B" && pet.think && pet.think.mode === "idle";
        if (want === "Sad_Idle" || thinkingIdle && want === "Special_B") return;
        pet.enteringSad = false;
      }
      if (talkLock && want !== "Talk") return;
      if (want === "Sad_Idle" && pet.current !== "Sad_Idle" && pet.current !== SAD_ENTRY) {
        var fade = pendingFade === null ? 0 : pendingFade;
        pendingFade = null;
        playSadEntry(fade);
        return;
      }
      if (want === "Special_B" && pet.think) return;
      if (want !== "Special_B") stopThinking();
      if (!force && pet.current === want) return;
      startAnimation(want);
    }
    function playSadEntry(fade, keepThinking) {
      if (!player) return;
      if (!keepThinking) stopThinking();
      pet.enteringSad = true;
      pet.afterOverlay = null;
      pet.current = SAD_ENTRY;
      pet.segment = null;
      function finish() {
        if (!pet.enteringSad) return;
        pet.enteringSad = false;
        var thinkingIdle = layers.work === "Special_B" && pet.think && pet.think.mode === "idle";
        if (keepThinking && thinkingIdle) {
          pet.current = layers.base;
          player.play(layers.base, { fade: 0 });
          return;
        }
        syncAnimation(true);
      }
      player.play(SAD_ENTRY, {
        fade,
        onEnded: finish,
        onError: finish
      });
    }
    function playTalkOnce() {
      if (!player) return null;
      stopThinking();
      pet.enteringSad = false;
      pet.current = "Talk";
      pet.segment = null;
      pet.afterOverlay = null;
      talkLock = true;
      player.play("Talk", {
        fade: 0,
        onEnded: function() {
          if (layers.work === "Talk") {
            player.replay();
            return;
          }
          talkLock = false;
          if (pendingOverlay) {
            var next = pendingOverlay;
            pendingOverlay = null;
            playOverlay(next);
            return;
          }
          syncAnimation(true);
        }
      });
      return true;
    }
    function segmentRange(index) {
      var d = pet.interactDuration || 5.933;
      var cut = Math.min(Math.max(0.4, INTERACT_SPLIT), d - 0.4);
      if (index === 0) return { from: 0, to: cut };
      return { from: cut, to: d };
    }
    function playSegment() {
      if (!player) return null;
      var ensureAudio = getAudioEnsure();
      if (ensureAudio) ensureAudio();
      deps.setStartupHold(false);
      talkLock = false;
      pendingOverlay = null;
      if (layers.work === "Talk") suppressedTalk = true;
      stopThinking();
      pet.enteringSad = false;
      var play = getPlaySound();
      if (play) play("click");
      var name = INTERACT_ACTIONS[Math.floor(Math.random() * INTERACT_ACTIONS.length)];
      var index = name === "Interact_A" ? 0 : 1;
      var range = segmentRange(index);
      pet.current = "Interact";
      pet.afterOverlay = null;
      pet.segment = { index, to: range.to };
      layers.overlay = "Interact";
      player.play(name, {
        fade: 0,
        onEnded: function() {
          endSegment();
        }
      });
      log2("segment", index === 0 ? "A" : "B", range.from.toFixed(2) + "-" + range.to.toFixed(2) + "s");
      return true;
    }
    function playOverlay(name, after) {
      if (!player) return null;
      deps.setStartupHold(false);
      pet.enteringSad = false;
      if (talkLock) {
        pendingOverlay = name;
        log2("overlay queued ->", name);
        return null;
      }
      stopThinking();
      layers.overlay = name;
      pet.current = name;
      pet.afterOverlay = typeof after === "function" ? after : null;
      var fade = pendingFade === null ? 0 : pendingFade;
      pendingFade = null;
      player.play(name, {
        fade,
        onEnded: function() {
          if (layers.overlay !== name) return;
          layers.overlay = null;
          var next = pet.afterOverlay;
          pet.afterOverlay = null;
          if (next) {
            next();
            return;
          }
          syncAnimation(true);
        }
      });
      log2("overlay ->", name);
      return true;
    }
    function playSad(after) {
      return playOverlay(SAD_ENTRY, after);
    }
    function endSegment() {
      pet.segment = null;
      if (layers.overlay === "Interact") layers.overlay = null;
      if (!layers.work) pendingFade = CLIP_FADE_MS;
      syncAnimation(true);
      pendingFade = null;
    }
    function isIdle() {
      return !layers.overlay && !layers.work && !talkLock && !pet.segment && !pet.think;
    }
    function resetLocks() {
      talkLock = false;
      pendingOverlay = null;
      stopThinking();
    }
    return {
      layers,
      desiredName,
      playLoop,
      startAnimation,
      startThinking,
      syncAnimation,
      playTalkOnce,
      segmentRange,
      playSegment,
      playOverlay,
      playSad,
      endSegment,
      isIdle,
      resetLocks,
      dispose: stopThinking
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
    function markReady(back, name, clip, token, onEnded) {
      if (token !== gen) return;
      var old = videos[front];
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
      back.onended = clip.loop ? function() {
        try {
          back.currentTime = 0;
          back.play();
        } catch (err) {
        }
      } : function() {
        var cb = endedHandler;
        if (cb) cb(name);
      };
      paused = false;
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
        if (currentEl && currentEl.paused && !paused) {
          currentEl.play().catch(function() {
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
          markReady(back, name, clip, token, opts.onEnded);
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
    var layers = deps.layers;
    var playOverlay = deps.playOverlay;
    var playSad = deps.playSad;
    var syncAnimation = deps.syncAnimation;
    var showBubble = deps.showBubble;
    var refreshBubble = deps.refreshBubble;
    var playSound = deps.playSound;
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
    var lowBalance = false;
    function toolOverlay(kind) {
      if (layers.overlay === "Interact") return false;
      if (kind === "happy" && Math.random() > HAPPY_CHANCE) return false;
      var now = Date.now();
      toolPlayTimes = toolPlayTimes.filter(function(t) {
        return now - t < TOOL_WINDOW;
      });
      var last = toolPlayTimes.length ? toolPlayTimes[toolPlayTimes.length - 1] : 0;
      if (now - last < TOOL_MIN_GAP) return false;
      if (toolPlayTimes.length >= TOOL_WINDOW_MAX) return false;
      toolPlayTimes.push(now);
      if (kind === "happy") playOverlay("Happy");
      else playSad();
      return true;
    }
    function applyState(s) {
      if (!s || typeof s !== "object") return;
      var prev = lastState;
      lastState = s;
      var first = !prev;
      var mode = s.work && s.work.mode;
      layers.work = mode === "outputting" ? "Talk" : mode === "thinking" ? "Special_B" : null;
      var balanceOk = !!(s.balance && s.balance.ok);
      var low = !!(s.balance && s.balance.low);
      if (first) {
        lowBalance = low;
        layers.base = low ? "Sad_Idle" : "Idle";
        scheduleStartup(s.period === "peak", low);
      } else if (balanceOk && low !== lowBalance) {
        lowBalance = low;
        layers.base = low ? "Sad_Idle" : "Idle";
        if (!low) playOverlay("Special_A");
        var sameTickTopUp = s.topUpSeq > (prev && prev.topUpSeq || 0);
        if (low || !sameTickTopUp) showBubble(low ? "\u535A\u58EB\uFF01\u9884\u7B97\u5FEB\u89C1\u5E95\u4E86\n\u8BE5\u6279\u7ECF\u8D39\u5566\uFF01" : "\u7ECF\u8D39\u5230\u8D26\n\u53EF\u9732\u5E0C\u5C14\u7EE7\u7EED\u4E3A\u4F60\u6548\u529B~");
        playSound(low ? "fail" : "coin");
      }
      if (prev) {
        if (s.tools && prev.tools) {
          if (s.tools.ok > prev.tools.ok) toolOverlay("happy");
          if (s.tools.fail > prev.tools.fail && toolOverlay("sad")) {
            showBubble("\u5DE5\u5177\u8C03\u7528\u5931\u8D25" + (s.tools.lastFailName ? "\uFF1A" + s.tools.lastFailName : ""));
            playSound("fail");
          }
        }
        var prevErrCount = prev.errors && prev.errors.count || 0;
        var curErrCount = s.errors && s.errors.count || 0;
        if (curErrCount > prevErrCount) {
          var errMsg = String(s.errors && s.errors.message || "").slice(0, 40);
          playSad();
          showBubble("\u51FA\u9519\u4E86" + (errMsg ? "\uFF1A" + errMsg : ""), 4600);
          playSound("fail");
        }
        if (s.topUpSeq > prev.topUpSeq) {
          playOverlay("Special_A");
          showBubble("\u611F\u8C22\u60E0\u987E~\n\u91C7\u8D2D\u90E8\u968F\u65F6\u6B22\u8FCE\u4E0B\u6B21\u5149\u4E34\uFF01");
          playSound("coin");
        }
        var prevTurnEnd = prev.turnEnd && prev.turnEnd.seq || 0;
        var curTurnEnd = s.turnEnd && s.turnEnd.seq || 0;
        if (curTurnEnd > prevTurnEnd) {
          var kind = s.turnEnd && s.turnEnd.kind || "completed";
          if (kind === "completed") {
            showBubble();
          } else if (kind === "error") {
            playSad();
            showBubble("\u5567\uFF0C\u8FD9\u6B21\u51FA\u9519\u4E86\u535A\u58EB\u2026\u2026");
            playSound("turnfail");
          } else {
            playSad();
            showBubble("\u6B38\uFF1F\u600E\u4E48\u7A81\u7136\u6390\u65AD\u4E86\uFF1F");
            playSound("turnfail");
          }
        }
        if (s.periodSeq > prev.periodSeq) {
          if (s.period === "peak") playSad();
          else playOverlay("Special_A");
          showBubble(s.period === "peak" ? "\u5F00\u59CB\u6309\u539F\u4EF7\u6536\u8D39\u4E86\u54E6\u535A\u58EB~" : "\u53EF\u9732\u5E0C\u5C14\u5927\u51CF\u4EF7\u65F6\u95F4\u5230~\n\u51B2\u554A\u535A\u58EB\uFF01");
        }
      }
      if (isBubbleShown()) refreshBubble();
      syncAnimation(false);
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

  // assets/src/main.js
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
    var applyPositionRaw = layoutUi.applyPosition;
    function applyPosition() {
      applyPositionRaw();
      followPlate();
    }
    var setFlipped = layoutUi.setFlipped;
    var applyOpacity = layoutUi.applyOpacity;
    var resolveFlip = layoutUi.resolveFlip;
    var defaultPos = layoutUi.defaultPos;
    var loadPos = layoutUi.loadPos;
    var savePos = layoutUi.savePos;
    var placeFromStorage = layoutUi.placeFromStorage;
    var repositionForAnchorRaw = layoutUi.repositionForAnchor;
    function repositionForAnchor() {
      repositionForAnchorRaw();
      followPlate();
    }
    var settleRaw = layoutUi.settle;
    function settle() {
      settleRaw();
      followPlate();
    }
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
    var director = createDirector({
      pet,
      player,
      log,
      // audio 别名在下面音效分节才赋值，用 getter 惰性取（否则 playSegment 会拿到 undefined）
      getAudioEnsure: function() {
        return audioEnsure;
      },
      getPlaySound: function() {
        return playSound;
      },
      getStartupHold: function() {
        return startupHold;
      },
      setStartupHold: function(v) {
        startupHold = v;
      }
    });
    var layers = director.layers;
    var desiredName = director.desiredName;
    var playLoop = director.playLoop;
    var startAnimation = director.startAnimation;
    var syncAnimation = director.syncAnimation;
    var segmentRange = director.segmentRange;
    var playSegment = director.playSegment;
    var playOverlay = director.playOverlay;
    var playSad = director.playSad;
    var endSegment = director.endSegment;
    function start() {
      host.style.opacity = "1";
      window.__dshClosurePet.phase = "running";
      if (plateApi) plateApi.start();
    }
    function stop() {
      player.pause();
      if (plateApi) plateApi.pause();
    }
    function resumeAnimation() {
      player.resume();
      if (plateApi) plateApi.resume();
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
        if (plateApi) plateApi.dispose();
      } catch (err) {
      }
      try {
        director.dispose();
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
    var plateApi = null;
    function applyPlate() {
      if (plateApi) plateApi.applySettings();
    }
    function followPlate() {
      if (plateApi) plateApi.follow();
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
    var startupHold = false;
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
      director.resetLocks();
      var opening = p.peak ? playSad : function(after) {
        return playOverlay("Special_A", after);
      };
      opening(function() {
        if (!p.low) {
          syncAnimation(true);
          return;
        }
        startupHold = true;
        setTimeout(function() {
          startupHold = false;
          if (layers.overlay) return;
          playSad();
          showBubble("\u535A\u58EB\uFF01\u9884\u7B97\u5FEB\u89C1\u5E95\u4E86\n\u8BE5\u6279\u7ECF\u8D39\u5566\uFF01");
          playSound("fail");
        }, STARTUP_GAP);
      });
      showBubble(p.peak ? "\u5F00\u59CB\u6309\u539F\u4EF7\u6536\u8D39\u4E86\u54E6\u535A\u58EB~" : "\u53EF\u9732\u5E0C\u5C14\u5927\u51CF\u4EF7\u65F6\u95F4\u5230~\n\u51B2\u554A\u535A\u58EB\uFF01");
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
      resetPosition,
      applyPlate
    });
    bubbleApi = createBubble({
      getState: function() {
        return stateApi ? stateApi.getState() : null;
      },
      pet,
      size,
      settings
    });
    stickerApi = createSticker({
      getState: function() {
        return stateApi ? stateApi.getState() : null;
      },
      pet,
      size,
      settings
    });
    plateApi = createPlate({ settings, pet, size });
    stateApi = createState({
      layers,
      playOverlay,
      playSad,
      syncAnimation,
      showBubble,
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
      playSegment,
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
        playLoop("Idle", true);
        start();
        startPolling();
        loadHostConfig();
        loadSounds();
        log("\u542F\u52A8\u5B8C\u6210", ANIMATION_NAMES.length, "animations \xB7 size", settings.size, "\xB7 mirror", settings.mirror);
        window.__dshClosurePet = {
          phase: "running",
          animations: ANIMATION_NAMES,
          play: function(name, loop) {
            layers.overlay = null;
            pet.segment = null;
            loop ? playLoop(name, true) : playSegment2(name);
          },
          segments: function() {
            return [segmentRange(0), segmentRange(1)];
          },
          openPanel,
          closePanel,
          get settings() {
            return { mirror: settings.mirror, size: settings.size, bubble: settings.bubble, bubbleScale: settings.bubbleScale, bubbleTiers: settings.bubbleTiers, snapStrength: settings.snapStrength, opacity: settings.opacity, sound: settings.sound, volume: settings.volume, plate: settings.plate };
          },
          get split() {
            return INTERACT_SPLIT;
          },
          setSettings: function(patch) {
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
              if (typeof patch.plate === "boolean") settings.plate = patch.plate;
            }
            saveSettings(true);
            layout();
            repositionForAnchor();
            resolveFlip();
            applyOpacity();
            if (bubbleApi && bubbleApi.isShown()) refreshBubble();
            if (!settings.bubble) hideBubble();
            applyPlate();
          },
          resetPosition,
          hitTest,
          applyState,
          // 调试用：手动灌一份 /state 数据
          showBubble,
          showValleySticker,
          hideBubble,
          get layers() {
            return { base: layers.base, work: layers.work, overlay: layers.overlay };
          },
          get sounds() {
            return audio.getState();
          },
          playSound,
          runStartup,
          cancelStartup,
          get startup() {
            return { pending: !!startupPending, delay: STARTUP_DELAY, gap: STARTUP_GAP };
          },
          get trackTime() {
            return player.currentTime();
          },
          get animation() {
            return player.current();
          },
          get segmentInfo() {
            return pet.segment ? { to: pet.segment.to, index: pet.segment.index } : null;
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
              clips: Object.keys(CLIPS).length,
              plate: plateApi ? plateApi.debug() : null
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
      if (name === "Interact") return playSegment();
      return playOverlay(name);
    }
  }

  // assets/src/client-entry.js
  function makeFactory() {
    return function factory(require2) {
      var React = require2("react");
      var current = null;
      function PetLayer() {
        var ref = React.useRef(null);
        React.useEffect(function() {
          var node = ref.current;
          if (!node) return;
          var mountEl = document.createElement("div");
          mountEl.id = "dsh-closure-pet-mount";
          mountEl.style.cssText = "display:contents";
          node.appendChild(mountEl);
          current = startPet(mountEl);
          return function() {
            var dispose = current;
            current = null;
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
        }
      };
    };
  }
  window.__ModuleLoader__.load({
    id: "dsh-closure-pet",
    factory: makeFactory()
  });
})();
