(function () {
  'use strict';

  const PANEL_WIDTH_PX = 341;
  const PANEL_CALENDAR_GAP_PX = 8;
  const PANEL_RAIL_GAP_PX = 4;
  const GP_SIDEBAR_INSET_ATTR = 'data-gp-sidebar-inset';
  const GP_SIDEBAR_INSET_STYLE_KEYS = {
    layout: ['padding-right', 'margin-right', 'max-width', 'min-width', 'box-sizing'],
    rail: ['padding-right', 'margin-right', 'max-width', 'box-sizing'],
    kanban: ['min-width', 'max-width', 'overflow'],
    board: ['overflow-x', 'overflow-y', 'max-width', 'width', 'box-sizing'],
  };
  let gpSidebarInsetReflowTimer = null;
  const MAIN_MARGIN_TRANSITION = 'margin-right 0.2s ease';
  const TASK_COMPLETE_ANIM_MS = 1200;
  const TASK_STATUSES = {
    planned: {
      label: 'Planned',
      className: 'gp-filter-chip--planned',
    },
    progress: {
      label: 'In progress',
      className: 'gp-filter-chip--progress',
    },
    done: {
      label: 'Done',
      className: 'gp-filter-chip--done',
    },
  };
  const FOLDER_LABELS = {
    overdue: 'Overdue',
    today: 'Due Today',
    later: 'Due Later',
    completed: 'Completed',
  };

  const SIDEBAR_FOLDER_ORDER = ['overdue', 'today', 'later', 'completed'];
  const KANBAN_STORAGE_KEY = 'gpKanbanBoardState';
  const MK_DELETE_CONFIRM_AUTO_CANCEL_MS = 5000;
  const MK_CARD_REMOVE_ANIM_MS = 200;
  const FORCE_CLEAR_KANBAN_MARKER = 'gpForceClearKanbanBoard';
  const KANBAN_COLUMN_DEFS = [
    { id: 'todo', label: 'PLANNED' },
    { id: 'progress', label: 'IN PROGRESS' },
    { id: 'done', label: 'DONE' },
  ];
  const COLUMN_STATUS_MAP = {
    todo: 'planned',
    progress: 'progress',
    done: 'done',
  };
  const STATUS_COLUMN_MAP = {
    planned: 'todo',
    progress: 'progress',
    done: 'done',
  };
  const KANBAN_CHIP_COLORS = {
    PSYC101: 'blue',
    MGT103: 'red',
    COGS14B: 'green',
    PS: 'yellow',
  };
  const KANBAN_LEGACY_CHIP_COLORS = {
    psych: 'blue',
    mgt: 'red',
    cogs: 'green',
    ps: 'yellow',
  };
  const KANBAN_COURSE_OPTIONS = ['PSYC101', 'MGT103', 'COGS14B', 'PS'];
  const TAG_HEX_BY_KEY = {
    blue: '#1a73e8',
    red: '#d93025',
    green: '#137333',
    yellow: '#e37400',
    purple: '#9334e6',
    orange: '#e8710a',
    teal: '#00796b',
    grey: '#5f6368',
  };
  const TAG_PALETTE_KEYS = Object.keys(TAG_HEX_BY_KEY);
  const GP_CUSTOM_PALETTE_STORAGE_KEY = 'gpCustomTagPaletteColors';
  const GP_HIDDEN_PRESET_PALETTE_STORAGE_KEY = 'gpHiddenPresetPaletteKeys';
  const GP_CUSTOM_PALETTE_MAX = 14;
  const GP_CT_PALETTE_DELETE_CONFIRM_MS = 2000;
  const GP_CT_SWATCH_CHECK_SVG = '<svg class="gp-ct-swatch-check-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  const CHIP_CLASS_BY_COLOR_KEY = {
    blue: 'blue',
    red: 'red',
    green: 'green',
    yellow: 'yellow',
    purple: 'purple',
    orange: 'orange',
    teal: 'teal',
    grey: 'grey',
    custom: 'custom',
  };
  const MYTASKS_MESSAGE_SOURCE = 'mytasks-kanban-extension';
  const KANBAN_LIST_MATCHERS = [
    { id: 'all', pattern: /^\s*my tasks?\s*$/i },
    { id: 'todo', pattern: /\bplanned\b|\bto[\s-]*do\b/i },
    { id: 'progress', pattern: /\bin progress\b/i },
    { id: 'done', pattern: /^\s*done\s*$/i },
  ];
  const KANBAN_FILTER_STORAGE_KEY = 'gpKanbanFilters';
  const KANBAN_VIEW_DEFS = [
    { id: 'due-this-week', label: 'Due this week', iconKey: 'calendar' },
    { id: 'overdue', label: 'Overdue', iconKey: 'warning' },
  ];
  const KANBAN_VIEW_RADIO_OPTIONS = [
    { id: 'all', label: 'Select all' },
    ...KANBAN_VIEW_DEFS,
    { id: 'starred', label: 'Starred', iconKey: 'starred' },
  ];
  const KANBAN_NAV_FILTER_IDS = [...KANBAN_VIEW_DEFS.map(({ id }) => id), 'starred'];
  const KANBAN_FILTER_ANIM_MS = 180;
  const KANBAN_NAV_ICONS = {
    allTasks: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"></circle><path d="M8.5 12.2 10.8 14.5 15.5 9.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`,
    starred: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5l2.47 5.01 5.53.8-4 3.9.94 5.5L12 16.9l-4.94 2.6.94-5.5-4-3.9 5.53-.8L12 3.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path></svg>`,
    calendar: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="2"></rect><path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>`,
    warning: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.5 20.5 19H3.5L12 4.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>`,
  };

  function getDefaultTags() {
    return KANBAN_COURSE_OPTIONS.map((label) => ({
      id: `tag-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      label,
      colorKey: KANBAN_CHIP_COLORS[label] || 'blue',
      hidden: false,
    }));
  }

  function normalizeHexColor(s) {
    if (s == null || typeof s !== 'string') return '';
    let t = s.trim();
    if (!t) return '';
    if (!t.startsWith('#')) t = `#${t}`;
    if (t.length === 4 && /^#[0-9a-f]{3}$/i.test(t)) {
      t = `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
    }
    if (!/^#[0-9a-f]{6}$/i.test(t)) return '';
    return t.toLowerCase();
  }

  function hexToRgb(hex) {
    const h = normalizeHexColor(hex);
    if (!h) return null;
    const n = parseInt(h.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
    return `#${[clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')}`;
  }

  function rgbToHsv(r, g, b) {
    const R = r / 255;
    const G = g / 255;
    const B = b / 255;
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const d = max - min;
    const v = max;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case R:
          h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
          break;
        case G:
          h = ((B - R) / d + 2) / 6;
          break;
        default:
          h = ((R - G) / d + 4) / 6;
          break;
      }
    }
    return { h: h * 360, s, v };
  }

  function hsvToRgb(h, s, v) {
    const hh = ((((h / 360) % 1) + 1) % 1) * 6;
    const i = Math.floor(hh);
    const f = hh - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r; let g; let b;
    switch (i % 6) {
      case 0:
        r = v; g = t; b = p;
        break;
      case 1:
        r = q; g = v; b = p;
        break;
      case 2:
        r = p; g = v; b = t;
        break;
      case 3:
        r = p; g = q; b = v;
        break;
      case 4:
        r = t; g = p; b = v;
        break;
      default:
        r = v; g = p; b = q;
        break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  let gpCtSpectrumH = 210;
  let gpCtSpectrumS = 0.65;
  let gpCtSpectrumV = 0.95;
  let gpCtSpectrumPopWired = false;
  let gpCtPaletteDeletePending = null;
  let gpCtColorAddPanelWired = false;
  let gpCustomPaletteCache = [];
  let gpCustomPaletteCacheReady = false;
  let gpHiddenPresetCache = [];
  let gpHiddenPresetCacheReady = false;

  function closeGpCtSpectrumPop() {
    const spec = document.getElementById('gp-ct-spectrum-pop');
    if (spec) spec.hidden = true;
  }

  function renderGpCtSpectrumUi() {
    const bg = document.getElementById('gp-ct-sv-bg');
    const pure = hsvToRgb(gpCtSpectrumH, 1, 1);
    if (bg) bg.style.backgroundColor = `rgb(${pure.r},${pure.g},${pure.b})`;
    const svMark = document.getElementById('gp-ct-sv-marker');
    if (svMark) {
      svMark.style.left = `${gpCtSpectrumS * 100}%`;
      svMark.style.top = `${(1 - gpCtSpectrumV) * 100}%`;
    }
    const hueMark = document.getElementById('gp-ct-hue-marker');
    if (hueMark) {
      hueMark.style.left = `${(gpCtSpectrumH / 360) * 100}%`;
    }
    const hexIn = document.getElementById('gp-ct-spectrum-hex');
    if (hexIn && document.activeElement !== hexIn) {
      const { r, g, b } = hsvToRgb(gpCtSpectrumH, gpCtSpectrumS, gpCtSpectrumV);
      hexIn.value = rgbToHex(r, g, b);
    }
  }

  function commitSpectrumToTag() {
    const { r, g, b } = hsvToRgb(gpCtSpectrumH, gpCtSpectrumS, gpCtSpectrumV);
    applyInlineNewTagCustomColorFromPicker(rgbToHex(r, g, b));
  }

  function setGpCtSpectrumFromHex(hex) {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return;
    const rgb = hexToRgb(normalized);
    if (!rgb) return;
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    gpCtSpectrumH = hsv.h;
    gpCtSpectrumS = hsv.s;
    gpCtSpectrumV = hsv.v;
  }

  function getGpCtSpectrumHex() {
    const { r, g, b } = hsvToRgb(gpCtSpectrumH, gpCtSpectrumS, gpCtSpectrumV);
    return rgbToHex(r, g, b);
  }

  function renderGpCtColorAddPanelUi(panel) {
    if (!panel) return;

    const { r, g, b } = hsvToRgb(gpCtSpectrumH, gpCtSpectrumS, gpCtSpectrumV);
    const hex = getGpCtSpectrumHex();
    const pure = hsvToRgb(gpCtSpectrumH, 1, 1);

    const bg = panel.querySelector('.gp-ct-add-sv-bg');
    if (bg) bg.style.backgroundColor = `rgb(${pure.r},${pure.g},${pure.b})`;

    const svMark = panel.querySelector('.gp-ct-add-sv-marker');
    if (svMark) {
      svMark.style.left = `${gpCtSpectrumS * 100}%`;
      svMark.style.top = `${(1 - gpCtSpectrumV) * 100}%`;
    }

    const hueMark = panel.querySelector('.gp-ct-add-hue-marker');
    if (hueMark) hueMark.style.left = `${(gpCtSpectrumH / 360) * 100}%`;

    panel.querySelectorAll('.gp-ct-add-preview, .gp-ct-add-hex-preview').forEach((el) => {
      el.style.background = hex;
    });

    const rIn = panel.querySelector('.gp-ct-add-r');
    const gIn = panel.querySelector('.gp-ct-add-g');
    const bIn = panel.querySelector('.gp-ct-add-b');
    const hexIn = panel.querySelector('.gp-ct-add-hex');
    if (rIn && document.activeElement !== rIn) rIn.value = String(r);
    if (gIn && document.activeElement !== gIn) gIn.value = String(g);
    if (bIn && document.activeElement !== bIn) bIn.value = String(b);
    if (hexIn && document.activeElement !== hexIn) hexIn.value = hex;
  }

  function applyGpCtColorFromRgb(panel, r, g, b) {
    const rr = Math.min(255, Math.max(0, Math.round(Number(r))));
    const gg = Math.min(255, Math.max(0, Math.round(Number(g))));
    const bb = Math.min(255, Math.max(0, Math.round(Number(b))));
    const hsv = rgbToHsv(rr, gg, bb);
    gpCtSpectrumH = hsv.h;
    gpCtSpectrumS = hsv.s;
    gpCtSpectrumV = hsv.v;
    renderGpCtColorAddPanelUi(panel);
  }

  function wireGpCtColorAddPanel(panel) {
    if (!panel || panel.dataset.gpCtAddWired === 'true') return;
    panel.dataset.gpCtAddWired = 'true';

    const surf = panel.querySelector('.gp-ct-add-sv-surface');
    const hueStrip = panel.querySelector('.gp-ct-add-hue-strip');
    const hexIn = panel.querySelector('.gp-ct-add-hex');
    const rIn = panel.querySelector('.gp-ct-add-r');
    const gIn = panel.querySelector('.gp-ct-add-g');
    const bIn = panel.querySelector('.gp-ct-add-b');
    const eyedropperBtn = panel.querySelector('.gp-ct-add-eyedropper');
    const formatToggle = panel.querySelector('.gp-ct-add-format-toggle');

    const updateSvFromClient = (clientX, clientY) => {
      if (!surf) return;
      const rect = surf.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      gpCtSpectrumS = rect.width ? x / rect.width : 0;
      gpCtSpectrumV = rect.height ? 1 - y / rect.height : 0;
      renderGpCtColorAddPanelUi(panel);
    };

    const updateHueFromClient = (clientX) => {
      if (!hueStrip) return;
      const rect = hueStrip.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      gpCtSpectrumH = rect.width ? (x / rect.width) * 360 : 0;
      renderGpCtColorAddPanelUi(panel);
    };

    let svDrag = false;
    let hueDrag = false;

    surf?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      svDrag = true;
      surf.setPointerCapture(e.pointerId);
      updateSvFromClient(e.clientX, e.clientY);
    });
    surf?.addEventListener('pointermove', (e) => {
      if (!svDrag) return;
      updateSvFromClient(e.clientX, e.clientY);
    });
    const endSvDrag = (e) => {
      if (!svDrag) return;
      svDrag = false;
      try {
        surf.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    };
    surf?.addEventListener('pointerup', endSvDrag);
    surf?.addEventListener('pointercancel', () => {
      svDrag = false;
    });

    hueStrip?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      hueDrag = true;
      hueStrip.setPointerCapture(e.pointerId);
      updateHueFromClient(e.clientX);
    });
    hueStrip?.addEventListener('pointermove', (e) => {
      if (!hueDrag) return;
      updateHueFromClient(e.clientX);
    });
    const endHueDrag = (e) => {
      if (!hueDrag) return;
      hueDrag = false;
      try {
        hueStrip.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    };
    hueStrip?.addEventListener('pointerup', endHueDrag);
    hueStrip?.addEventListener('pointercancel', () => {
      hueDrag = false;
    });

    hexIn?.addEventListener('input', () => {
      const hx = normalizeHexColor(hexIn.value);
      if (!hx) return;
      setGpCtSpectrumFromHex(hx);
      renderGpCtColorAddPanelUi(panel);
    });

    const onRgbInput = () => {
      applyGpCtColorFromRgb(panel, rIn?.value, gIn?.value, bIn?.value);
    };
    rIn?.addEventListener('input', onRgbInput);
    gIn?.addEventListener('input', onRgbInput);
    bIn?.addEventListener('input', onRgbInput);

    eyedropperBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!window.EyeDropper) return;
      try {
        const dropper = new window.EyeDropper();
        const result = await dropper.open();
        const hx = normalizeHexColor(result?.sRGBHex);
        if (!hx) return;
        setGpCtSpectrumFromHex(hx);
        renderGpCtColorAddPanelUi(panel);
      } catch (_) {
        /* user cancelled */
      }
    });

    formatToggle?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const card = panel.querySelector('.gp-ct-color-add-card');
      card?.classList.toggle('is-hex-mode');
      const isHex = card?.classList.contains('is-hex-mode');
      formatToggle.setAttribute('aria-pressed', isHex ? 'true' : 'false');
    });
  }

  function positionGpCtSpectrumPop(anchor) {
    const spec = document.getElementById('gp-ct-spectrum-pop');
    if (!spec || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = spec.offsetWidth || 240;
    const h = spec.offsetHeight || 220;
    const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left));
    const top = Math.min(window.innerHeight - h - 8, r.bottom + 6);
    spec.style.left = `${left}px`;
    spec.style.top = `${top}px`;
  }

  function openGpCtSpectrumPicker(anchorBtn) {
    const spec = ensureGpCtSpectrumPop();
    const dot = document.getElementById('gp-ct-new-tag-dot');
    let hex0 = '#1a73e8';
    if (dot?.dataset.colorKey === 'custom' && dot.dataset.customHex) {
      hex0 = normalizeHexColor(dot.dataset.customHex) || hex0;
    } else if (dot?.dataset.colorKey && TAG_HEX_BY_KEY[dot.dataset.colorKey]) {
      hex0 = TAG_HEX_BY_KEY[dot.dataset.colorKey];
    }
    const rgb = hexToRgb(hex0);
    if (rgb) {
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      gpCtSpectrumH = hsv.h;
      gpCtSpectrumS = hsv.s;
      gpCtSpectrumV = hsv.v;
    }
    spec.hidden = false;
    renderGpCtSpectrumUi();
    requestAnimationFrame(() => {
      positionGpCtSpectrumPop(anchorBtn);
    });
  }

  function ensureGpCtSpectrumPop() {
    let el = document.getElementById('gp-ct-spectrum-pop');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'gp-ct-spectrum-pop';
    el.className = 'gp-ct-spectrum-pop';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Custom color spectrum');
    el.hidden = true;
    el.innerHTML = `
      <div class="gp-ct-spectrum-pop-inner">
        <div class="gp-ct-sv-surface" id="gp-ct-sv-surface">
          <div class="gp-ct-sv-bg" id="gp-ct-sv-bg"></div>
          <div class="gp-ct-sv-grad-s" aria-hidden="true"></div>
          <div class="gp-ct-sv-grad-v" aria-hidden="true"></div>
          <div class="gp-ct-sv-marker" id="gp-ct-sv-marker"></div>
        </div>
        <div class="gp-ct-hue-strip" id="gp-ct-hue-strip">
          <div class="gp-ct-hue-marker" id="gp-ct-hue-marker"></div>
        </div>
        <div class="gp-ct-spectrum-hex-row">
          <label class="gp-ct-spectrum-hex-label" for="gp-ct-spectrum-hex">Hex</label>
          <input type="text" id="gp-ct-spectrum-hex" class="gp-ct-spectrum-hex" maxlength="7" autocomplete="off" spellcheck="false" placeholder="#000000" />
        </div>
      </div>`.trim();
    document.body.appendChild(el);
    el.style.position = 'fixed';
    el.style.zIndex = '2147483647';

    const surf = el.querySelector('#gp-ct-sv-surface');
    const hueStrip = el.querySelector('#gp-ct-hue-strip');
    const hexIn = el.querySelector('#gp-ct-spectrum-hex');

    const updateSvFromClient = (clientX, clientY) => {
      if (!surf) return;
      const rect = surf.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      gpCtSpectrumS = rect.width ? x / rect.width : 0;
      gpCtSpectrumV = rect.height ? 1 - y / rect.height : 0;
      renderGpCtSpectrumUi();
      commitSpectrumToTag();
    };

    const updateHueFromClient = (clientX) => {
      if (!hueStrip) return;
      const rect = hueStrip.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      gpCtSpectrumH = rect.width ? (x / rect.width) * 360 : 0;
      renderGpCtSpectrumUi();
      commitSpectrumToTag();
    };

    let svDrag = false;
    let hueDrag = false;

    surf?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      svDrag = true;
      surf.setPointerCapture(e.pointerId);
      updateSvFromClient(e.clientX, e.clientY);
    });
    surf?.addEventListener('pointermove', (e) => {
      if (!svDrag) return;
      updateSvFromClient(e.clientX, e.clientY);
    });
    surf?.addEventListener('pointerup', (e) => {
      if (!svDrag) return;
      svDrag = false;
      try {
        surf.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    });
    surf?.addEventListener('pointercancel', () => {
      svDrag = false;
    });

    hueStrip?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      hueDrag = true;
      hueStrip.setPointerCapture(e.pointerId);
      updateHueFromClient(e.clientX);
    });
    hueStrip?.addEventListener('pointermove', (e) => {
      if (!hueDrag) return;
      updateHueFromClient(e.clientX);
    });
    hueStrip?.addEventListener('pointerup', (e) => {
      if (!hueDrag) return;
      hueDrag = false;
      try {
        hueStrip.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    });
    hueStrip?.addEventListener('pointercancel', () => {
      hueDrag = false;
    });

    hexIn?.addEventListener('input', () => {
      const hx = normalizeHexColor(hexIn.value);
      if (!hx) return;
      const rgb = hexToRgb(hx);
      if (!rgb) return;
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      gpCtSpectrumH = hsv.h;
      gpCtSpectrumS = hsv.s;
      gpCtSpectrumV = hsv.v;
      renderGpCtSpectrumUi();
      commitSpectrumToTag();
    });

    if (!gpCtSpectrumPopWired) {
      gpCtSpectrumPopWired = true;
      document.addEventListener(
        'pointerdown',
        (e) => {
          const spec = document.getElementById('gp-ct-spectrum-pop');
          if (!spec || spec.hidden) return;
          if (spec.contains(e.target)) return;
          if (e.target.closest('#gp-ct-color-custom-hit')) return;
          closeGpCtSpectrumPop();
        },
        true,
      );
      window.addEventListener('resize', () => {
        const spec = document.getElementById('gp-ct-spectrum-pop');
        if (!spec || spec.hidden) return;
        const anchor = document.querySelector('.gp-ct-color-plus-btn');
        if (anchor) positionGpCtSpectrumPop(anchor);
      });
    }

    return el;
  }

  function normalizeTags(raw) {
    const fallback = getDefaultTags();
    if (!Array.isArray(raw) || raw.length === 0) {
      return fallback.map((t) => ({ ...t }));
    }

    return raw.map((t, i) => {
      const id = String(t?.id || `tag-${i}`);
      const label = String(t?.label || `Tag ${i + 1}`).trim() || `Tag ${i + 1}`;
      const hidden = Boolean(t?.hidden);
      const customHex = normalizeHexColor(t?.customHex);
      const isCustom = t?.colorKey === 'custom' && customHex;
      const colorKey = isCustom
        ? 'custom'
        : (TAG_PALETTE_KEYS.includes(t?.colorKey) ? t.colorKey : 'blue');
      const out = { id, label, colorKey, hidden };
      if (colorKey === 'custom') out.customHex = customHex;
      return out;
    });
  }

  function tagResolvedHex(tag) {
    if (!tag) return '#5f6368';
    if (tag.colorKey === 'custom' && normalizeHexColor(tag.customHex)) {
      return normalizeHexColor(tag.customHex);
    }
    return TAG_HEX_BY_KEY[tag.colorKey] || '#5f6368';
  }

  function findTagByLabel(tags, label) {
    return (tags || []).find((t) => t.label === label);
  }

  function chipClassForColorKey(colorKey) {
    return CHIP_CLASS_BY_COLOR_KEY[colorKey] || 'blue';
  }

  const SIDEBAR_MARKUP = `
<div id="gp-panel" class="mytasks-sidebar" aria-hidden="true">
  <div class="gp-card" id="gp-card">
    <div class="gp-sidebar-sticky-head">
      <header class="gp-header gp-header--tasks">
        <h2 class="gp-header-title">My Tasks</h2>
      <button class="gp-icon-btn" id="gp-close-btn" type="button" title="Close" aria-label="Close tasks panel">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </header>

    <button type="button" class="gp-create-task-row" id="gp-create-task-btn">
      <span class="gp-create-task-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </span>
      <span class="gp-create-task-label">Create task</span>
      </button>
    </div>

    <div class="gp-tasks-accordion" id="gp-tasks-accordion">
      <section class="gp-task-folder open" data-folder="overdue">
        <div class="gp-task-folder-header">
          <button class="gp-task-folder-toggle" type="button" aria-expanded="true" aria-label="Toggle Overdue tasks">
            <svg class="gp-task-folder-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
          </button>
          <span class="gp-task-folder-label">Overdue (0)</span>
        </div>
        <div class="gp-task-folder-panel">
          <div class="gp-task-folder-panel-inner"></div>
        </div>
      </section>

      <section class="gp-task-folder open" data-folder="today">
        <div class="gp-task-folder-header">
          <button class="gp-task-folder-toggle" type="button" aria-expanded="true" aria-label="Toggle Due Today tasks">
            <svg class="gp-task-folder-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
          </button>
          <span class="gp-task-folder-label">Due Today (0)</span>
        </div>
        <div class="gp-task-folder-panel">
          <div class="gp-task-folder-panel-inner"></div>
        </div>
      </section>

      <section class="gp-task-folder" data-folder="later">
        <div class="gp-task-folder-header">
          <button class="gp-task-folder-toggle" type="button" aria-expanded="false" aria-label="Toggle Due Later tasks">
            <svg class="gp-task-folder-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
          </button>
          <span class="gp-task-folder-label">Due Later (0)</span>
        </div>
        <div class="gp-task-folder-panel">
          <div class="gp-task-folder-panel-inner"></div>
        </div>
      </section>

      <section class="gp-task-folder" data-folder="completed">
        <div class="gp-task-folder-header">
          <button class="gp-task-folder-toggle" type="button" aria-expanded="false" aria-label="Toggle Completed tasks">
            <svg class="gp-task-folder-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
          </button>
          <span class="gp-task-folder-label">Completed (0)</span>
        </div>
        <div class="gp-task-folder-panel">
          <div class="gp-task-folder-panel-inner"></div>
        </div>
      </section>
    </div>
  </div>

  <div id="gp-status-menu" class="gp-status-menu" role="menu" aria-label="Task status" hidden>
    <button type="button" class="gp-status-menu-item" role="menuitemradio" data-status="planned" aria-checked="false">
      <span class="gp-status-menu-dot gp-status-menu-dot--planned" aria-hidden="true"></span>
      <span class="gp-status-menu-label">Planned</span>
      <span class="gp-status-menu-check" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>
    </button>
    <button type="button" class="gp-status-menu-item" role="menuitemradio" data-status="progress" aria-checked="false">
      <span class="gp-status-menu-dot gp-status-menu-dot--progress" aria-hidden="true"></span>
      <span class="gp-status-menu-label">In progress</span>
      <span class="gp-status-menu-check" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>
    </button>
    <button type="button" class="gp-status-menu-item" role="menuitemradio" data-status="done" aria-checked="false">
      <span class="gp-status-menu-dot gp-status-menu-dot--done" aria-hidden="true"></span>
      <span class="gp-status-menu-label">Done</span>
      <span class="gp-status-menu-check" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>
    </button>
  </div>
</div>
`.trim();

  let cachedCalendarMainEl = null;
  let calendarPushDebounce = null;
  let railMountDebounce = null;
  let nativeTasksKanbanDebounce = null;
  let nativeTasksObserver = null;
  let nativeTasksSyncInFlight = false;
  let nativeTasksResizeObserver = null;
  let activeNativeTasksHost = null;
  let kanbanStateCache = null;
  let mkDeleteConfirmCard = null;
  let mkDeleteConfirmTimeoutId = null;
  let mkDeleteConfirmOutsideHandler = null;
  let mkDeleteConfirmEscapeHandler = null;
  let kanbanStorageListenerWired = false;
  let closeTaskStatusMenu = null;

  const SIDE_APP_LABEL_RE = /\b(keep|tasks|contacts|maps|side panel|add-ons|jamboard)\b/i;

  function isVisibleElement(el) {
    if (!el || !el.isConnected) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findSideAppAnchors() {
    const anchors = new Set();

    document.querySelectorAll('[aria-label], [data-tooltip]').forEach((el) => {
      if (!isVisibleElement(el)) return;

      const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-tooltip') || ''}`.trim();
      if (!SIDE_APP_LABEL_RE.test(label)) return;

      const rect = el.getBoundingClientRect();
      if (rect.right < window.innerWidth - 140) return;

      anchors.add(el);
    });

    return [...anchors];
  }

  function countRailActions(el) {
    return el.querySelectorAll('button, [role="button"], a[href]').length;
  }

  function scoreRailCandidate(el) {
    if (!isVisibleElement(el)) return -1;

    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const actions = countRailActions(el);

    if (actions < 1) return -1;
    if (rect.right < window.innerWidth - 120) return -1;
    if (rect.width > 160 || rect.height < 72) return -1;

    let score = 0;

    if (style.position === 'fixed' || style.position === 'sticky') score += 5;
    else if (style.position === 'absolute') score += 2;

    if (rect.right >= window.innerWidth - 8) score += 4;
    if (rect.width <= 72) score += 3;
    if (style.flexDirection === 'column') score += 3;
    score += Math.min(actions, 8);
    if (el.children.length >= 2) score += 2;

    return score;
  }

  function findRailFromAnchors(anchors) {
    let best = null;
    let bestScore = 2;

    anchors.forEach((anchor) => {
      let el = anchor;
      for (let depth = 0; depth < 12 && el; depth += 1) {
        const score = scoreRailCandidate(el);
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
        el = el.parentElement;
      }
    });

    return best;
  }

  function findRailByStructure() {
    const anchors = findSideAppAnchors();
    const fromAnchors = findRailFromAnchors(anchors);
    if (fromAnchors) return fromAnchors;

    let best = null;
    let bestScore = 2;

    document.querySelectorAll('div, nav, aside, section').forEach((el) => {
      const score = scoreRailCandidate(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    });

    return best;
  }

  function ensureFallbackRailHost() {
    let host = document.getElementById('gp-sidebar-rail');
    if (host) return host;

    host = document.createElement('div');
    host.id = 'gp-sidebar-rail';
    host.dataset.fallback = 'true';
    document.body.appendChild(host);
    return host;
  }

  function positionFallbackRail(anchorEl) {
    const host = document.getElementById('gp-sidebar-rail');
    if (!host || host.dataset.fallback !== 'true') return;

    const anchor = anchorEl || findSideAppAnchors()[0];
    if (!anchor) {
      host.style.top = '120px';
      host.style.right = '8px';
      return;
    }

    const rect = anchor.getBoundingClientRect();
    host.style.top = `${Math.max(80, Math.round(rect.top))}px`;
    host.style.right = `${Math.max(4, Math.round(window.innerWidth - rect.right))}px`;
  }

  function getRailMountTarget() {
    const rail = findRailByStructure();
    if (rail) return rail;
    return ensureFallbackRailHost();
  }

  function createRailButton() {
    const shell = document.createElement('div');
    shell.className = 'gp-sidebar-btn-shell';

    const indicator = document.createElement('span');
    indicator.className = 'gp-sidebar-btn__indicator';
    indicator.setAttribute('aria-hidden', 'true');

    const btn = document.createElement('button');
    btn.id = 'gp-sidebar-btn';
    btn.type = 'button';
    btn.title = 'My Tasks';
    btn.setAttribute('aria-label', 'Open My Tasks');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 6h11"></path>
      <path d="M9 12h11"></path>
      <path d="M9 18h11"></path>
      <polyline points="4 6 5 7 7 5"></polyline>
      <polyline points="4 12 5 13 7 11"></polyline>
      <polyline points="4 18 5 19 7 17"></polyline>
    </svg>`;
    btn.addEventListener('click', () => {
      handleToggleRequest();
    });

    shell.append(indicator, btn);
    return shell;
  }

  function getRailButtonShell() {
    const btn = document.getElementById('gp-sidebar-btn');
    return btn?.closest('.gp-sidebar-btn-shell') || null;
  }

  function ensureRailButtonShell(btn) {
    if (!btn) return null;

    const existingShell = btn.closest('.gp-sidebar-btn-shell');
    if (existingShell) return existingShell;

    const shell = document.createElement('div');
    shell.className = 'gp-sidebar-btn-shell';

    const indicator = document.createElement('span');
    indicator.className = 'gp-sidebar-btn__indicator';
    indicator.setAttribute('aria-hidden', 'true');

    const parent = btn.parentElement;
    if (!parent) return null;

    parent.insertBefore(shell, btn);
    shell.append(indicator, btn);
    return shell;
  }

  function syncRailButtonState() {
    const btn = document.getElementById('gp-sidebar-btn');
    const shell = getRailButtonShell();
    const panel = document.getElementById('gp-panel');
    if (!btn || !panel) return;

    const isOpen = panel.classList.contains('open');
    btn.classList.toggle('active', isOpen);
    btn.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
    shell?.classList.toggle('is-active', isOpen);
  }

  function placeRailButton(rail, buttonNode) {
    const shell = buttonNode.classList?.contains('gp-sidebar-btn-shell')
      ? buttonNode
      : buttonNode.closest('.gp-sidebar-btn-shell') || buttonNode;

    if (shell.parentElement !== rail || rail.firstElementChild !== shell) {
      rail.prepend(shell);
    }
  }

  function mountRailButton() {
    const existing = document.getElementById('gp-sidebar-btn');
    const existingShell = getRailButtonShell();
    const rail = getRailMountTarget();

    if (existing) {
      const shell = ensureRailButtonShell(existing) || existingShell || existing;
      placeRailButton(rail, shell);

      if (rail.id === 'gp-sidebar-rail') {
        positionFallbackRail();
      } else {
        const fallback = document.getElementById('gp-sidebar-rail');
        if (fallback) fallback.remove();
      }

      syncRailButtonState();
      return;
    }

    if (rail.id === 'gp-sidebar-rail') {
      positionFallbackRail();
    }

    placeRailButton(rail, createRailButton());
    syncRailButtonState();
  }

  function setupRailObserver() {
    const scheduleMount = () => {
      if (railMountDebounce) clearTimeout(railMountDebounce);
      railMountDebounce = setTimeout(() => {
        railMountDebounce = null;
        mountRailButton();
      }, 120);
    };

    const observer = new MutationObserver(scheduleMount);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleMount);
    scheduleMount();
  }

  function getCalendarMainEl() {
    if (cachedCalendarMainEl && document.contains(cachedCalendarMainEl)) {
      return cachedCalendarMainEl;
    }

    const candidates = [...document.querySelectorAll('[role="main"], main')]
      .filter((el) => !el.closest('.mytasks-sidebar, .mytasks-native-tasks-layout, #gp-panel'))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width >= 280 && rect.height >= 200;
      })
      .sort((left, right) => (
        (right.clientWidth * right.clientHeight) - (left.clientWidth * left.clientHeight)
      ));

    cachedCalendarMainEl = candidates[0] || null;
    return cachedCalendarMainEl;
  }

  function getGoogleAppRailInset() {
    const rail = findRailByStructure();
    if (!rail || rail.id === 'gp-sidebar-rail') return 56;

    const rect = rail.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 40) return 56;

    return Math.max(0, Math.round(window.innerWidth - rect.left));
  }

  function updateGpPanelChromeMetrics() {
    const panel = document.getElementById('gp-panel');
    const mainEl = getCalendarMainEl();
    const railInset = getGoogleAppRailInset();
    let top = 64;
    let height = Math.max(240, window.innerHeight - top - 8);
    let panelRight = railInset;

    if (mainEl) {
      const mainRect = mainEl.getBoundingClientRect();
      top = Math.max(0, Math.round(mainRect.top));
      height = Math.max(240, Math.round(mainRect.height));

      if (panel?.classList.contains('open')) {
        const flushRight = Math.round(
          window.innerWidth - mainRect.right - PANEL_WIDTH_PX - PANEL_CALENDAR_GAP_PX,
        );
        const anchoredNearRail = railInset + PANEL_RAIL_GAP_PX;
        panelRight = Math.min(flushRight, anchoredNearRail);
      }
    }

    const root = document.documentElement;
    root.style.setProperty('--gp-panel-top', `${top}px`);
    root.style.setProperty('--gp-panel-height', `${height}px`);
    root.style.setProperty('--gp-panel-right', `${panelRight}px`);
    root.style.setProperty('--gp-panel-rail-inset', `${railInset}px`);
    root.style.setProperty('--gp-panel-rail-gap', `${PANEL_RAIL_GAP_PX}px`);
    root.style.setProperty('--gp-panel-calendar-gap', `${PANEL_CALENDAR_GAP_PX}px`);
  }

  function setCalendarPushed(open) {
    const mainEl = getCalendarMainEl();
    if (!mainEl) return;

    mainEl.style.transition = MAIN_MARGIN_TRANSITION;
    const push = PANEL_WIDTH_PX + PANEL_CALENDAR_GAP_PX;
    mainEl.style.marginRight = open ? `${push}px` : '';
  }

  function clearGpSidebarInset() {
    document.querySelectorAll(`[${GP_SIDEBAR_INSET_ATTR}]`).forEach((el) => {
      const role = el.getAttribute(GP_SIDEBAR_INSET_ATTR);
      el.removeAttribute(GP_SIDEBAR_INSET_ATTR);
      const keys = GP_SIDEBAR_INSET_STYLE_KEYS[role];
      if (keys) keys.forEach((k) => el.style.removeProperty(k));
    });
  }

  function applyGpSidebarTaskSurfaceInsets() {
    /* Reserve space for the fixed extension panel on the native Tasks shell so the
       Kanban column strip is narrower than the board content and `.mytasks-kanban__board`
       can scroll horizontally (Calendar main margin alone does not always apply). */
    const layoutInsetRight = `${PANEL_WIDTH_PX + PANEL_CALENDAR_GAP_PX}px`;
    /* Cap Kanban width when Calendar main margin does not shrink the flex row (Tasks rail). */
    const kanbanMaxWidth = `min(100%, calc(100vw - ${PANEL_WIDTH_PX}px - ${PANEL_CALENDAR_GAP_PX}px - var(--gp-panel-rail-gap, 4px) - var(--gp-panel-rail-inset, 56px)))`;

    document.querySelectorAll('.mytasks-native-tasks-layout').forEach((el) => {
      if (el.closest('#gp-panel')) return;
      el.setAttribute(GP_SIDEBAR_INSET_ATTR, 'layout');
      el.style.setProperty('padding-right', layoutInsetRight, 'important');
      el.style.setProperty('box-sizing', 'border-box', 'important');
    });

    document.querySelectorAll('.mytasks-kanban').forEach((kanban) => {
      if (kanban.closest('#gp-panel')) return;
      const board = kanban.querySelector(':scope > .mytasks-kanban__board');
      if (!board) return;
      kanban.setAttribute(GP_SIDEBAR_INSET_ATTR, 'kanban');
      kanban.style.setProperty('min-width', '0', 'important');
      kanban.style.setProperty('max-width', kanbanMaxWidth, 'important');
      kanban.style.setProperty('overflow', 'hidden', 'important');
      board.setAttribute(GP_SIDEBAR_INSET_ATTR, 'board');
      board.style.setProperty('max-width', '100%', 'important');
      board.style.setProperty('overflow-x', 'auto', 'important');
      board.style.setProperty('overflow-y', 'auto', 'important');
      board.style.setProperty('box-sizing', 'border-box', 'important');
    });
  }

  function scheduleGpSidebarInsetReflow() {
    if (gpSidebarInsetReflowTimer) clearTimeout(gpSidebarInsetReflowTimer);
    gpSidebarInsetReflowTimer = setTimeout(() => {
      gpSidebarInsetReflowTimer = null;
      const panel = document.getElementById('gp-panel');
      if (!panel?.classList.contains('open')) return;
      clearGpSidebarInset();
      applyGpSidebarTaskSurfaceInsets();
      updateGpPanelChromeMetrics();
      if (activeNativeTasksHost?.isConnected) {
        syncKanbanHostSize(activeNativeTasksHost);
      }
    }, 50);
  }

  function syncGpSidebarLayout() {
    const panel = document.getElementById('gp-panel');
    const isOpen = Boolean(panel?.classList.contains('open'));

    updateGpPanelChromeMetrics();

    if (!isOpen && gpSidebarInsetReflowTimer) {
      clearTimeout(gpSidebarInsetReflowTimer);
      gpSidebarInsetReflowTimer = null;
    }

    clearGpSidebarInset();
    document.body.classList.toggle('gp-sidebar-open', isOpen);

    if (isOpen) {
      applyGpSidebarTaskSurfaceInsets();
      scheduleGpSidebarInsetReflow();
    }

    requestAnimationFrame(() => {
      updateGpPanelChromeMetrics();
      if (activeNativeTasksHost?.isConnected) {
        syncKanbanHostSize(activeNativeTasksHost);
      }
    });
  }

  function setupCalendarPushObserver() {
    const reapply = () => {
      const panel = document.getElementById('gp-panel');
      if (panel?.classList.contains('open')) {
        setCalendarPushed(true);
      } else {
        setCalendarPushed(false);
      }
      syncGpSidebarLayout();
    };

    const scheduleReapply = () => {
      if (calendarPushDebounce) clearTimeout(calendarPushDebounce);
      calendarPushDebounce = setTimeout(() => {
        calendarPushDebounce = null;
        if (cachedCalendarMainEl && !document.contains(cachedCalendarMainEl)) {
          cachedCalendarMainEl = null;
        }
        reapply();
      }, 120);
    };

    const observer = new MutationObserver(scheduleReapply);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', reapply);
  }

  const MONTH_LOOKUP = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };

  function normalizeDateOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function parseTaskDueDate(subtitleText) {
    if (!subtitleText) return null;

    const match = subtitleText.trim().match(/^Due\s+\w+,?\s+([A-Za-z]+)\s+(\d{1,2})$/i);
    if (!match) return null;

    const monthKey = match[1].trim().toLowerCase();
    const day = Number(match[2]);
    const month = MONTH_LOOKUP[monthKey];
    if (month === undefined || Number.isNaN(day)) return null;

    const now = new Date();
    let year = now.getFullYear();
    const candidate = new Date(year, month, day);
    if (candidate < normalizeDateOnly(now) && month < now.getMonth()) {
      year += 1;
    }

    return new Date(year, month, day);
  }

  function getTaskDueDate(row) {
    if (!row) return null;

    if (row.dataset.dueDate) {
      const [year, month, day] = row.dataset.dueDate.split('-').map(Number);
      if (year && month && day) {
        return new Date(year, month - 1, day);
      }
    }

    const subtitle = row.querySelector('.gp-task-subtitle')?.textContent;
    return parseTaskDueDate(subtitle);
  }

  function getDeadlineFolderKey(dueDate, now = new Date()) {
    if (!dueDate) return 'later';

    const dueDay = normalizeDateOnly(dueDate);
    const today = normalizeDateOnly(now);

    if (dueDay < today) return 'overdue';
    if (dueDay.getTime() === today.getTime()) return 'today';
    return 'later';
  }

  /**
   * Sidebar / filter bucket for a task using the current clock: calendar days
   * first; for "today" with a specific time (not all-day), past end of that
   * moment counts as overdue.
   */
  function getTaskSidebarFolderKey(task, now = new Date()) {
    const dayDate = getTaskDueDateFromCard(task);
    if (!dayDate || Number.isNaN(dayDate.getTime())) return 'later';

    const today = normalizeDateOnly(now);
    const dueDay = normalizeDateOnly(dayDate);

    if (dueDay < today) return 'overdue';
    if (dueDay > today) return 'later';

    const allDay = task?.allDay === true;
    const startHm = normalizeDueHm(task?.dueTimeStart || '');
    const endHm = normalizeDueHm(task?.dueTimeEnd || '');

    if (allDay || (!startHm && !endHm)) {
      return 'today';
    }

    const y = dueDay.getFullYear();
    const mo = dueDay.getMonth();
    const d = dueDay.getDate();
    const hmParts = (hm) => {
      const [h, m] = hm.split(':').map(Number);
      return new Date(y, mo, d, h, m, 0, 0);
    };

    const deadline = startHm ? hmParts(startHm) : hmParts(endHm);
    if (Number.isNaN(deadline.getTime())) return 'today';

    return deadline.getTime() < now.getTime() ? 'overdue' : 'today';
  }

  function setCheckboxUncheckedVisual(checkbox) {
    const icon = checkbox.querySelector('.gp-task-checkbox-icon');
    if (!icon) return;

    icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle>
    </svg>`;
    checkbox.classList.remove('gp-task-checkbox--checked');
  }

  function restoreTaskFromCompleted(chip) {
    const row = chip?.closest('.gp-task-row');
    const taskId = row?.dataset.taskId;
    const statusKey = chip?.dataset.status || 'planned';
    const panel = document.getElementById('gp-panel');

    if (!taskId || !panel || !row) {
      void syncSidebarTaskStatus(chip, statusKey);
      return;
    }

    clearGpFolderMoveAnimTimers();
    gpFolderMoveAnimPending = captureSidebarStatusRestoreAnimContext(panel, taskId);

    void syncSidebarTaskStatus(chip, statusKey).then((ok) => {
      if (!ok) gpFolderMoveAnimPending = null;
    });
  }

  async function syncSidebarTaskStatus(chip, statusKey) {
    const row = chip?.closest('.gp-task-row');
    const taskId = row?.dataset.taskId;
    const columnId = STATUS_COLUMN_MAP[statusKey];
    if (!taskId || !columnId) return false;

    const state = await loadKanbanState();
    if (!moveTaskInState(state, taskId, columnId)) return false;
    await saveKanbanState(state);
    return true;
  }

  function applyTaskStatus(chip, statusKey, options = {}) {
    const status = TASK_STATUSES[statusKey];
    if (!chip || !status) return;

    const row = chip.closest('.gp-task-row');
    const folder = row?.closest('.gp-task-folder');
    const folderKey = folder?.dataset.folder;

    chip.dataset.status = statusKey;
    chip.classList.remove(
      'gp-filter-chip--planned',
      'gp-filter-chip--progress',
      'gp-filter-chip--done',
    );
    chip.classList.add(status.className);

    const label = chip.querySelector('.gp-filter-chip-label');
    if (label) {
      label.textContent = status.label;
    }

    chip.setAttribute('aria-label', `Status: ${status.label}`);

    const menuBtn = chip.querySelector('.gp-filter-chip-menu-btn');
    if (menuBtn) {
      menuBtn.setAttribute('aria-label', `Change task status: ${status.label}`);
    }

    if (statusKey === 'done' && !options.skipComplete) {
      const checkbox = row?.querySelector('.gp-task-checkbox');
      if (row && folderKey !== 'completed' && checkbox) {
        completeTask(checkbox);
      }
      return;
    }

    if (folderKey === 'completed' && statusKey !== 'done' && !options.skipRestore) {
      restoreTaskFromCompleted(chip);
    }
  }

  function positionStatusMenu(trigger, menu, panel) {
    const chip = trigger?.closest('.gp-filter-chip');
    const anchorRect = chip?.getBoundingClientRect() || trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 208;
    const menuHeight = menu.offsetHeight || 156;
    const edgePadding = 8;

    const chipLeftInPanel = anchorRect.left - panelRect.left;
    const maxLeft = panelRect.width - menuWidth - edgePadding;
    const minLeft = edgePadding;

    let left = chipLeftInPanel;
    if (left + menuWidth > panelRect.width - edgePadding) {
      left = anchorRect.right - panelRect.left - menuWidth;
    }
    left = Math.max(minLeft, Math.min(left, maxLeft));

    let top = anchorRect.bottom - panelRect.top + 4;
    if (top + menuHeight > panelRect.height - edgePadding) {
      top = anchorRect.top - panelRect.top - menuHeight - 4;
    }
    top = Math.max(edgePadding, Math.min(top, panelRect.height - menuHeight - edgePadding));

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  function initTaskStatusMenus(panel) {
    const menu = panel.querySelector('#gp-status-menu');
    const accordion = panel.querySelector('#gp-tasks-accordion');
    const scrollContainer = panel.querySelector('.gp-card');
    if (!menu || !accordion || !scrollContainer || menu.dataset.wired === 'true') return;

    menu.dataset.wired = 'true';
    let activeTrigger = null;
    let activeChip = null;

    const closeStatusMenu = () => {
      if (activeTrigger) {
        activeTrigger.setAttribute('aria-expanded', 'false');
      }

      activeTrigger = null;
      activeChip = null;
      menu.classList.remove('gp-status-menu--open');
      menu.hidden = true;
      menu.setAttribute('aria-hidden', 'true');
    };

    const isStatusMenuOpen = () => menu.classList.contains('gp-status-menu--open');

    const openStatusMenu = (trigger) => {
      const chip = trigger?.closest('.gp-filter-chip');
      if (!chip || trigger.disabled || chip.closest('.gp-task-row--departing')) return;

      if (activeTrigger === trigger && isStatusMenuOpen()) {
        closeStatusMenu();
        return;
      }

      if (activeTrigger) {
        activeTrigger.setAttribute('aria-expanded', 'false');
      }

      activeTrigger = trigger;
      activeChip = chip;
      const currentStatus = chip.dataset.status || 'planned';

      menu.querySelectorAll('.gp-status-menu-item').forEach((item) => {
        const selected = item.dataset.status === currentStatus;
        item.setAttribute('aria-checked', selected ? 'true' : 'false');
      });

      menu.hidden = false;
      menu.setAttribute('aria-hidden', 'false');
      menu.classList.add('gp-status-menu--open');
      trigger.setAttribute('aria-expanded', 'true');

      requestAnimationFrame(() => {
        positionStatusMenu(trigger, menu, panel);
      });
    };

    menu.addEventListener('pointerdown', (event) => {
      const item = event.target.closest('.gp-status-menu-item');
      if (!item || !activeChip) return;

      event.preventDefault();
      event.stopPropagation();

      const chip = activeChip;
      const statusKey = item.dataset.status;
      const folderKey = chip.closest('.gp-task-row')?.closest('.gp-task-folder')?.dataset.folder;
      closeStatusMenu();
      applyTaskStatus(chip, statusKey);
      if (statusKey !== 'done' && folderKey !== 'completed') {
        void syncSidebarTaskStatus(chip, statusKey);
      }
    });

    accordion.addEventListener('click', (event) => {
      const chip = event.target.closest('.gp-filter-chip');
      if (!chip || !accordion.contains(chip)) return;
      const trigger = chip.querySelector('.gp-filter-chip-menu-btn');
      if (!trigger || trigger.disabled || chip.closest('.gp-task-row--departing')) return;

      event.preventDefault();
      event.stopPropagation();
      openStatusMenu(trigger);
    });

    panel.addEventListener('click', (event) => {
      if (!isStatusMenuOpen()) return;
      if (menu.contains(event.target) || event.target.closest('.gp-filter-chip')) return;
      closeStatusMenu();
    });

    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeStatusMenu();
      }
    });

    window.addEventListener('resize', () => {
      if (!activeTrigger || !isStatusMenuOpen()) return;
      positionStatusMenu(activeTrigger, menu, panel);
    });

    scrollContainer.addEventListener(
      'scroll',
      () => {
        if (!activeTrigger || !isStatusMenuOpen()) return;
        positionStatusMenu(activeTrigger, menu, panel);
      },
      { passive: true }
    );

    closeTaskStatusMenu = closeStatusMenu;
  }

  function getFolderTaskCount(folder) {
    const inner = folder?.querySelector('.gp-task-folder-panel-inner');
    if (!inner) return 0;

    return inner.querySelectorAll('.gp-task-row:not(.gp-task-row--departing)').length;
  }

  function syncFolderCount(folder) {
    const label = folder?.querySelector('.gp-task-folder-label');
    const folderKey = folder?.dataset.folder;
    const title = FOLDER_LABELS[folderKey];
    if (!label || !title) return;

    label.textContent = `${title} (${getFolderTaskCount(folder)})`;
    syncFolderEmptyState(folder);
  }

  function syncFolderEmptyState(folder) {
    const inner = folder?.querySelector('.gp-task-folder-panel-inner');
    if (!inner) return;

    const shouldShow = folder.classList.contains('open') && getFolderTaskCount(folder) === 0;
    let emptyState = inner.querySelector('.gp-task-folder-empty');

    if (!shouldShow) {
      emptyState?.remove();
      return;
    }

    if (!emptyState) {
      emptyState = document.createElement('p');
      emptyState.className = 'gp-task-folder-empty';
      emptyState.textContent = 'All Done!';
      inner.appendChild(emptyState);
    }
  }

  function syncFolderCounts(root) {
    if (!root) return;

    root.querySelectorAll('.gp-task-folder').forEach((folder) => {
      syncFolderCount(folder);
    });
  }

  function setCheckboxCheckedVisual(checkbox) {
    const icon = checkbox.querySelector('.gp-task-checkbox-icon');
    if (!icon) return;

    icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="currentColor" stroke="currentColor" stroke-width="2"></circle>
      <path d="M8 12.25l2.25 2.25L16 8.75" stroke="var(--m3-on-primary, #ffffff)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>`;
    checkbox.classList.add('gp-task-checkbox--checked');
  }

  function getConfettiColors(panel) {
    const styles = getComputedStyle(panel);
    return [
      styles.getPropertyValue('--m3-primary').trim(),
      styles.getPropertyValue('--m3-on-course-psych-container').trim(),
      styles.getPropertyValue('--m3-on-course-cogs-container').trim(),
      styles.getPropertyValue('--m3-on-secondary-container').trim(),
      styles.getPropertyValue('--m3-chip-progress-outline').trim(),
      styles.getPropertyValue('--m3-chip-planned-outline').trim(),
    ].filter(Boolean);
  }

  function spawnConfetti(panel, x, y) {
    const burst = document.createElement('div');
    burst.className = 'gp-confetti-burst';
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;

    const colors = getConfettiColors(panel);
    for (let i = 0; i < 26; i += 1) {
      const piece = document.createElement('span');
      piece.className = 'gp-confetti-piece';
      piece.style.setProperty('--gp-confetti-x', `${(Math.random() - 0.5) * 160}px`);
      piece.style.setProperty('--gp-confetti-y', `${-48 - Math.random() * 140}px`);
      piece.style.setProperty('--gp-confetti-rotation', `${Math.random() * 720 - 360}deg`);
      piece.style.background = colors[i % colors.length] || 'currentColor';
      piece.style.animationDelay = `${Math.random() * 140}ms`;
      burst.appendChild(piece);
    }

    panel.appendChild(burst);
    window.setTimeout(() => {
      burst.remove();
    }, TASK_COMPLETE_ANIM_MS + 500);
  }

  function ensureFolderMoveLayer(panel) {
    const card = panel?.querySelector('.gp-card');
    if (!card) return null;
    let layer = card.querySelector('.gp-folder-move-layer');
    if (layer) return layer;

    layer = document.createElement('div');
    layer.className = 'gp-folder-move-layer';
    layer.setAttribute('aria-hidden', 'true');
    card.appendChild(layer);
    return layer;
  }

  function completeTask(checkbox) {
    const row = checkbox.closest('.gp-task-row');
    const sourceFolder = row?.closest('.gp-task-folder');
    const accordion = row?.closest('#gp-tasks-accordion');
    const completedFolder = accordion?.querySelector('[data-folder="completed"]');
    const completedInner = completedFolder?.querySelector('.gp-task-folder-panel-inner');
    const panel = row?.closest('#gp-panel');

    if (!row || !sourceFolder || !completedFolder || !completedInner || !panel || sourceFolder === completedFolder) {
      return;
    }

    if (row.dataset.completing === 'true' || checkbox.disabled) {
      return;
    }

    clearGpFolderMoveAnimTimers();

    row.dataset.completing = 'true';
    checkbox.disabled = true;
    setCheckboxCheckedVisual(checkbox);

    const statusChip = row.querySelector('.gp-filter-chip');
    if (statusChip) {
      applyTaskStatus(statusChip, 'done', { skipComplete: true });
    }

    if (closeTaskStatusMenu) {
      closeTaskStatusMenu();
    }

    const checkboxRect = checkbox.getBoundingClientRect();
    const { ghost, fromRect } = createSidebarTaskFlyGhost(row);
    const sourceFolderKey = sourceFolder.dataset.folder;
    const oldIdx = SIDEBAR_FOLDER_ORDER.indexOf(sourceFolderKey);
    const newIdx = SIDEBAR_FOLDER_ORDER.indexOf('completed');
    const folderCountsBefore = {};
    SIDEBAR_FOLDER_ORDER.forEach((k) => {
      const f = accordion.querySelector(`[data-folder="${k}"]`);
      folderCountsBefore[k] = getFolderTaskCount(f);
    });

    row.classList.add('gp-task-row--completed');
    insertSidebarRowInSortedFolder(completedInner, row);
    syncFolderCounts(accordion);

    spawnConfetti(
      panel,
      checkboxRect.left + checkboxRect.width / 2,
      checkboxRect.top + checkboxRect.height / 2,
    );

    const taskId = row.dataset.taskId;
    runSidebarTaskFlyAnim(panel, accordion, {
      ghost,
      fromRect,
      destRow: row,
      destFolder: completedFolder,
      destFolderKey: 'completed',
      oldIdx,
      newIdx,
      folderCountsBefore,
      onComplete: () => {
        row.dataset.completing = 'false';
        checkbox.disabled = false;
        if (taskId) {
          gpSidebarScrollToTaskIdPending = taskId;
          void loadKanbanState().then((state) => {
            if (!moveTaskInState(state, taskId, 'done')) {
              gpSidebarScrollToTaskIdPending = null;
              return state;
            }
            return saveKanbanState(state, { skipSidebarRender: true });
          }).then(() => {
            gpSidebarScrollToTaskIdPending = null;
          });
        }
      },
    });
  }

  function initTaskCompletion(root) {
    if (!root || root.dataset.completionWired === 'true') return;
    root.dataset.completionWired = 'true';

    root.addEventListener('click', (event) => {
      const checkbox = event.target.closest('.gp-task-checkbox');
      if (!checkbox || !root.contains(checkbox)) return;

      const row = checkbox.closest('.gp-task-row');
      const folder = row?.closest('.gp-task-folder');
      if (!row || folder?.dataset.folder === 'completed') return;

      event.preventDefault();
      completeTask(checkbox);
    });
  }

  function createDefaultKanbanCard(id, chip, dueDate = '2026-05-21') {
    return {
      id,
      title: 'Project Outline',
      dueDate,
      due: formatKanbanDueLabel(dueDate),
      chip,
      chipColor: KANBAN_CHIP_COLORS[chip] || 'blue',
      starred: false,
      notes: '',
      subtasks: [],
    };
  }

  const KANBAN_CHIP_COLOR_KEYS = ['blue', 'red', 'green', 'yellow', 'purple', 'orange', 'teal', 'grey', 'custom'];

  function resolveKanbanChipColor(chip, chipColor, legacyCourseKey) {
    if (chipColor && KANBAN_CHIP_COLOR_KEYS.includes(chipColor)) {
      return chipColor;
    }

    return KANBAN_CHIP_COLORS[chip]
      || KANBAN_LEGACY_CHIP_COLORS[legacyCourseKey]
      || 'blue';
  }

  function formatDueDateIso(date) {
    if (!date || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDueDateIsoLocal(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatCreateTaskDateLong(iso) {
    const d = parseDueDateIsoLocal(iso);
    if (!d) return 'Select date';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function formatTimeCompact12(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return '';
    const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return '';
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return '';
    const dt = new Date(2000, 0, 1, h, min);
    return dt
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      .replace(/\s/g, '')
      .toLowerCase();
  }

  function normalizeDueHm(v) {
    if (!v || typeof v !== 'string') return '';
    const s = v.trim();
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : '';
  }

  /** Accepts 24h (18:30), 12h with minutes (6:30pm), or hour-only (6pm). Returns '' if invalid. */
  function parseFlexibleTimeToHm(raw) {
    if (raw == null) return '';
    const s = String(raw).trim().toLowerCase().replace(/\./g, '');
    if (!s) return '';
    let m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (m) {
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h > 23 || min > 59) return '';
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
    m = s.match(/^([1-9]|1[0-2]):([0-5]\d)\s*([ap])m$/);
    if (m) {
      let h = Number(m[1]);
      const min = Number(m[2]);
      const ap = m[3];
      if (ap === 'a' && h === 12) h = 0;
      else if (ap === 'p' && h !== 12) h += 12;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
    m = s.match(/^([1-9]|1[0-2])\s*([ap])m$/);
    if (m) {
      let h = Number(m[1]);
      const ap = m[2];
      if (ap === 'a' && h === 12) h = 0;
      else if (ap === 'p' && h !== 12) h += 12;
      return `${String(h).padStart(2, '0')}:00`;
    }
    return '';
  }

  const CREATE_TASK_TIME_STEP_MIN = 15;

  let gpCtTimePopField = null;

  function nearestCreateTaskTimeHm(hm) {
    const normalized = normalizeDueHm(hm);
    if (!normalized) return '';
    const [h, m] = normalized.split(':').map(Number);
    let total = h * 60 + m;
    total = Math.round(total / CREATE_TASK_TIME_STEP_MIN) * CREATE_TASK_TIME_STEP_MIN;
    if (total >= 24 * 60) total = 24 * 60 - CREATE_TASK_TIME_STEP_MIN;
    const rh = Math.floor(total / 60);
    const rm = total % 60;
    return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
  }

  function getCreateTaskTimeHm(field) {
    const id = field === 'end' ? 'gp-ct-time-end' : 'gp-ct-time-start';
    return normalizeDueHm(document.getElementById(id)?.value || '');
  }

  function setCreateTaskTimeField(field, hm) {
    const normalized = nearestCreateTaskTimeHm(hm) || normalizeDueHm(hm);
    const valueEl = document.getElementById(field === 'end' ? 'gp-ct-time-end' : 'gp-ct-time-start');
    const labelEl = document.getElementById(field === 'end' ? 'gp-ct-time-end-label' : 'gp-ct-time-start-label');
    if (valueEl) valueEl.value = normalized;
    if (labelEl) labelEl.textContent = formatTimeCompact12(normalized);
  }

  function setCreateTaskTimeFieldsFromHm(startHm, endHm) {
    setCreateTaskTimeField('start', nearestCreateTaskTimeHm(startHm) || '18:30');
    setCreateTaskTimeField('end', nearestCreateTaskTimeHm(endHm) || '19:30');
  }

  function ensureCreateTaskTimeList() {
    const list = document.getElementById('gp-ct-time-list');
    if (!list || list.dataset.gpBuilt) return;
    const frag = document.createDocumentFragment();
    for (let mins = 0; mins < 24 * 60; mins += CREATE_TASK_TIME_STEP_MIN) {
      const h = Math.floor(mins / 60);
      const min = mins % 60;
      const hm = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'gp-ct-time-opt';
      opt.dataset.hm = hm;
      opt.setAttribute('role', 'option');
      opt.textContent = formatTimeCompact12(hm);
      frag.appendChild(opt);
    }
    list.appendChild(frag);
    list.dataset.gpBuilt = '1';
  }

  function closeCreateTaskTimePop() {
    const pop = document.getElementById('gp-ct-time-pop');
    if (pop) pop.hidden = true;
    document.querySelectorAll('.gp-ct-time-btn.is-open').forEach((btn) => {
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    });
    gpCtTimePopField = null;
  }

  function positionCreateTaskTimePop() {
    const pop = document.getElementById('gp-ct-time-pop');
    const btn = gpCtTimePopField === 'end'
      ? document.getElementById('gp-ct-time-end-btn')
      : document.getElementById('gp-ct-time-start-btn');
    if (!btn || !pop || pop.hidden) return;
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth || 132;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    const list = document.getElementById('gp-ct-time-list');
    const listH = list ? Math.min(list.scrollHeight + 16, 280) : 240;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    let top = r.bottom + 4;
    if (spaceBelow < listH && spaceAbove > spaceBelow) {
      top = Math.max(8, r.top - listH - 4);
    }
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  function highlightCreateTaskTimePopSelection(hm) {
    const list = document.getElementById('gp-ct-time-list');
    if (!list) return;
    list.querySelectorAll('.gp-ct-time-opt').forEach((opt) => {
      const sel = opt.dataset.hm === hm;
      opt.classList.toggle('is-selected', sel);
      opt.setAttribute('aria-selected', sel ? 'true' : 'false');
    });
  }

  function scrollCreateTaskTimePopToHm(hm) {
    const list = document.getElementById('gp-ct-time-list');
    if (!list) return;
    const opt = list.querySelector(`.gp-ct-time-opt[data-hm="${hm}"]`);
    if (!opt) return;
    const targetTop = opt.offsetTop - (list.clientHeight - opt.offsetHeight) / 2;
    list.scrollTop = Math.max(0, targetTop);
  }

  function openCreateTaskTimePop(field) {
    closeCreateTaskCalendar();
    closeCreateTaskTimePop();
    ensureCreateTaskTimeList();
    gpCtTimePopField = field;
    const btn = document.getElementById(field === 'end' ? 'gp-ct-time-end-btn' : 'gp-ct-time-start-btn');
    const pop = document.getElementById('gp-ct-time-pop');
    const hm = getCreateTaskTimeHm(field) || (field === 'start' ? '18:30' : '19:30');
    highlightCreateTaskTimePopSelection(hm);
    if (pop) pop.hidden = false;
    if (btn) {
      btn.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    }
    requestAnimationFrame(() => {
      positionCreateTaskTimePop();
      scrollCreateTaskTimePopToHm(hm);
    });
  }

  function toggleCreateTaskTimePop(field) {
    const pop = document.getElementById('gp-ct-time-pop');
    if (pop && !pop.hidden && gpCtTimePopField === field) {
      closeCreateTaskTimePop();
    } else {
      openCreateTaskTimePop(field);
    }
  }

  function formatKanbanDueWithTimes(isoDate, startHm, endHm) {
    const base = formatKanbanDueLabel(isoDate);
    const a = formatTimeCompact12(normalizeDueHm(startHm));
    const b = formatTimeCompact12(normalizeDueHm(endHm));
    if (a && b) return `${base} · ${a}–${b}`;
    if (a) return `${base} · ${a}`;
    return base;
  }

  let gpCtCalViewMonth = null;
  let gpMkDueCalViewMonth = null;
  let gpMkDueSidebarScrollRaf = null;
  /** @type {{ anchor: HTMLElement, taskId: string } | null} */
  let gpMkDueEditorTarget = null;
  /** @type {{ dueDate: string, dueTimeStart: string, dueTimeEnd: string, allDay: boolean } | null} */
  let gpMkDueEditorDraft = null;
  /** @type {null | { taskId: string, oldFolder: string, newFolder: string, fromRect: DOMRect, ghost: HTMLElement, folderCountsBefore: Record<string, number> }} */
  let gpFolderMoveAnimPending = null;
  /** @type {null | (() => void)} */
  let gpFolderMoveAnimClearTimers = null;
  /** @type {null | number} */
  let gpFolderMoveAnimRaf = null;
  /** @type {null | string} */
  let gpSidebarScrollToTaskIdPending = null;

  function getCreateTaskDueIso() {
    return document.getElementById('gp-ct-due-date')?.value || '';
  }

  function setCreateTaskDueIso(iso) {
    const inp = document.getElementById('gp-ct-due-date');
    if (inp) inp.value = iso || '';
    const label = document.getElementById('gp-ct-date-btn-label');
    if (label) label.textContent = formatCreateTaskDateLong(inp?.value || '');
  }

  function syncCreateTaskAllDayUi() {
    const checked = Boolean(document.getElementById('gp-ct-allday')?.checked);
    const cluster = document.querySelector('.gp-ct-date-cluster');
    if (cluster) cluster.classList.toggle('is-all-day', checked);
    if (checked) closeCreateTaskTimePop();
  }

  function resetCreateTaskAllDay() {
    const cb = document.getElementById('gp-ct-allday');
    if (cb) cb.checked = false;
    syncCreateTaskAllDayUi();
  }

  function closeCreateTaskCalendar() {
    const pop = document.getElementById('gp-ct-cal-pop');
    const btn = document.getElementById('gp-ct-date-btn');
    if (pop) pop.hidden = true;
    if (btn) {
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  function positionCreateTaskCalendar() {
    const btn = document.getElementById('gp-ct-date-btn');
    const pop = document.getElementById('gp-ct-cal-pop');
    if (!btn || !pop || pop.hidden) return;
    const r = btn.getBoundingClientRect();
    const w = 288;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${r.bottom + 4}px`;
  }

  function openCreateTaskCalendar() {
    closeMkDueEditor();
    closeCreateTaskTimePop();
    const pop = document.getElementById('gp-ct-cal-pop');
    const btn = document.getElementById('gp-ct-date-btn');
    const iso = getCreateTaskDueIso();
    const base = parseDueDateIsoLocal(iso) || new Date();
    gpCtCalViewMonth = new Date(base.getFullYear(), base.getMonth(), 1);
    renderCreateTaskCalendar();
    if (pop) pop.hidden = false;
    if (btn) {
      btn.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    }
    requestAnimationFrame(() => positionCreateTaskCalendar());
  }

  function renderCreateTaskCalendar() {
    const pop = document.getElementById('gp-ct-cal-pop');
    const grid = document.getElementById('gp-ct-cal-grid');
    const mo = document.getElementById('gp-ct-cal-month-label');
    if (!pop || !grid || !mo) return;

    const selIso = getCreateTaskDueIso();
    const selected = parseDueDateIsoLocal(selIso);

    const view = gpCtCalViewMonth && !Number.isNaN(gpCtCalViewMonth.getTime())
      ? gpCtCalViewMonth
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    mo.textContent = view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const y = view.getFullYear();
    const m = view.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevTail = firstDow;
    const prevMonthLast = new Date(y, m, 0).getDate();

    grid.innerHTML = '';
    const totalCells = Math.ceil((prevTail + daysInMonth) / 7) * 7;
    for (let i = 0; i < totalCells; i += 1) {
      const dayNum = i - prevTail + 1;
      let cellDate;
      let muted = false;
      if (i < prevTail) {
        cellDate = new Date(y, m - 1, prevMonthLast - prevTail + i + 1);
        muted = true;
      } else if (dayNum > daysInMonth) {
        cellDate = new Date(y, m + 1, dayNum - daysInMonth);
        muted = true;
      } else {
        cellDate = new Date(y, m, dayNum);
      }

      const iso = formatDueDateIso(cellDate);
      const isSel = selected
        && cellDate.getFullYear() === selected.getFullYear()
        && cellDate.getMonth() === selected.getMonth()
        && cellDate.getDate() === selected.getDate();

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gp-ct-cal-cell';
      if (muted) b.classList.add('is-muted');
      if (isSel) b.classList.add('is-selected');
      b.textContent = String(cellDate.getDate());
      b.dataset.iso = iso;
      grid.appendChild(b);
    }
  }


  function formatDueFromDraft(draft) {
    if (!draft) return '';
    if (draft.allDay) return formatKanbanDueLabel(draft.dueDate);
    return formatKanbanDueWithTimes(draft.dueDate, draft.dueTimeStart, draft.dueTimeEnd);
  }

  function getActiveInlineSchedule() {
    return gpMkDueEditorTarget?.scheduleEl || null;
  }

  /** Find schedule UI nodes whether they live in the card or the body portal. */
  function queryMkDueSchedulePart(scheduleEl, selector) {
    if (!scheduleEl || !selector) return null;
    const inCard = scheduleEl.querySelector(selector);
    if (inCard) return inCard;
    return document.getElementById('gp-mk-due-portal')?.querySelector(selector) || null;
  }

  function getMkDuePortal() {
    let portal = document.getElementById('gp-mk-due-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'gp-mk-due-portal';
      portal.setAttribute('aria-hidden', 'true');
      document.body.appendChild(portal);
    }
    return portal;
  }

  function mountMkDueDropdownToPortal(el, mountKey) {
    const target = gpMkDueEditorTarget;
    if (!el || !target) return;
    if (!target[mountKey]) {
      target[mountKey] = { parent: el.parentElement, next: el.nextSibling };
    }
    const portal = getMkDuePortal();
    if (el.parentElement !== portal) portal.appendChild(el);
  }

  function restoreMkDueDropdownFromPortal(el, mountKey) {
    const target = gpMkDueEditorTarget;
    const mount = target?.[mountKey];
    if (!el || !mount?.parent) return;
    if (el.parentElement === mount.parent) return;
    if (mount.next && mount.next.parentNode === mount.parent) {
      mount.parent.insertBefore(el, mount.next);
    } else {
      mount.parent.appendChild(el);
    }
    el.style.position = '';
    el.style.left = '';
    el.style.top = '';
    el.style.right = '';
    el.style.width = '';
    el.style.zIndex = '';
  }

  function getMkDueDropdownBoundaryRect() {
    const host = gpMkDueEditorTarget?.host;
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return rect;
  }

  function positionMkDueFixedDropdown(el, anchorRect, options = {}) {
    if (!el || !anchorRect) return;

    const {
      preferredWidth = 288,
      minHeightEstimate = 300,
    } = options;

    const boundary = getMkDueDropdownBoundaryRect();
    const boundaryMargin = 4;
    let width = preferredWidth;
    if (boundary) {
      width = Math.min(width, Math.max(200, boundary.width - boundaryMargin * 2));
    }
    width = Math.min(width, window.innerWidth - 16);

    let left = anchorRect.left;
    if (boundary) {
      if (left + width > boundary.right - boundaryMargin) {
        left = boundary.right - width - boundaryMargin;
      }
      if (left < boundary.left + boundaryMargin) {
        left = boundary.left + boundaryMargin;
      }
    }
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

    const gap = 4;
    const viewportMargin = 8;
    el.style.position = 'fixed';
    el.style.left = `${left}px`;
    el.style.right = 'auto';
    el.style.width = `${width}px`;
    el.style.zIndex = '2147483647';

    const measuredHeight = el.getBoundingClientRect().height || el.offsetHeight || 0;
    const dropdownHeight = Math.max(measuredHeight, minHeightEstimate);
    let top = anchorRect.bottom + gap;
    if (top + dropdownHeight > window.innerHeight - viewportMargin) {
      const aboveTop = anchorRect.top - gap - dropdownHeight;
      if (aboveTop >= viewportMargin) {
        top = aboveTop;
      } else {
        top = Math.max(viewportMargin, window.innerHeight - dropdownHeight - viewportMargin);
      }
    }
    el.style.top = `${top}px`;
  }

  function getMkDueTimeAnchorRect(timeLink) {
    if (!timeLink) return null;
    const wrap = timeLink.closest('.gp-inline-schedule-time-wrap');
    const el = wrap || timeLink;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 && rect.height < 1) return timeLink.getBoundingClientRect();
    return rect;
  }

  function applyMkDueDropdownPosition(el, anchorRect, layout) {
    if (!el || !anchorRect) return;

    const {
      left,
      width,
      minHeightEstimate = 220,
    } = layout;

    const gap = 4;
    const viewportMargin = 8;
    el.style.position = 'fixed';
    el.style.left = `${left}px`;
    el.style.right = 'auto';
    el.style.width = `${width}px`;
    el.style.zIndex = '2147483647';
    el.style.opacity = '1';

    const measuredHeight = el.getBoundingClientRect().height || el.offsetHeight || 0;
    const dropdownHeight = Math.max(measuredHeight, minHeightEstimate);
    let top = anchorRect.bottom + gap;
    if (top + dropdownHeight > window.innerHeight - viewportMargin) {
      const aboveTop = anchorRect.top - gap - dropdownHeight;
      if (aboveTop >= viewportMargin) {
        top = aboveTop;
      } else {
        top = Math.max(viewportMargin, window.innerHeight - dropdownHeight - viewportMargin);
      }
    }
    el.style.top = `${top}px`;
  }

  function positionMkDueDateDropdown(cal, dateLink) {
    if (!cal || !dateLink) return;
    positionMkDueFixedDropdown(cal, dateLink.getBoundingClientRect(), {
      preferredWidth: 288,
      minHeightEstimate: 300,
    });
  }

  function positionMkDueTimePop(pop, btn) {
    if (!pop || !btn) return;
    const r = btn.getBoundingClientRect();
    const w = 132;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    const list = pop.querySelector('.gp-inline-schedule-time-list');
    const listH = list ? Math.min(list.scrollHeight + 16, 280) : 240;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    let top = r.bottom + 4;
    if (spaceBelow < listH && spaceAbove > spaceBelow) {
      top = Math.max(8, r.top - listH - 4);
    }
    pop.style.position = 'fixed';
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.width = `${w}px`;
    pop.style.right = 'auto';
    pop.style.bottom = 'auto';
    pop.style.transform = 'none';
  }

  function positionMkDueTimeDropdown(timeDropdown, timeLink) {
    if (!timeDropdown || !timeLink) return;

    const anchorRect = getMkDueTimeAnchorRect(timeLink);
    if (!anchorRect) return;

    const inSidebar = isMkDueEditorInSidebar();
    const columnWidth = 132;
    const preferredWidth = inSidebar ? columnWidth : 320;
    const boundary = getMkDueDropdownBoundaryRect();
    const margin = 8;

    let width = preferredWidth;
    let left = anchorRect.left;

    if (boundary) {
      const maxWidth = boundary.right - margin - left;
      if (maxWidth < width) {
        width = Math.max(columnWidth, maxWidth);
      }
      if (left + width > boundary.right - margin) {
        left = anchorRect.right - width;
      }
      if (left < boundary.left + margin) {
        left = Math.max(boundary.left + margin, boundary.right - margin - width);
      }
    }

    width = Math.min(width, window.innerWidth - 16);
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

    applyMkDueDropdownPosition(timeDropdown, anchorRect, {
      left,
      width,
      minHeightEstimate: inSidebar ? 240 : 220,
    });
  }

  function isMkDueEditorInSidebar() {
    return Boolean(gpMkDueEditorTarget?.host?.closest('#gp-panel'));
  }

  function getSidebarDueScrollContainer() {
    return document.querySelector('#gp-panel .gp-card');
  }

  function getMkDueDropdownScrollContainer() {
    if (isMkDueEditorInSidebar()) {
      return getSidebarDueScrollContainer();
    }
    const host = gpMkDueEditorTarget?.host;
    return host?.closest('.mk-column-cards') || null;
  }

  function ensureMkDueDropdownVisibleInScrollContainer() {
    const target = gpMkDueEditorTarget;
    const scrollEl = getMkDueDropdownScrollContainer();
    if (!target?.scheduleEl || !scrollEl) return;

    const scheduleEl = target.scheduleEl;
    const dateOpen = Boolean(target.dateDropdownOpen);
    const timeOpen = Boolean(target.timeDropdownOpen);
    const timePopField = target.timePopField;
    const anchorLink = dateOpen
      ? scheduleEl.querySelector('.gp-inline-schedule-date-link')
      : timePopField
        ? scheduleEl.querySelector(`.gp-inline-schedule-time-btn[data-time-field="${timePopField}"]`)
        : timeOpen
          ? scheduleEl.querySelector('.gp-inline-schedule-time-link')
          : null;
    if (!anchorLink) return;

    const dropdown = dateOpen
      ? queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-cal')
      : timePopField
        ? queryMkDueSchedulePart(
          scheduleEl,
          `.gp-inline-schedule-time-pop[data-time-field="${timePopField}"]`,
        )
        : queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-time-dropdown');
    if (!dropdown || dropdown.hidden) return;

    const padding = 12;
    const gap = 8;
    const anchorRect = anchorLink.getBoundingClientRect();
    const scrollRect = scrollEl.getBoundingClientRect();
    const measuredHeight = dropdown.getBoundingClientRect().height || dropdown.offsetHeight || 0;
    const dropdownHeight = Math.max(measuredHeight, dateOpen ? 300 : 220);
    const neededBottom = anchorRect.bottom + gap + dropdownHeight + padding;

    if (neededBottom > scrollRect.bottom) {
      scrollEl.scrollTop += neededBottom - scrollRect.bottom;
    }

    const host = target.host;
    if (host) {
      const hostRect = host.getBoundingClientRect();
      if (hostRect.top < scrollRect.top + padding) {
        scrollEl.scrollTop -= (scrollRect.top + padding) - hostRect.top;
      }
    }
  }

  function queueMkDueDropdownScrollAdjust() {
    if (!getMkDueDropdownScrollContainer()) return;
    if (gpMkDueSidebarScrollRaf) cancelAnimationFrame(gpMkDueSidebarScrollRaf);
    gpMkDueSidebarScrollRaf = requestAnimationFrame(() => {
      gpMkDueSidebarScrollRaf = requestAnimationFrame(() => {
        gpMkDueSidebarScrollRaf = null;
        ensureMkDueDropdownVisibleInScrollContainer();
        if (!gpMkDueEditorTarget) return;
        const scheduleEl = gpMkDueEditorTarget.scheduleEl;
        if (!scheduleEl) return;
        if (gpMkDueEditorTarget.dateDropdownOpen) {
          const cal = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-cal');
          const dateLink = scheduleEl.querySelector('.gp-inline-schedule-date-link');
          if (cal && dateLink) positionMkDueDateDropdown(cal, dateLink);
        } else if (gpMkDueEditorTarget.timePopField) {
          const field = gpMkDueEditorTarget.timePopField;
          const pop = queryMkDueSchedulePart(
            scheduleEl,
            `.gp-inline-schedule-time-pop[data-time-field="${field}"]`,
          );
          const btn = scheduleEl.querySelector(`.gp-inline-schedule-time-btn[data-time-field="${field}"]`);
          if (pop && btn) positionMkDueTimePop(pop, btn);
        } else if (gpMkDueEditorTarget.timeDropdownOpen) {
          const timeDropdown = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-time-dropdown');
          const timeLink = scheduleEl.querySelector('.gp-inline-schedule-time-link');
          if (timeDropdown && timeLink) positionMkDueTimeDropdown(timeDropdown, timeLink);
        }
      });
    });
  }

  function syncMkDueDropdownPortal() {
    const scheduleEl = getActiveInlineSchedule();
    const target = gpMkDueEditorTarget;
    if (!scheduleEl || !target) return;

    const cal = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-cal');
    const timeDropdown = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-time-dropdown');
    const dateLink = scheduleEl.querySelector('.gp-inline-schedule-date-link');
    const timeLink = scheduleEl.querySelector('.gp-inline-schedule-time-link');

    if (target.dateDropdownOpen && cal && dateLink) {
      mountMkDueDropdownToPortal(cal, 'calMount');
      positionMkDueDateDropdown(cal, dateLink);
    } else if (cal) {
      restoreMkDueDropdownFromPortal(cal, 'calMount');
    }

    if (scheduleEl.querySelector('.gp-inline-schedule-time-pop')) {
      ['start', 'end'].forEach((field) => {
        const pop = queryMkDueSchedulePart(
          scheduleEl,
          `.gp-inline-schedule-time-pop[data-time-field="${field}"]`,
        );
        const btn = scheduleEl.querySelector(`.gp-inline-schedule-time-btn[data-time-field="${field}"]`);
        const mountKey = `${field}TimePopMount`;
        if (target.timePopField === field && pop && btn) {
          mountMkDueDropdownToPortal(pop, mountKey);
          positionMkDueTimePop(pop, btn);
        } else if (pop) {
          restoreMkDueDropdownFromPortal(pop, mountKey);
        }
      });
    } else if (target.timeDropdownOpen && timeDropdown && timeLink) {
      mountMkDueDropdownToPortal(timeDropdown, 'timeMount');
      positionMkDueTimeDropdown(timeDropdown, timeLink);
    } else if (timeDropdown) {
      restoreMkDueDropdownFromPortal(timeDropdown, 'timeMount');
    }

    if (target.dateDropdownOpen || target.timeDropdownOpen || target.timePopField) {
      queueMkDueDropdownScrollAdjust();
    }
  }

  function fillInlineTimeList(listEl) {
    if (!listEl || listEl.dataset.gpBuilt) return;
    const frag = document.createDocumentFragment();
    for (let mins = 0; mins < 24 * 60; mins += CREATE_TASK_TIME_STEP_MIN) {
      const h = Math.floor(mins / 60);
      const min = mins % 60;
      const hm = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'gp-ct-time-opt';
      opt.dataset.hm = hm;
      opt.setAttribute('role', 'option');
      opt.textContent = formatTimeCompact12(hm);
      frag.appendChild(opt);
    }
    listEl.appendChild(frag);
    listEl.dataset.gpBuilt = '1';
  }


  function formatInlineScheduleDateLabel(iso) {
    return formatKanbanDueLabel(iso);
  }

  function formatInlineScheduleTimeLabel(draft) {
    if (!draft || draft.allDay) return 'All day';
    const layout = getDraftTimeLayout(draft);
    const start = formatTimeCompact12(normalizeDueHm(draft.dueTimeStart));
    const end = formatTimeCompact12(normalizeDueHm(draft.dueTimeEnd));
    if (layout === 'single') return start || end || '6:30pm';
    const a = start || '6:30pm';
    const b = end || '7:30pm';
    return `${a}–${b}`;
  }

  function getDraftTimeLayout(draft) {
    if (!draft || draft.allDay) return 'all-day';
    const hasStart = Boolean(normalizeDueHm(draft.dueTimeStart));
    const hasEnd = Boolean(normalizeDueHm(draft.dueTimeEnd));
    if (hasStart && hasEnd) return 'range';
    if (hasStart || hasEnd) return 'single';
    return 'all-day';
  }

  function getSingleTimeField(draft) {
    if (normalizeDueHm(draft?.dueTimeStart)) return 'start';
    if (normalizeDueHm(draft?.dueTimeEnd)) return 'end';
    return 'start';
  }

  function dueDraftFromTask(task) {
    const hasStart = Boolean(task?.dueTimeStart);
    const hasEnd = Boolean(task?.dueTimeEnd);
    const hasTimes = hasStart || hasEnd;
    const dueDate = task?.dueDate
      || formatDueDateIso(parseTaskDueDate(task?.due))
      || formatDueDateIso(new Date());
    return {
      dueDate,
      dueTimeStart: normalizeDueHm(task?.dueTimeStart) || '',
      dueTimeEnd: normalizeDueHm(task?.dueTimeEnd) || '',
      allDay: task?.allDay === true || !hasTimes,
    };
  }

  function dueDraftFromHost(host) {
    if (!host) return dueDraftFromTask(null);
    const dueDate = host.dataset.dueDate
      || formatDueDateIso(parseTaskDueDate(host.querySelector('.gp-inline-schedule-date-label')?.textContent))
      || formatDueDateIso(new Date());
    const dueTimeStart = normalizeDueHm(host.dataset.dueTimeStart || '');
    const dueTimeEnd = normalizeDueHm(host.dataset.dueTimeEnd || '');
    const hasTimes = Boolean(dueTimeStart || dueTimeEnd);
    return {
      dueDate,
      dueTimeStart,
      dueTimeEnd,
      allDay: host.dataset.allDay === 'true' || !hasTimes,
    };
  }

  function syncSidebarScheduleTimeUi(scheduleEl, draft) {
    const layout = getDraftTimeLayout(draft);
    const timeRow = scheduleEl.querySelector('.gp-inline-schedule-time-row');
    const toEl = scheduleEl.querySelector('.gp-inline-schedule-time-to');
    const startSlot = scheduleEl.querySelector('.gp-inline-schedule-time-slot[data-time-field="start"]');
    const endSlot = scheduleEl.querySelector('.gp-inline-schedule-time-slot[data-time-field="end"]');
    const startBtn = startSlot?.querySelector('.gp-inline-schedule-time-btn');
    const endBtn = endSlot?.querySelector('.gp-inline-schedule-time-btn');

    if (timeRow) timeRow.hidden = layout === 'all-day';

    const showStart = layout === 'range' || (layout === 'single' && getSingleTimeField(draft) === 'start');
    const showEnd = layout === 'range' || (layout === 'single' && getSingleTimeField(draft) === 'end');

    if (startSlot) startSlot.hidden = !showStart;
    if (endSlot) endSlot.hidden = !showEnd;
    if (toEl) toEl.hidden = layout !== 'range';

    if (startBtn) {
      startBtn.textContent = formatTimeCompact12(normalizeDueHm(draft.dueTimeStart)) || '6:30pm';
    }
    if (endBtn) {
      endBtn.textContent = formatTimeCompact12(normalizeDueHm(draft.dueTimeEnd)) || '7:30pm';
    }
  }

  function syncScheduleElFromDraft(scheduleEl, draft) {
    if (!scheduleEl || !draft) return;
    const dateLabel = scheduleEl.querySelector('.gp-inline-schedule-date-label');
    if (dateLabel) dateLabel.textContent = formatInlineScheduleDateLabel(draft.dueDate);
    const allday = scheduleEl.querySelector('.gp-inline-schedule-allday');
    if (allday) allday.checked = Boolean(draft.allDay);

    const layout = getDraftTimeLayout(draft);
    scheduleEl.classList.toggle('is-all-day', layout === 'all-day');
    scheduleEl.classList.toggle('is-single-time', layout === 'single');
    scheduleEl.classList.toggle('is-range-time', layout === 'range');

    if (scheduleEl.classList.contains('gp-inline-schedule--sidebar')) {
      syncSidebarScheduleTimeUi(scheduleEl, draft);
      const sumLabel = scheduleEl.querySelector(
        '.gp-inline-schedule-time-summary .gp-inline-schedule-time-label',
      );
      if (sumLabel) sumLabel.textContent = formatInlineScheduleTimeLabel(draft);
      return;
    }

    const timeLabel = scheduleEl.querySelector('.gp-inline-schedule-time-label');
    if (timeLabel) timeLabel.textContent = formatInlineScheduleTimeLabel(draft);
  }

  function hasStackedDueTimeSummary(scheduleEl) {
    return Boolean(scheduleEl?.querySelector('.gp-inline-schedule-time-summary'));
  }

  function mountDueScheduleInAnchor(anchor, task) {
    if (!anchor) return null;
    let scheduleEl = anchor.querySelector('.gp-inline-schedule');
    if (!scheduleEl) {
      scheduleEl = createSidebarInlineScheduleEditor();
      anchor.textContent = '';
      anchor.classList.add('has-inline-schedule');
      anchor.appendChild(scheduleEl);
    } else {
      if (!scheduleEl.querySelector('.gp-inline-schedule-time-row')) {
        const parent = scheduleEl.parentElement;
        const upgraded = createSidebarInlineScheduleEditor();
        parent.replaceChild(upgraded, scheduleEl);
        scheduleEl = upgraded;
      }
      scheduleEl.classList.add('gp-inline-schedule--sidebar');
    }
    syncScheduleElFromDraft(scheduleEl, dueDraftFromTask(task));
    return scheduleEl;
  }

  function buildInlineScheduleTimeSlot(field, ariaLabel) {
    const slot = document.createElement('span');
    slot.className = 'gp-inline-schedule-time-slot';
    slot.dataset.timeField = field;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gp-inline-schedule-time-btn';
    btn.dataset.timeField = field;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-label', ariaLabel);
    const pop = document.createElement('div');
    pop.className = 'gp-inline-schedule-time-pop gp-inline-schedule-dropdown';
    pop.dataset.timeField = field;
    pop.hidden = true;
    pop.setAttribute('role', 'listbox');
    const list = document.createElement('div');
    list.className = 'gp-ct-time-list gp-inline-schedule-time-list';
    list.dataset.timeField = field;
    fillInlineTimeList(list);
    pop.appendChild(list);
    slot.appendChild(btn);
    slot.appendChild(pop);
    return { slot, btn, pop, list };
  }

  function buildInlineScheduleDateWrap() {
    const dateWrap = document.createElement('span');
    dateWrap.className = 'gp-inline-schedule-date-wrap';
    const dateLink = document.createElement('button');
    dateLink.type = 'button';
    dateLink.className = 'gp-inline-schedule-date-link';
    dateLink.setAttribute('aria-expanded', 'false');
    dateLink.setAttribute('aria-haspopup', 'dialog');
    dateLink.setAttribute('aria-label', 'Due date');
    const dateLabel = document.createElement('span');
    dateLabel.className = 'gp-inline-schedule-date-label';
    dateLink.appendChild(dateLabel);

    const calPop = document.createElement('div');
    calPop.className = 'gp-ct-cal-pop gp-inline-schedule-cal gp-inline-schedule-dropdown';
    calPop.hidden = true;
    const calHead = document.createElement('div');
    calHead.className = 'gp-ct-cal-head';
    const calMo = document.createElement('span');
    calMo.className = 'gp-ct-cal-mo gp-inline-schedule-cal-month-label';
    const calNav = document.createElement('div');
    calNav.className = 'gp-ct-cal-nav';
    const calPrev = document.createElement('button');
    calPrev.type = 'button';
    calPrev.className = 'gp-ct-cal-nav-btn gp-inline-schedule-cal-prev';
    calPrev.setAttribute('aria-label', 'Previous month');
    calPrev.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    const calNext = document.createElement('button');
    calNext.type = 'button';
    calNext.className = 'gp-ct-cal-nav-btn gp-inline-schedule-cal-next';
    calNext.setAttribute('aria-label', 'Next month');
    calNext.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    const calClose = document.createElement('button');
    calClose.type = 'button';
    calClose.className = 'gp-ct-cal-nav-btn gp-inline-schedule-cal-close';
    calClose.setAttribute('aria-label', 'Close calendar');
    calClose.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    const calHeadActions = document.createElement('div');
    calHeadActions.className = 'gp-ct-cal-head-actions';
    calNav.appendChild(calPrev);
    calNav.appendChild(calNext);
    calHeadActions.appendChild(calNav);
    calHeadActions.appendChild(calClose);
    calHead.appendChild(calMo);
    calHead.appendChild(calHeadActions);
    const weekdays = document.createElement('div');
    weekdays.className = 'gp-ct-cal-weekdays';
    weekdays.setAttribute('aria-hidden', 'true');
    weekdays.innerHTML = '<span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>';
    const grid = document.createElement('div');
    grid.className = 'gp-ct-cal-grid gp-inline-schedule-cal-grid';
    calPop.appendChild(calHead);
    calPop.appendChild(weekdays);
    calPop.appendChild(grid);
    dateWrap.appendChild(dateLink);
    dateWrap.appendChild(calPop);
    return dateWrap;
  }

  function createSidebarInlineScheduleEditor() {
    const wrap = document.createElement('div');
    wrap.className = 'gp-inline-schedule gp-inline-schedule--sidebar';

    const links = document.createElement('div');
    links.className = 'gp-inline-schedule-links';

    const dateWrap = buildInlineScheduleDateWrap();

    const timeWrap = document.createElement('span');
    timeWrap.className = 'gp-inline-schedule-time-wrap';

    const timeSummaryLink = document.createElement('button');
    timeSummaryLink.type = 'button';
    timeSummaryLink.className = 'gp-inline-schedule-time-link gp-inline-schedule-time-summary';
    timeSummaryLink.setAttribute('aria-expanded', 'false');
    timeSummaryLink.setAttribute('aria-haspopup', 'dialog');
    timeSummaryLink.setAttribute('aria-label', 'Due time');
    const timeSummaryLabel = document.createElement('span');
    timeSummaryLabel.className = 'gp-inline-schedule-time-label';
    timeSummaryLink.appendChild(timeSummaryLabel);

    const timeRow = document.createElement('div');
    timeRow.className = 'gp-inline-schedule-time-row';
    const startSlot = buildInlineScheduleTimeSlot('start', 'Start time');
    const toEl = document.createElement('span');
    toEl.className = 'gp-inline-schedule-time-to';
    toEl.setAttribute('aria-hidden', 'true');
    toEl.textContent = 'to';
    const endSlot = buildInlineScheduleTimeSlot('end', 'End time');
    timeRow.appendChild(startSlot.slot);
    timeRow.appendChild(toEl);
    timeRow.appendChild(endSlot.slot);

    const alldayLabel = document.createElement('label');
    alldayLabel.className = 'gp-inline-schedule-allday-row';
    const alldayCb = document.createElement('input');
    alldayCb.type = 'checkbox';
    alldayCb.className = 'gp-inline-schedule-allday';
    const alldayText = document.createElement('span');
    alldayText.textContent = 'All day';
    alldayLabel.appendChild(alldayCb);
    alldayLabel.appendChild(alldayText);

    timeWrap.appendChild(timeSummaryLink);
    timeWrap.appendChild(timeRow);
    timeWrap.appendChild(alldayLabel);

    links.appendChild(dateWrap);
    links.appendChild(timeWrap);
    wrap.appendChild(links);
    return wrap;
  }

  function applyMkDueDropdownUi() {
    const scheduleEl = getActiveInlineSchedule();
    const target = gpMkDueEditorTarget;
    if (!scheduleEl || !target) return;
    const dateOpen = Boolean(target.dateDropdownOpen);
    const timeOpen = Boolean(target.timeDropdownOpen);
    const timePopField = target.timePopField;
    const stackedDueUi = hasStackedDueTimeSummary(scheduleEl);
    const cal = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-cal');
    const dateLink = scheduleEl.querySelector('.gp-inline-schedule-date-link');
    const timeDropdown = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-time-dropdown');
    const timeLink = scheduleEl.querySelector('.gp-inline-schedule-time-link');
    if (cal) {
      if (dateOpen) {
        cal.hidden = false;
        cal.removeAttribute('hidden');
      } else {
        cal.hidden = true;
      }
      cal.classList.toggle('is-open', dateOpen);
    }
    if (dateLink) {
      dateLink.classList.toggle('is-open', dateOpen);
      dateLink.setAttribute('aria-expanded', dateOpen ? 'true' : 'false');
    }
    if (stackedDueUi) {
      ['start', 'end'].forEach((field) => {
        const pop = queryMkDueSchedulePart(
          scheduleEl,
          `.gp-inline-schedule-time-pop[data-time-field="${field}"]`,
        );
        const btn = scheduleEl.querySelector(`.gp-inline-schedule-time-btn[data-time-field="${field}"]`);
        const open = timePopField === field;
        if (pop) {
          if (open) {
            pop.hidden = false;
            pop.removeAttribute('hidden');
          } else {
            pop.hidden = true;
          }
          pop.classList.toggle('is-open', open);
        }
        if (btn) {
          btn.classList.toggle('is-open', open);
          btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
      });
    } else if (timeDropdown) {
      if (timeOpen) {
        timeDropdown.hidden = false;
        timeDropdown.removeAttribute('hidden');
      } else {
        timeDropdown.hidden = true;
      }
      timeDropdown.classList.toggle('is-open', timeOpen);
    }
    if (timeLink) {
      const timeLinkOpen = stackedDueUi && timeLink.classList.contains('gp-inline-schedule-time-summary')
        ? Boolean(timePopField)
        : timeOpen;
      timeLink.classList.toggle('is-open', timeLinkOpen);
      timeLink.setAttribute('aria-expanded', timeLinkOpen ? 'true' : 'false');
    }
    scheduleEl.classList.toggle('is-date-dropdown-open', dateOpen);
    scheduleEl.classList.toggle(
      'is-time-dropdown-open',
      stackedDueUi ? Boolean(timePopField) : timeOpen,
    );
    if (gpMkDueEditorDraft) {
      syncScheduleElFromDraft(scheduleEl, gpMkDueEditorDraft);
    }
    syncMkDueDropdownPortal();
  }

  function closeInlineScheduleDropdowns(scheduleEl) {
    const se = scheduleEl || getActiveInlineSchedule();
    se?.classList.remove('is-time-edit-open');
    if (gpMkDueEditorTarget) {
      gpMkDueEditorTarget.dateDropdownOpen = false;
      gpMkDueEditorTarget.timeDropdownOpen = false;
      gpMkDueEditorTarget.timePopField = null;
    }
    if (se || getActiveInlineSchedule()) applyMkDueDropdownUi();
  }

  function closeMkDueEditor() {
    const target = gpMkDueEditorTarget;
    if (!target) return;
    const { dueBtn, scheduleEl } = target;
    closeInlineScheduleDropdowns(scheduleEl);
    const cal = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-cal');
    const timeDropdown = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-time-dropdown');
    if (cal) restoreMkDueDropdownFromPortal(cal, 'calMount');
    if (timeDropdown) restoreMkDueDropdownFromPortal(timeDropdown, 'timeMount');
    ['start', 'end'].forEach((field) => {
      const pop = queryMkDueSchedulePart(
        scheduleEl,
        `.gp-inline-schedule-time-pop[data-time-field="${field}"]`,
      );
      if (pop) restoreMkDueDropdownFromPortal(pop, `${field}TimePopMount`);
    });
    if (scheduleEl && gpMkDueEditorDraft) {
      syncScheduleElFromDraft(scheduleEl, gpMkDueEditorDraft);
    }
    dueBtn?.classList.remove('is-schedule-active');
    target.host?.classList.remove('is-schedule-open');
    gpMkDueEditorTarget = null;
    gpMkDueEditorDraft = null;
  }

  function getMkDueCalSelectedIso() {
    if (gpMkDueEditorDraft?.dueDate) return gpMkDueEditorDraft.dueDate;
    const host = gpMkDueEditorTarget?.host;
    return host?.dataset.dueDate || '';
  }

  function syncMkDueEditorUi() {
    const draft = gpMkDueEditorDraft;
    const scheduleEl = getActiveInlineSchedule();
    if (!draft || !scheduleEl) return;
    syncScheduleElFromDraft(scheduleEl, draft);
    applyMkDueDropdownUi();
  }

  function renderMkDueCalendar() {
    const scheduleEl = getActiveInlineSchedule();
    if (!scheduleEl) return;
    const grid = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-cal-grid');
    const mo = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-cal-month-label');
    if (!grid || !mo) return;

    const selIso = getMkDueCalSelectedIso();
    const selected = parseDueDateIsoLocal(selIso);

    const view = gpMkDueCalViewMonth && !Number.isNaN(gpMkDueCalViewMonth.getTime())
      ? gpMkDueCalViewMonth
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    mo.textContent = view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const y = view.getFullYear();
    const m = view.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevTail = firstDow;
    const prevMonthLast = new Date(y, m, 0).getDate();

    grid.innerHTML = '';
    const totalCells = Math.ceil((prevTail + daysInMonth) / 7) * 7;
    for (let i = 0; i < totalCells; i += 1) {
      const dayNum = i - prevTail + 1;
      let cellDate;
      let muted = false;
      if (i < prevTail) {
        cellDate = new Date(y, m - 1, prevMonthLast - prevTail + i + 1);
        muted = true;
      } else if (dayNum > daysInMonth) {
        cellDate = new Date(y, m + 1, dayNum - daysInMonth);
        muted = true;
      } else {
        cellDate = new Date(y, m, dayNum);
      }

      const iso = formatDueDateIso(cellDate);
      const isSel = selected
        && cellDate.getFullYear() === selected.getFullYear()
        && cellDate.getMonth() === selected.getMonth()
        && cellDate.getDate() === selected.getDate();

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gp-ct-cal-cell';
      if (muted) b.classList.add('is-muted');
      if (isSel) b.classList.add('is-selected');
      b.textContent = String(cellDate.getDate());
      b.dataset.iso = iso;
      grid.appendChild(b);
    }

    const target = gpMkDueEditorTarget;
    const dateLink = scheduleEl.querySelector('.gp-inline-schedule-date-link');
    const cal = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-cal');
    if (target?.dateDropdownOpen && cal && dateLink) {
      positionMkDueDateDropdown(cal, dateLink);
      queueMkDueDropdownScrollAdjust();
    }
  }

  function highlightMkDueTimeListSelection(scheduleEl, field, hm) {
    const list = queryMkDueSchedulePart(
      scheduleEl,
      `.gp-inline-schedule-time-list[data-time-field="${field}"]`,
    );
    if (!list) return;
    list.querySelectorAll('.gp-ct-time-opt').forEach((opt) => {
      const sel = opt.dataset.hm === hm;
      opt.classList.toggle('is-selected', sel);
      opt.setAttribute('aria-selected', sel ? 'true' : 'false');
    });
  }

  function scrollMkDueTimeListToHm(scheduleEl, field, hm) {
    const list = queryMkDueSchedulePart(
      scheduleEl,
      `.gp-inline-schedule-time-list[data-time-field="${field}"]`,
    );
    if (!list) return;
    const opt = list.querySelector(`.gp-ct-time-opt[data-hm="${hm}"]`);
    if (!opt) return;
    if (list.clientHeight > 0) {
      const targetTop = opt.offsetTop - (list.clientHeight - opt.offsetHeight) / 2;
      list.scrollTop = Math.max(0, targetTop);
    } else {
      opt.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function scrollMkDueTimeListsToDraft(field) {
    const scheduleEl = getActiveInlineSchedule();
    const draft = gpMkDueEditorDraft;
    if (!scheduleEl || !draft || draft.allDay) return;
    const layout = getDraftTimeLayout(draft);
    const fields = field
      ? [field]
      : layout === 'range'
        ? ['start', 'end']
        : [getSingleTimeField(draft)];
    fields.forEach((f) => {
      const hm = normalizeDueHm(f === 'end' ? draft.dueTimeEnd : draft.dueTimeStart)
        || (f === 'end' ? '19:30' : '18:30');
      highlightMkDueTimeListSelection(scheduleEl, f, hm);
      requestAnimationFrame(() => scrollMkDueTimeListToHm(scheduleEl, f, hm));
    });
  }

  function openMkDueTimePop(field) {
    const target = gpMkDueEditorTarget;
    if (!target || !field) return;
    const se = target.scheduleEl || getActiveInlineSchedule();
    if (se?.querySelector('.gp-inline-schedule-time-summary')) {
      se.classList.add('is-time-edit-open');
    }
    target.dateDropdownOpen = false;
    target.timeDropdownOpen = false;
    const opening = target.timePopField !== field;
    target.timePopField = opening ? field : null;
    applyMkDueDropdownUi();
    if (opening) {
      requestAnimationFrame(() => {
        scrollMkDueTimeListsToDraft(field);
        queueMkDueDropdownScrollAdjust();
      });
    }
  }

  function openMkDueDateDropdown() {
    const target = gpMkDueEditorTarget;
    if (!target) return;
    target.scheduleEl?.classList.remove('is-time-edit-open');
    target.timeDropdownOpen = false;
    target.timePopField = null;
    const opening = !target.dateDropdownOpen;
    target.dateDropdownOpen = opening;
    applyMkDueDropdownUi();
    if (opening) {
      const iso = gpMkDueEditorDraft?.dueDate || '';
      const base = parseDueDateIsoLocal(iso) || new Date();
      gpMkDueCalViewMonth = new Date(base.getFullYear(), base.getMonth(), 1);
      renderMkDueCalendar();
    }
  }

  function openMkDueTimeDropdown() {
    const target = gpMkDueEditorTarget;
    if (!target) return;
    target.scheduleEl?.classList.remove('is-time-edit-open');
    target.dateDropdownOpen = false;
    target.timePopField = null;
    const opening = !target.timeDropdownOpen;
    target.timeDropdownOpen = opening;
    applyMkDueDropdownUi();
    if (opening) {
      requestAnimationFrame(() => {
        scrollMkDueTimeListsToDraft();
        queueMkDueDropdownScrollAdjust();
      });
    }
  }

  function toggleMkDueDateDropdown() {
    openMkDueDateDropdown();
  }

  function toggleMkDueTimeDropdown() {
    openMkDueTimeDropdown();
  }

  function ensureMkDueEditorSync(anchor, taskId, scheduleEl) {
    if (!anchor || !taskId) return false;
    const host = anchor.closest('.mk-card, .gp-task-row');
    if (!host) return false;
    const sched = scheduleEl || anchor.querySelector('.gp-inline-schedule');
    if (!sched) return false;
    if (gpMkDueEditorTarget?.dueBtn !== anchor) {
      closeMkDueEditor();
      gpMkDueEditorTarget = {
        host,
        taskId,
        dueBtn: anchor,
        scheduleEl: sched,
        dateDropdownOpen: false,
        timeDropdownOpen: false,
        timePopField: null,
      };
      gpMkDueEditorDraft = dueDraftFromHost(host);
      anchor.classList.add('is-schedule-active');
      host.classList.add('is-schedule-open');
      syncMkDueEditorUi();
    }
    return true;
  }

  function setMkDueDateDropdownOpen(open) {
    const target = gpMkDueEditorTarget;
    if (!target) return;
    target.scheduleEl?.classList.remove('is-time-edit-open');
    target.timeDropdownOpen = false;
    target.timePopField = null;
    target.dateDropdownOpen = open;
    applyMkDueDropdownUi();
    if (open) {
      const iso = gpMkDueEditorDraft?.dueDate || '';
      const base = parseDueDateIsoLocal(iso) || new Date();
      gpMkDueCalViewMonth = new Date(base.getFullYear(), base.getMonth(), 1);
      renderMkDueCalendar();
    }
  }

  function closeMkDueDateDropdown(revertDraft = true) {
    const target = gpMkDueEditorTarget;
    if (!target) return;
    if (revertDraft && gpMkDueEditorDraft && target.host) {
      const host = target.host;
      const restored = host.dataset.dueDate
        || formatDueDateIso(parseTaskDueDate(
          host.querySelector('.gp-inline-schedule-date-label')?.textContent,
        ))
        || gpMkDueEditorDraft.dueDate;
      gpMkDueEditorDraft.dueDate = restored;
      syncMkDueEditorUi();
    }
    setMkDueDateDropdownOpen(false);
  }

  function setMkDueTimeDropdownOpen(open) {
    const target = gpMkDueEditorTarget;
    if (!target) return;
    target.scheduleEl?.classList.remove('is-time-edit-open');
    target.dateDropdownOpen = false;
    target.timePopField = null;
    target.timeDropdownOpen = open;
    applyMkDueDropdownUi();
    if (open) {
      requestAnimationFrame(() => scrollMkDueTimeListsToDraft());
    }
  }

  async function commitMkDueEditorDraft() {
    if (!gpMkDueEditorTarget || !gpMkDueEditorDraft) return;
    const { taskId, host } = gpMkDueEditorTarget;
    const draft = gpMkDueEditorDraft;
    const panel = document.getElementById('gp-panel');
    clearGpFolderMoveAnimTimers();
    let pending = null;
    if (panel && draft.dueDate) {
      pending = captureSidebarFolderMoveAnimContext(panel, taskId, draft);
    }
    gpFolderMoveAnimPending = pending;
    if (host) {
      if (draft.dueDate) host.dataset.dueDate = draft.dueDate;
      if (draft.allDay) {
        host.dataset.allDay = 'true';
        delete host.dataset.dueTimeStart;
        delete host.dataset.dueTimeEnd;
      } else {
        delete host.dataset.allDay;
        if (draft.dueTimeStart) host.dataset.dueTimeStart = draft.dueTimeStart;
        else delete host.dataset.dueTimeStart;
        if (draft.dueTimeEnd) host.dataset.dueTimeEnd = draft.dueTimeEnd;
        else delete host.dataset.dueTimeEnd;
      }
    }
    const ok = await updateKanbanTaskSchedule(taskId, {
      dueDate: draft.dueDate,
      dueTimeStart: draft.dueTimeStart,
      dueTimeEnd: draft.dueTimeEnd,
      allDay: draft.allDay,
    });
    if (!ok) gpFolderMoveAnimPending = null;
  }

  async function updateKanbanTaskSchedule(taskId, schedule) {
    if (!taskId || !schedule?.dueDate) return false;
    const state = await loadKanbanState();
    const allDay = Boolean(schedule.allDay);
    const dueDate = schedule.dueDate;
    const dueTimeStart = allDay ? '' : normalizeDueHm(schedule.dueTimeStart);
    const dueTimeEnd = allDay ? '' : normalizeDueHm(schedule.dueTimeEnd);
    let found = false;
    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      state.columns[id] = (state.columns[id] || []).map((card) => {
        if (card.id !== taskId) return card;
        found = true;
        const due = allDay
          ? formatKanbanDueLabel(dueDate)
          : formatKanbanDueWithTimes(dueDate, dueTimeStart, dueTimeEnd);
        const next = { ...card, dueDate, due };
        if (allDay) {
          next.allDay = true;
          delete next.dueTimeStart;
          delete next.dueTimeEnd;
        } else {
          delete next.allDay;
          if (dueTimeStart) next.dueTimeStart = dueTimeStart;
          else delete next.dueTimeStart;
          if (dueTimeEnd) next.dueTimeEnd = dueTimeEnd;
          else delete next.dueTimeEnd;
        }
        return next;
      });
    });
    if (!found) return false;
    await saveKanbanState(state);
    return true;
  }

  function wireMkDueEditorOnce() {
    if (document.documentElement.dataset.gpMkDueEditorWired === 'true') return;
    document.documentElement.dataset.gpMkDueEditorWired = 'true';

    document.addEventListener('click', (e) => {
      let scheduleEl = e.target.closest('.gp-inline-schedule');
      if (!scheduleEl && e.target.closest('#gp-mk-due-portal') && gpMkDueEditorTarget?.scheduleEl) {
        scheduleEl = gpMkDueEditorTarget.scheduleEl;
      }
      if (!scheduleEl) return;

      const dueBtn = scheduleEl.closest('.mk-card-due-btn, .gp-task-due-btn');
      const host = dueBtn?.closest('.mk-card, .gp-task-row');
      const taskId = host?.dataset.cardId || host?.dataset.taskId;
      const onDateLink = e.target.closest('.gp-inline-schedule-date-link');
      const onTimeLink = e.target.closest('.gp-inline-schedule-time-link');
      const onTimeBtn = e.target.closest('.gp-inline-schedule-time-btn');

      if ((onDateLink || onTimeLink || onTimeBtn) && dueBtn && taskId) {
        e.preventDefault();
        e.stopPropagation();
        if (!ensureMkDueEditorSync(dueBtn, taskId, scheduleEl)) return;
        const target = gpMkDueEditorTarget;
        if (!target) return;
        if (onDateLink) {
          openMkDueDateDropdown();
        } else if (e.target.closest('.gp-inline-schedule-time-summary')) {
          const draft = gpMkDueEditorDraft;
          if (draft && !draft.allDay) {
            const layout = getDraftTimeLayout(draft);
            const field = layout === 'single' ? getSingleTimeField(draft) : 'start';
            openMkDueTimePop(field);
          } else {
            scheduleEl.classList.add('is-time-edit-open');
            syncMkDueEditorUi();
            applyMkDueDropdownUi();
          }
        } else if (onTimeBtn?.dataset?.timeField) {
          openMkDueTimePop(onTimeBtn.dataset.timeField);
        } else {
          openMkDueTimeDropdown();
        }
        return;
      }

      const inMkDuePortal = Boolean(e.target.closest('#gp-mk-due-portal'));
      if (!inMkDuePortal && scheduleEl !== gpMkDueEditorTarget?.scheduleEl) return;
      const targetState = gpMkDueEditorTarget;
      if (inMkDuePortal && !targetState?.dateDropdownOpen
        && !targetState?.timeDropdownOpen && !targetState?.timePopField) {
        return;
      }

      if (e.target.closest('.gp-inline-schedule-cal-prev')) {
        e.preventDefault();
        e.stopPropagation();
        const v = gpMkDueCalViewMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        gpMkDueCalViewMonth = new Date(v.getFullYear(), v.getMonth() - 1, 1);
        renderMkDueCalendar();
        return;
      }

      if (e.target.closest('.gp-inline-schedule-cal-next')) {
        e.preventDefault();
        e.stopPropagation();
        const v = gpMkDueCalViewMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        gpMkDueCalViewMonth = new Date(v.getFullYear(), v.getMonth() + 1, 1);
        renderMkDueCalendar();
        return;
      }

      if (e.target.closest('.gp-inline-schedule-cal-close')) {
        e.preventDefault();
        e.stopPropagation();
        closeMkDueDateDropdown(true);
        return;
      }

      const cell = e.target.closest('.gp-inline-schedule-cal-grid .gp-ct-cal-cell');
      if (cell?.dataset?.iso && gpMkDueEditorDraft && gpMkDueEditorTarget) {
        e.preventDefault();
        e.stopPropagation();
        const iso = cell.dataset.iso;
        gpMkDueEditorDraft.dueDate = iso;
        if (gpMkDueEditorTarget.host) {
          gpMkDueEditorTarget.host.dataset.dueDate = iso;
        }
        syncMkDueEditorUi();
        closeMkDueDateDropdown(false);
        void commitMkDueEditorDraft();
        return;
      }

      const opt = e.target.closest('.gp-inline-schedule-time-list .gp-ct-time-opt');
      const timeList = opt?.closest('.gp-inline-schedule-time-list');
      const timeField = timeList?.dataset?.timeField;
      if (opt?.dataset?.hm && gpMkDueEditorDraft && timeField) {
        e.preventDefault();
        e.stopPropagation();
        const hm = nearestCreateTaskTimeHm(opt.dataset.hm) || opt.dataset.hm;
        if (timeField === 'end') {
          gpMkDueEditorDraft.dueTimeEnd = hm;
        } else {
          gpMkDueEditorDraft.dueTimeStart = hm;
        }
        gpMkDueEditorDraft.allDay = false;
        syncMkDueEditorUi();
        highlightMkDueTimeListSelection(scheduleEl, timeField, hm);
        if (gpMkDueEditorTarget) {
          gpMkDueEditorTarget.timeDropdownOpen = false;
          gpMkDueEditorTarget.timePopField = null;
          applyMkDueDropdownUi();
        }
        void commitMkDueEditorDraft();
      }
    });

    const repositionMkDueDropdowns = (event) => {
      if (!gpMkDueEditorTarget) return;
      const scrollTarget = event?.target;
      if (scrollTarget instanceof Element
        && scrollTarget.closest('.gp-inline-schedule-time-list, .gp-inline-schedule-cal-grid')) {
        return;
      }

      const scheduleEl = getActiveInlineSchedule();
      if (!scheduleEl) return;

      if (gpMkDueEditorTarget.dateDropdownOpen) {
        const cal = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-cal');
        const dateLink = scheduleEl.querySelector('.gp-inline-schedule-date-link');
        if (cal && dateLink) positionMkDueDateDropdown(cal, dateLink);
      }

      if (gpMkDueEditorTarget.timePopField) {
        const field = gpMkDueEditorTarget.timePopField;
        const pop = queryMkDueSchedulePart(
          scheduleEl,
          `.gp-inline-schedule-time-pop[data-time-field="${field}"]`,
        );
        const btn = scheduleEl.querySelector(`.gp-inline-schedule-time-btn[data-time-field="${field}"]`);
        if (pop && btn) positionMkDueTimePop(pop, btn);
      } else if (gpMkDueEditorTarget.timeDropdownOpen) {
        const timeDropdown = queryMkDueSchedulePart(scheduleEl, '.gp-inline-schedule-time-dropdown');
        const timeLink = scheduleEl.querySelector('.gp-inline-schedule-time-link');
        if (timeDropdown && timeLink) positionMkDueTimeDropdown(timeDropdown, timeLink);
      }
    };
    window.addEventListener('resize', repositionMkDueDropdowns);
    window.addEventListener('scroll', repositionMkDueDropdowns, true);

    document.addEventListener('change', (e) => {
      if (!e.target.classList?.contains('gp-inline-schedule-allday')) return;
      if (!gpMkDueEditorTarget?.scheduleEl) return;
      const inSchedule = e.target.closest('.gp-inline-schedule') === gpMkDueEditorTarget.scheduleEl;
      const inPortal = Boolean(e.target.closest('#gp-mk-due-portal'));
      if (!inSchedule && !inPortal) return;
      if (!gpMkDueEditorDraft) return;
      const checked = Boolean(e.target.checked);
      gpMkDueEditorDraft.allDay = checked;
      if (!checked) {
        const layout = getDraftTimeLayout(gpMkDueEditorDraft);
        if (layout === 'all-day') {
          gpMkDueEditorDraft.dueTimeStart = gpMkDueEditorDraft.dueTimeStart || '18:30';
          gpMkDueEditorDraft.dueTimeEnd = gpMkDueEditorDraft.dueTimeEnd || '19:30';
        }
      } else {
        gpMkDueEditorDraft.dueTimeStart = '';
        gpMkDueEditorDraft.dueTimeEnd = '';
      }
      syncMkDueEditorUi();
      void commitMkDueEditorDraft();
    });
  }

  async function getKanbanTaskById(taskId) {
    if (!taskId) return null;
    const state = await loadKanbanState();
    for (let i = 0; i < KANBAN_COLUMN_DEFS.length; i += 1) {
      const colId = KANBAN_COLUMN_DEFS[i].id;
      const card = (state.columns[colId] || []).find((c) => c.id === taskId);
      if (card) return card;
    }
    return null;
  }

  async function updateKanbanTaskTitle(taskId, title) {
    if (!taskId) return;
    const trimmed = String(title || '').trim() || 'Untitled';
    const state = await loadKanbanState();
    let found = false;
    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      state.columns[id] = (state.columns[id] || []).map((card) => {
        if (card.id !== taskId) return card;
        found = true;
        return { ...card, title: trimmed };
      });
    });
    if (!found) return;
    await saveKanbanState(state);
  }

  function getTaskTitleInputValue(titleEl) {
    if (!titleEl) return '';
    if (titleEl instanceof HTMLInputElement) return titleEl.value;
    return titleEl.textContent || '';
  }

  function getKanbanCardTitleValue(cardEl) {
    return getTaskTitleInputValue(cardEl?.querySelector('.mk-card-title'));
  }

  function commitTaskTitleInput(input) {
    const host = input.closest('.mk-card, .gp-task-row');
    const taskId = host?.dataset.cardId || host?.dataset.taskId;
    if (!taskId) return;
    const next = input.value.trim() || 'Untitled';
    input.value = next;
    const prior = (input.dataset.editStartValue || '').trim();
    if (next === prior) return;
    void updateKanbanTaskTitle(taskId, next);
  }

  function isSidebarTitleEditActive() {
    return Boolean(
      document.querySelector('#gp-panel .gp-task-row.is-editing-title')
      || document.querySelector('#gp-panel .gp-task-title:focus'),
    );
  }

  function isMkDueEditorActive() {
    return Boolean(gpMkDueEditorTarget?.host?.classList.contains('is-schedule-open'));
  }

  function takeMkDueSidebarEditorResume() {
    const target = gpMkDueEditorTarget;
    if (!target?.taskId) return null;
    if (!target.host?.closest('#gp-panel')) return null;
    if (!target.host.classList.contains('is-schedule-open')) return null;
    return {
      taskId: target.taskId,
      dateDropdownOpen: !!target.dateDropdownOpen,
      timeDropdownOpen: !!target.timeDropdownOpen,
      timePopField: target.timePopField || null,
    };
  }

  function resumeMkDueSidebarEditor(panel, state, resume) {
    if (!resume?.taskId || !panel) return;
    const row = [...panel.querySelectorAll('.gp-task-row')].find((r) => r.dataset.taskId === resume.taskId);
    if (!row) return;
    const dueBtn = row.querySelector('.gp-task-due-btn');
    const scheduleEl = dueBtn?.querySelector('.gp-inline-schedule');
    if (!dueBtn || !scheduleEl) return;
    if (!findTaskColumnId(state, resume.taskId)) return;
    if (!ensureMkDueEditorSync(dueBtn, resume.taskId, scheduleEl)) return;
    const t = gpMkDueEditorTarget;
    if (!t) return;
    t.dateDropdownOpen = !!resume.dateDropdownOpen;
    t.timeDropdownOpen = !!resume.timeDropdownOpen;
    t.timePopField = resume.timePopField || null;
    syncMkDueEditorUi();
    applyMkDueDropdownUi();
    if (resume.dateDropdownOpen) {
      const iso = gpMkDueEditorDraft?.dueDate || '';
      const base = parseDueDateIsoLocal(iso) || new Date();
      gpMkDueCalViewMonth = new Date(base.getFullYear(), base.getMonth(), 1);
      renderMkDueCalendar();
    }
    if (resume.timePopField) {
      const se = t.scheduleEl;
      if (se?.querySelector('.gp-inline-schedule-time-summary')) {
        se.classList.add('is-time-edit-open');
      }
      requestAnimationFrame(() => scrollMkDueTimeListsToDraft(resume.timePopField));
      queueMkDueDropdownScrollAdjust();
    }
    syncMkDueDropdownPortal();
  }

  function clearGpFolderMoveAnimTimers() {
    if (gpFolderMoveAnimRaf) {
      cancelAnimationFrame(gpFolderMoveAnimRaf);
      gpFolderMoveAnimRaf = null;
    }
    if (typeof gpFolderMoveAnimClearTimers === 'function') {
      gpFolderMoveAnimClearTimers();
      gpFolderMoveAnimClearTimers = null;
    }
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
  }

  function getSidebarStickyHeadHeight(panel) {
    return panel?.querySelector('.gp-sidebar-sticky-head')?.offsetHeight ?? 0;
  }

  function computeSidebarScrollToCenterElement(scrollEl, targetEl, panel) {
    if (!scrollEl || !targetEl) return scrollEl?.scrollTop ?? 0;
    const stickyH = getSidebarStickyHeadHeight(panel);
    const scrollRect = scrollEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const visibleTop = scrollRect.top + stickyH;
    const visibleHeight = Math.max(0, scrollRect.height - stickyH);
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const desiredCenterY = visibleTop + visibleHeight / 2;
    const delta = targetCenterY - desiredCenterY;
    const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    return Math.max(0, Math.min(maxScroll, scrollEl.scrollTop + delta));
  }

  function scrollSidebarToCenterTask(scrollEl, targetEl, panel, behavior = 'auto') {
    if (!scrollEl || !targetEl) return false;
    const targetScroll = computeSidebarScrollToCenterElement(scrollEl, targetEl, panel);
    if (Math.abs(targetScroll - scrollEl.scrollTop) <= 2) return false;
    scrollEl.scrollTo({ top: targetScroll, behavior });
    return true;
  }

  function setFolderMoveGhostPosition(ghost, x, y, opacity = 1) {
    ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    ghost.style.opacity = String(opacity);
  }

  function createSidebarTaskFlyGhost(row) {
    const fromRect = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    ghost.classList.add('gp-task-row--folder-move-ghost');
    ghost.querySelectorAll('input, textarea, select').forEach((el) => {
      el.disabled = true;
      el.readOnly = true;
    });
    ghost.querySelectorAll('button').forEach((el) => {
      el.disabled = true;
    });
    return { ghost, fromRect };
  }

  function runSidebarTaskFlyAnim(panel, accordion, config) {
    const {
      ghost,
      fromRect,
      destRow,
      destFolder,
      destFolderKey,
      oldIdx,
      newIdx,
      folderCountsBefore = {},
      onComplete,
    } = config;

    clearGpFolderMoveAnimTimers();
    const timers = [];
    const schedule = (fn, ms) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const cancelAll = () => {
      if (gpFolderMoveAnimRaf) {
        cancelAnimationFrame(gpFolderMoveAnimRaf);
        gpFolderMoveAnimRaf = null;
      }
      timers.forEach((id) => window.clearTimeout(id));
    };
    gpFolderMoveAnimClearTimers = cancelAll;

    const finish = () => {
      if (typeof onComplete === 'function') onComplete();
      gpFolderMoveAnimClearTimers = null;
    };

    if (!ghost || !fromRect || !destRow || !destFolder || oldIdx < 0 || newIdx < 0) {
      ghost?.remove();
      finish();
      return;
    }

    ensureSidebarFolderOpenForAnim(destFolder);

    const pulseMs = 90;
    const landMs = 920;
    const scrollEl = panel.querySelector('.gp-card');
    destRow.classList.add('gp-task-row--folder-move-pending');
    destFolder.classList.add('gp-task-folder--receiving');

    const startScroll = scrollEl?.scrollTop ?? 0;
    const endScroll = scrollEl
      ? computeSidebarScrollToCenterElement(scrollEl, destRow, panel)
      : startScroll;
    const needsScroll = scrollEl && Math.abs(endScroll - startScroll) > 2;
    const flightMs = needsScroll ? 520 : 360;

    const moveLayer = ensureFolderMoveLayer(panel);
    if (!moveLayer) {
      ghost.remove();
      destRow.classList.remove('gp-task-row--folder-move-pending');
      destFolder.classList.remove('gp-task-folder--receiving');
      finish();
      return;
    }

    const g = ghost;
    g.style.width = `${fromRect.width}px`;
    g.style.pointerEvents = 'none';
    g.style.transition = 'none';
    moveLayer.appendChild(g);
    setFolderMoveGhostPosition(g, fromRect.left, fromRect.top, 1);

    schedule(() => {
      g.classList.add('gp-task-row--folder-move-ghost-pulse');
    }, 0);

    schedule(() => {
      g.classList.remove('gp-task-row--folder-move-ghost-pulse');
      flashIntermediateFolderLabels(accordion, oldIdx, newIdx, 0);

      const sx = fromRect.left;
      const sy = fromRect.top;
      const flightStart = performance.now();

      const flightTick = (now) => {
        const rawT = Math.min(1, (now - flightStart) / flightMs);
        const t = easeInOutCubic(rawT);

        if (scrollEl && needsScroll) {
          scrollEl.scrollTop = startScroll + (endScroll - startScroll) * t;
        }

        const targetRect = destRow.getBoundingClientRect();
        const x = sx + (targetRect.left - sx) * t;
        const y = sy + (targetRect.top - sy) * t;
        const fadeStart = 0.82;
        const opacity = rawT > fadeStart ? 1 - ((rawT - fadeStart) / (1 - fadeStart)) : 1;
        setFolderMoveGhostPosition(g, x, y, opacity);

        if (rawT < 1) {
          gpFolderMoveAnimRaf = requestAnimationFrame(flightTick);
        } else {
          gpFolderMoveAnimRaf = null;
        }
      };
      gpFolderMoveAnimRaf = requestAnimationFrame(flightTick);
    }, pulseMs);

    schedule(() => {
      const destLabel = destFolder.querySelector('.gp-task-folder-label');
      const fromCount = folderCountsBefore[destFolderKey] ?? 0;
      const toCount = getFolderTaskCount(destFolder);
      if (destLabel) {
        destLabel.classList.add('gp-task-folder-label--flash');
        if (fromCount !== toCount) {
          animateFolderLabelCountTick(destLabel, destFolderKey, fromCount, toCount);
        }
      }
      g.remove();
      destRow.classList.remove('gp-task-row--folder-move-pending');
      destRow.classList.add('gp-task-row--folder-move-land');
    }, pulseMs + flightMs);

    schedule(() => {
      destRow.classList.remove('gp-task-row--folder-move-land');
      destFolder.classList.remove('gp-task-folder--receiving');
      const destLabel = destFolder.querySelector('.gp-task-folder-label');
      destLabel?.classList.remove('gp-task-folder-label--flash');
      syncFolderCount(destFolder);
      finish();
    }, pulseMs + flightMs + landMs);
  }

  function mergeTaskWithDueDraft(task, draft) {
    if (!task || !draft) return null;
    const allDay = Boolean(draft.allDay);
    const out = { ...task, dueDate: draft.dueDate || task.dueDate };
    if (allDay) {
      out.allDay = true;
      delete out.dueTimeStart;
      delete out.dueTimeEnd;
    } else {
      delete out.allDay;
      const ds = normalizeDueHm(draft.dueTimeStart || '');
      const de = normalizeDueHm(draft.dueTimeEnd || '');
      if (ds) out.dueTimeStart = ds;
      else delete out.dueTimeStart;
      if (de) out.dueTimeEnd = de;
      else delete out.dueTimeEnd;
    }
    return out;
  }

  function sidebarTaskToFolderKey(task, columnId) {
    if (columnId === 'done') return 'completed';
    return getTaskSidebarFolderKey(task);
  }

  function captureSidebarStatusRestoreAnimContext(panel, taskId) {
    const accordion = panel?.querySelector('#gp-tasks-accordion');
    const row = panel?.querySelector(`.gp-task-row[data-task-id="${taskId}"]`);
    const state = kanbanStateCache;
    if (!accordion || !row || !state) return null;
    const loc = findTaskWithColumn(state, taskId);
    if (!loc || loc.columnId !== 'done') return null;

    const oldFolder = 'completed';
    const newFolder = getTaskSidebarFolderKey(loc.task);
    if (oldFolder === newFolder) return null;

    const folderCountsBefore = {};
    SIDEBAR_FOLDER_ORDER.forEach((k) => {
      const f = accordion.querySelector(`[data-folder="${k}"]`);
      folderCountsBefore[k] = getFolderTaskCount(f);
    });
    const { ghost, fromRect } = createSidebarTaskFlyGhost(row);
    return {
      taskId,
      oldFolder,
      newFolder,
      fromRect,
      ghost,
      folderCountsBefore,
    };
  }

  function captureSidebarFolderMoveAnimContext(panel, taskId, draft) {
    const accordion = panel?.querySelector('#gp-tasks-accordion');
    const row = panel?.querySelector(`.gp-task-row[data-task-id="${taskId}"]`);
    const state = kanbanStateCache;
    if (!accordion || !row || !state || !draft?.dueDate) return null;
    const loc = findTaskWithColumn(state, taskId);
    if (!loc) return null;
    const oldFolder = sidebarTaskToFolderKey(loc.task, loc.columnId);
    const merged = mergeTaskWithDueDraft(loc.task, draft);
    if (!merged) return null;
    const newFolder = sidebarTaskToFolderKey(merged, loc.columnId);
    const folderCountsBefore = {};
    SIDEBAR_FOLDER_ORDER.forEach((k) => {
      const f = accordion.querySelector(`[data-folder="${k}"]`);
      folderCountsBefore[k] = getFolderTaskCount(f);
    });
    const { ghost, fromRect } = createSidebarTaskFlyGhost(row);
    return {
      taskId,
      oldFolder,
      newFolder,
      fromRect,
      ghost,
      folderCountsBefore,
    };
  }

  function ensureSidebarFolderOpenForAnim(folderEl) {
    if (!folderEl || folderEl.classList.contains('open')) return;
    folderEl.classList.add('open');
    const toggle = folderEl.querySelector('.gp-task-folder-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    syncFolderEmptyState(folderEl);
  }

  function flashIntermediateFolderLabels(accordion, oldIdx, newIdx, startMs) {
    if (oldIdx === newIdx) return;
    const step = newIdx > oldIdx ? 1 : -1;
    const labels = [];
    let i = oldIdx + step;
    while (i !== newIdx) {
      const fk = SIDEBAR_FOLDER_ORDER[i];
      const label = accordion.querySelector(`[data-folder="${fk}"] .gp-task-folder-label`);
      if (label) labels.push(label);
      i += step;
    }
    if (!labels.length) return;
    const spread = 220;
    const each = Math.max(55, Math.floor(spread / labels.length));
    labels.forEach((label, idx) => {
      window.setTimeout(() => {
        label.classList.add('gp-task-folder-label--trail');
        window.setTimeout(() => label.classList.remove('gp-task-folder-label--trail'), each + 40);
      }, startMs + idx * each);
    });
  }

  function animateFolderLabelCountTick(labelEl, folderKey, fromCount, toCount) {
    if (!labelEl || fromCount === toCount) return;
    const title = FOLDER_LABELS[folderKey];
    if (!title) return;
    const steps = Math.abs(toCount - fromCount);
    const dur = 180;
    const stepMs = Math.max(28, Math.floor(dur / Math.max(steps, 1)));
    let cur = fromCount;
    const dir = toCount > fromCount ? 1 : -1;
    const tick = () => {
      labelEl.textContent = `${title} (${cur})`;
      if (cur === toCount) return;
      cur += dir;
      window.setTimeout(tick, stepMs);
    };
    tick();
  }

  function runSidebarFolderMoveAnimAfterRender(panel, accordion, ctx) {
    clearGpFolderMoveAnimTimers();
    const timers = [];
    const schedule = (fn, ms) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const cancelAll = () => {
      if (gpFolderMoveAnimRaf) {
        cancelAnimationFrame(gpFolderMoveAnimRaf);
        gpFolderMoveAnimRaf = null;
      }
      timers.forEach((id) => window.clearTimeout(id));
    };
    gpFolderMoveAnimClearTimers = cancelAll;

    const loc = findTaskWithColumn(kanbanStateCache, ctx.taskId);
    const destRow = loc
      ? panel.querySelector(`.gp-task-row[data-task-id="${ctx.taskId}"]`)
      : null;
    if (!loc || !destRow || !ctx.ghost) {
      ctx.ghost?.remove();
      gpFolderMoveAnimClearTimers = null;
      return;
    }
    if (!cardMatchesBoardFilters(loc.task, loc.columnId, kanbanStateCache.filters)) {
      ctx.ghost.remove();
      gpFolderMoveAnimClearTimers = null;
      return;
    }

    const newFolder = sidebarTaskToFolderKey(loc.task, loc.columnId);
    const pulseOnly = ctx.oldFolder === newFolder;

    if (pulseOnly) {
      ctx.ghost?.remove();
      const scrollEl = panel.querySelector('.gp-card');
      scrollSidebarToCenterTask(scrollEl, destRow, panel, 'smooth');
      destRow.classList.add('gp-task-row--folder-move-highlight');
      schedule(() => destRow.classList.remove('gp-task-row--folder-move-highlight'), 820);
      schedule(() => { gpFolderMoveAnimClearTimers = null; }, 830);
      return;
    }

    const destFolder = accordion.querySelector(`[data-folder="${newFolder}"]`);
    const oldIdx = SIDEBAR_FOLDER_ORDER.indexOf(ctx.oldFolder);
    const newIdx = SIDEBAR_FOLDER_ORDER.indexOf(newFolder);
    if (oldIdx < 0 || newIdx < 0) {
      ctx.ghost.remove();
      gpFolderMoveAnimClearTimers = null;
      return;
    }

    runSidebarTaskFlyAnim(panel, accordion, {
      ghost: ctx.ghost,
      fromRect: ctx.fromRect,
      destRow,
      destFolder,
      destFolderKey: newFolder,
      oldIdx,
      newIdx,
      folderCountsBefore: ctx.folderCountsBefore,
    });
  }

  function bindSidebarTaskTitleInput(title, row) {
    if (!title || !row || title.dataset.gpTitleBound === 'true') return;
    title.dataset.gpTitleBound = 'true';

    title.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });

    title.addEventListener('mousedown', (event) => {
      event.stopPropagation();
    });

    title.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    title.addEventListener('focus', () => {
      row.classList.add('is-editing-title');
      title.dataset.editStartValue = title.value;
    });

    title.addEventListener('blur', () => {
      row.classList.remove('is-editing-title');
      commitTaskTitleInput(title);
    });

    title.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        title.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        title.value = title.dataset.editStartValue || title.value;
        title.blur();
      }
    });
  }

  function getTaskDueDateFromCard(card) {
    if (card?.dueDate) {
      const parsed = new Date(`${card.dueDate}T12:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return parseTaskDueDate(card?.due);
  }

  /** Milliseconds from local midnight for a normalized HH:mm, or 0 if missing. */
  function dueHmToDayOffsetMs(hm) {
    const n = normalizeDueHm(hm || '');
    if (!n) return 0;
    const [h, m] = n.split(':').map(Number);
    return ((h * 60) + m) * 60 * 1000;
  }

  /**
   * Sort key for sidebar folder ordering: earliest due first; tasks with no due
   * date sort last (Infinity). Same calendar day breaks ties by start time when set.
   */
  function sidebarTaskDueSortMs(task) {
    const dayDate = getTaskDueDateFromCard(task);
    if (!dayDate || Number.isNaN(dayDate.getTime())) {
      return Number.POSITIVE_INFINITY;
    }
    const dayStart = normalizeDateOnly(dayDate).getTime();
    if (task?.allDay === true) {
      return dayStart;
    }
    return dayStart + dueHmToDayOffsetMs(task?.dueTimeStart);
  }

  function sortSidebarFolderEntries(entries) {
    entries.sort((a, b) => {
      const da = sidebarTaskDueSortMs(a.task);
      const db = sidebarTaskDueSortMs(b.task);
      if (da !== db) return da - db;
      return String(a.task.id).localeCompare(String(b.task.id));
    });
  }

  function sidebarRowDueSortMs(row) {
    if (!row) return Number.POSITIVE_INFINITY;
    const taskId = row.dataset.taskId;
    if (taskId && kanbanStateCache) {
      const loc = findTaskWithColumn(kanbanStateCache, taskId);
      if (loc?.task) return sidebarTaskDueSortMs(loc.task);
    }
    return sidebarTaskDueSortMs({
      dueDate: row.dataset.dueDate,
      dueTimeStart: row.dataset.dueTimeStart,
      allDay: row.dataset.allDay === 'true',
    });
  }

  function insertSidebarRowInSortedFolder(inner, row) {
    if (!inner || !row) return;
    const taskId = row.dataset.taskId || '';
    const sortMs = sidebarRowDueSortMs(row);
    const existingRows = [...inner.querySelectorAll('.gp-task-row')];
    for (const existing of existingRows) {
      const existingMs = sidebarRowDueSortMs(existing);
      const existingId = existing.dataset.taskId || '';
      if (sortMs < existingMs || (sortMs === existingMs && taskId.localeCompare(existingId) < 0)) {
        inner.insertBefore(row, existing);
        return;
      }
    }
    inner.appendChild(row);
  }

  function normalizeKanbanCard(card, fallbackId, tags) {
    const chip = card?.chip || card?.course || 'PSYC101';
    const dueDate = card?.dueDate
      || formatDueDateIso(parseTaskDueDate(card?.due))
      || '2026-05-21';

    let chipColor = resolveKanbanChipColor(chip, card?.chipColor, card?.courseKey);
    let chipCustomHex = normalizeHexColor(card?.chipCustomHex);
    const tagMatch = findTagByLabel(tags, chip);
    if (tagMatch && !tagMatch.hidden) {
      chipColor = chipClassForColorKey(tagMatch.colorKey);
      if (tagMatch.colorKey === 'custom') {
        const hx = normalizeHexColor(tagMatch.customHex);
        chipCustomHex = hx || undefined;
      } else {
        chipCustomHex = undefined;
      }
    }

    const subtasks = Array.isArray(card?.subtasks)
      ? card.subtasks.map((s, si) => ({
        id: String(s?.id || `st-${fallbackId}-${si}`),
        title: String(s?.title || '').trim() || 'Subtask',
        done: Boolean(s?.done),
      })).filter((s) => s.title)
      : [];

    const dueTimeStart = normalizeDueHm(card?.dueTimeStart || '');
    const dueTimeEnd = normalizeDueHm(card?.dueTimeEnd || '');
    const out = {
      id: card?.id || fallbackId,
      title: card?.title || 'Project Outline',
      dueDate,
      due: card?.due || formatKanbanDueWithTimes(dueDate, dueTimeStart, dueTimeEnd),
      chip,
      chipColor,
      starred: Boolean(card?.starred),
      notes: String(card?.notes || '').trim(),
      subtasks,
    };
    if (dueTimeStart) out.dueTimeStart = dueTimeStart;
    if (dueTimeEnd) out.dueTimeEnd = dueTimeEnd;
    if (card?.allDay === true) out.allDay = true;
    if (chipCustomHex) out.chipCustomHex = chipCustomHex;
    if (card?.recurrence) out.recurrence = String(card.recurrence).trim();
    if (card?.reminderMinutes != null && !Number.isNaN(Number(card.reminderMinutes))) {
      out.reminderMinutes = Number(card.reminderMinutes);
    }
    if (card?.calendarName) out.calendarName = String(card.calendarName).trim();
    return out;
  }

  function getDefaultKanbanState() {
    const tags = getDefaultTags();
    return {
      columns: {
        todo: [
          createDefaultKanbanCard('todo-1', 'PSYC101'),
          createDefaultKanbanCard('todo-2', 'PS'),
          createDefaultKanbanCard('todo-3', 'MGT103'),
          createDefaultKanbanCard('todo-4', 'MGT103'),
        ],
        progress: [
          createDefaultKanbanCard('progress-1', 'MGT103'),
          createDefaultKanbanCard('progress-2', 'COGS14B'),
          createDefaultKanbanCard('progress-3', 'PSYC101'),
          createDefaultKanbanCard('progress-4', 'PS'),
          createDefaultKanbanCard('progress-5', 'PS'),
        ],
        done: [
          createDefaultKanbanCard('done-1', 'PSYC101'),
          createDefaultKanbanCard('done-2', 'COGS14B'),
          createDefaultKanbanCard('done-3', 'COGS14B'),
        ],
      },
      filters: getDefaultKanbanFilters(),
      tags,
    };
  }

  function getDefaultKanbanFilters() {
    return {
      activeList: 'all',
      activeNavIds: [],
      activeCategories: [],
      selectedTags: [],
      sectionsCollapsed: {
        categories: false,
        tags: false,
      },
    };
  }

  function normalizeNavIdList(value) {
    if (!Array.isArray(value)) return [];
    const ids = [...new Set(value.filter((id) => KANBAN_NAV_FILTER_IDS.includes(id)))];
    return ids.length ? [ids[0]] : [];
  }

  function getActiveViewFilterId(filters) {
    const navIds = filters?.activeNavIds || [];
    return navIds.length ? navIds[0] : null;
  }

  function getViewFilterLabel(navId) {
    if (!navId) return '';
    if (navId === 'starred') return 'Starred';
    const match = KANBAN_VIEW_DEFS.find((view) => view.id === navId);
    return match?.label || navId;
  }

  function normalizeCategoryList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((label) => String(label).trim()).filter(Boolean))];
  }

  function migrateLegacyNavFilters(merged) {
    const fromArray = normalizeNavIdList(merged.activeNavIds);
    if (fromArray.length) return fromArray;

    if (merged.activeNav && KANBAN_NAV_FILTER_IDS.includes(merged.activeNav)) {
      return [merged.activeNav];
    }
    if (merged.starredOnly) return ['starred'];
    if (merged.activeView && KANBAN_NAV_FILTER_IDS.includes(merged.activeView)) {
      return [merged.activeView];
    }
    return [];
  }

  function migrateLegacyCategoryFilters(merged) {
    if (Array.isArray(merged.activeCategories)) {
      return normalizeCategoryList(merged.activeCategories);
    }

    if (typeof merged.activeCategory === 'string' && merged.activeCategory.trim()) {
      return [merged.activeCategory.trim()];
    }

    if (Array.isArray(merged.selectedTags) && merged.selectedTags.length) {
      return normalizeCategoryList(merged.selectedTags);
    }

    return [];
  }

  function readFiltersFromLocalStorage() {
    try {
      const raw = localStorage.getItem(KANBAN_FILTER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function persistFiltersToLocalStorage(filters) {
    try {
      localStorage.setItem(KANBAN_FILTER_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* ignore quota errors */
    }
  }

  function normalizeKanbanFilters(filters, options = {}) {
    const defaults = getDefaultKanbanFilters();
    const stored = options.preferLocalStorage ? readFiltersFromLocalStorage() : null;
    const merged = options.preferLocalStorage
      ? {
        ...defaults,
        ...(filters || {}),
        ...(stored || {}),
      }
      : {
        ...defaults,
        ...(filters || {}),
      };

    const activeList = KANBAN_COLUMN_DEFS.some(({ id }) => id === merged.activeList) || merged.activeList === 'all'
      ? (merged.activeList || 'all')
      : 'all';

    const activeNavIds = normalizeNavIdList(migrateLegacyNavFilters(merged));
    const activeCategories = migrateLegacyCategoryFilters(merged);

    const sectionsCollapsed = {
      categories: Boolean(merged.sectionsCollapsed?.categories),
    };

    const normalized = {
      activeList,
      activeNavIds,
      activeCategories,
      selectedTags: [],
      sectionsCollapsed,
    };

    persistFiltersToLocalStorage(normalized);
    return normalized;
  }

  function getDueThisWeekRange(now = new Date()) {
    const start = normalizeDateOnly(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  function isCardDueThisWeek(card, now = new Date()) {
    const due = getTaskDueDateFromCard(card);
    if (!due) return false;
    const dueDay = normalizeDateOnly(due);
    const { start, end } = getDueThisWeekRange(now);
    return dueDay >= start && dueDay <= end;
  }

  function isCardOverdue(card, now = new Date()) {
    return getTaskSidebarFolderKey(card, now) === 'overdue';
  }

  function isBoardFilterActive(filters) {
    if (!filters) return false;
    return Boolean(
      (filters.activeNavIds && filters.activeNavIds.length > 0)
      || (filters.activeCategories && filters.activeCategories.length > 0),
    );
  }

  function isAllTasksFilterActive(filters) {
    if (!filters) return true;
    return !(filters.activeNavIds && filters.activeNavIds.length)
      && !(filters.activeCategories && filters.activeCategories.length);
  }

  function cardMatchesNavFilter(card, navId) {
    if (navId === 'starred') return Boolean(card.starred);
    if (navId === 'due-this-week') return isCardDueThisWeek(card);
    if (navId === 'overdue') return isCardOverdue(card);
    return false;
  }

  function getCardTagLabel(card) {
    return String(card?.chip || card?.course || '').trim();
  }

  function cardMatchesBoardFilters(card, columnId, filters) {
    if (!card) return false;
    if (!isBoardFilterActive(filters)) return true;

    const navIds = filters.activeNavIds || [];
    if (navIds.length && !navIds.some((navId) => cardMatchesNavFilter(card, navId))) {
      return false;
    }

    const tagLabel = getCardTagLabel(card);

    const categories = filters.activeCategories || [];
    if (categories.length && !categories.includes(tagLabel)) {
      return false;
    }

    return true;
  }

  function getKanbanActiveFilterPills(state) {
    const filters = state?.filters || getDefaultKanbanFilters();
    const pills = [];
    const viewId = getActiveViewFilterId(filters);

    if (viewId) {
      pills.push({
        type: 'view',
        id: viewId,
        label: getViewFilterLabel(viewId),
      });
    }

    (filters.activeCategories || []).forEach((label) => {
      pills.push({
        type: 'category',
        id: label,
        label,
      });
    });

    return pills;
  }

  function collectBoardTagUsage(state) {
    const usage = new Map();

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      (state.columns[id] || []).forEach((card) => {
        const label = String(card?.chip || '').trim();
        if (!label) return;
        usage.set(label, (usage.get(label) || 0) + 1);
      });
    });

    return usage;
  }

  function resolveTagMetaForLabel(state, label) {
    const tag = findTagByLabel(state.tags, label);
    if (tag) {
      return {
        label: tag.label,
        colorKey: tag.colorKey,
        customHex: tag.customHex,
        hidden: tag.hidden,
      };
    }

    return {
      label,
      colorKey: resolveKanbanChipColor(label),
      customHex: undefined,
      hidden: false,
    };
  }

  function getBoardCategoryRows(state) {
    const usage = collectBoardTagUsage(state);
    return [...usage.entries()]
      .map(([label, count]) => ({
        ...resolveTagMetaForLabel(state, label),
        count,
      }))
      .filter((row) => !row.hidden)
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function getBoardTagPills(state) {
    const usage = collectBoardTagUsage(state);
    return (state.tags || [])
      .filter((tag) => !tag.hidden && usage.has(tag.label))
      .map((tag) => ({
        ...tag,
        count: usage.get(tag.label) || 0,
      }));
  }

  function findKanbanCardInState(state, cardId) {
    if (!cardId) return null;

    for (const { id } of KANBAN_COLUMN_DEFS) {
      const match = (state.columns[id] || []).find((card) => card.id === cardId);
      if (match) {
        return { card: match, columnId: id };
      }
    }

    return null;
  }

  function normalizeKanbanState(state) {
    const defaults = getDefaultKanbanState();
    const tags = normalizeTags(state?.tags?.length ? state.tags : defaults.tags);
    const columns = {};

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      const savedCards = Array.isArray(state?.columns?.[id]) ? state.columns[id] : null;
      columns[id] = savedCards
        ? savedCards.map((card, index) => normalizeKanbanCard(card, `${id}-${index + 1}`, tags))
        : defaults.columns[id].map((card) => normalizeKanbanCard(card, card.id, tags));
    });

    return {
      columns,
      filters: normalizeKanbanFilters(state?.filters || defaults.filters, {
        preferLocalStorage: true,
      }),
      tags,
    };
  }

  function findTaskColumnId(state, taskId) {
    for (const { id } of KANBAN_COLUMN_DEFS) {
      if ((state.columns[id] || []).some((card) => card.id === taskId)) {
        return id;
      }
    }

    return null;
  }

  function findTaskWithColumn(state, taskId) {
    const columnId = findTaskColumnId(state, taskId);
    if (!columnId) return null;
    const task = (state.columns[columnId] || []).find((card) => card.id === taskId);
    return task ? { task, columnId } : null;
  }

  function moveTaskInState(state, taskId, targetColumnId) {
    const sourceColumnId = findTaskColumnId(state, taskId);
    if (!sourceColumnId || sourceColumnId === targetColumnId) return false;

    const sourceColumn = state.columns[sourceColumnId] || [];
    const taskIndex = sourceColumn.findIndex((card) => card.id === taskId);
    if (taskIndex < 0) return false;

    const [task] = sourceColumn.splice(taskIndex, 1);
    state.columns[sourceColumnId] = sourceColumn;
    state.columns[targetColumnId] = [...(state.columns[targetColumnId] || []), task];
    return true;
  }

  function getSidebarCourseChipClass(chip) {
    switch (chip) {
      case 'PSYC101':
        return 'gp-course-chip--psych';
      case 'COGS14B':
        return 'gp-course-chip--cogs';
      case 'PS':
        return 'gp-course-chip--ps';
      case 'MGT103':
        return 'gp-course-chip--mgt';
      default:
        return '';
    }
  }

  function renderSidebarTaskRow(task, columnId, tags) {
    const statusKey = COLUMN_STATUS_MAP[columnId] || 'planned';
    const status = TASK_STATUSES[statusKey];
    const isCompleted = columnId === 'done';
    const dueDate = getTaskDueDateFromCard(task);

    const row = document.createElement('article');
    row.className = 'gp-task-row';
    if (isCompleted) {
      row.classList.add('gp-task-row--completed');
    }
    row.dataset.taskId = task.id;
    if (task.dueDate) {
      row.dataset.dueDate = task.dueDate;
    } else if (dueDate) {
      row.dataset.dueDate = formatDueDateIso(dueDate);
    }
    if (task.dueTimeStart) {
      row.dataset.dueTimeStart = task.dueTimeStart;
    }
    if (task.dueTimeEnd) {
      row.dataset.dueTimeEnd = task.dueTimeEnd;
    }
    if (task.allDay) {
      row.dataset.allDay = 'true';
    }

    const checkbox = document.createElement('button');
    checkbox.type = 'button';
    checkbox.className = 'gp-task-checkbox';
    checkbox.setAttribute('aria-label', `Mark ${task.title} complete`);

    const checkboxIcon = document.createElement('span');
    checkboxIcon.className = 'gp-task-checkbox-icon';
    checkboxIcon.setAttribute('aria-hidden', 'true');
    checkboxIcon.innerHTML = isCompleted
      ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="currentColor"></circle>
          <path d="M8.5 12.2 10.8 14.5 15.5 9.8" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>`
      : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle>
        </svg>`;
    checkbox.appendChild(checkboxIcon);
    if (isCompleted) {
      checkbox.classList.add('gp-task-checkbox--checked');
    }

    const body = document.createElement('div');
    body.className = 'gp-task-body';

    const text = document.createElement('div');
    text.className = 'gp-task-text';

    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'gp-task-title';
    title.value = task.title;
    title.setAttribute('aria-label', 'Task title');
    title.spellcheck = true;
    title.autocomplete = 'off';
    bindSidebarTaskTitleInput(title, row);

    const subtitle = document.createElement('span');
    subtitle.className = 'gp-task-subtitle gp-task-due-btn';
    mountDueScheduleInAnchor(subtitle, task);

    text.appendChild(title);
    text.appendChild(subtitle);

    const meta = document.createElement('div');
    meta.className = 'gp-task-meta';

    const courseChip = document.createElement('span');
    const courseChipClass = getSidebarCourseChipClass(task.chip);
    courseChip.className = courseChipClass
      ? `gp-course-chip ${courseChipClass}`
      : 'gp-course-chip';
    courseChip.textContent = task.chip;
    const tagMeta = findTagByLabel(tags, task.chip);
    if (!courseChipClass && tagMeta) {
      courseChip.classList.add('gp-course-chip--custom');
      courseChip.style.setProperty('--gp-tag-fg', tagResolvedHex(tagMeta));
    }

    const statusChip = document.createElement('div');
    statusChip.className = `gp-filter-chip ${status.className}`;
    statusChip.dataset.status = statusKey;
    statusChip.setAttribute('role', 'group');
    statusChip.setAttribute('aria-label', `Status: ${status.label}`);

    const statusDot = document.createElement('span');
    statusDot.className = 'gp-filter-chip-dot';
    statusDot.setAttribute('aria-hidden', 'true');

    const statusLabel = document.createElement('span');
    statusLabel.className = 'gp-filter-chip-label';
    statusLabel.textContent = status.label;

    const statusMenuBtn = document.createElement('button');
    statusMenuBtn.type = 'button';
    statusMenuBtn.className = 'gp-filter-chip-menu-btn';
    statusMenuBtn.setAttribute('aria-haspopup', 'menu');
    statusMenuBtn.setAttribute('aria-controls', 'gp-status-menu');
    statusMenuBtn.setAttribute('aria-expanded', 'false');
    statusMenuBtn.setAttribute('aria-label', `Change task status: ${status.label}`);
    statusMenuBtn.innerHTML = `<span class="gp-filter-chip-trailing" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </span>`;

    statusChip.appendChild(statusDot);
    statusChip.appendChild(statusLabel);
    statusChip.appendChild(statusMenuBtn);
    meta.appendChild(courseChip);
    meta.appendChild(statusChip);
    body.appendChild(text);
    body.appendChild(meta);
    row.appendChild(checkbox);
    row.appendChild(body);

    return row;
  }

  function renderSidebarTasks(panel, state) {
    const accordion = panel?.querySelector('#gp-tasks-accordion');
    if (!accordion) return;
    if (isSidebarTitleEditActive()) return;

    const sidebarDueResume = takeMkDueSidebarEditorResume();
    if (sidebarDueResume) {
      closeMkDueEditor();
    }

    const buckets = {
      overdue: [],
      today: [],
      later: [],
      completed: [],
    };

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      getCardsForColumn(state, id).forEach((task) => {
        if (!cardMatchesBoardFilters(task, id, state.filters)) {
          return;
        }

        if (id === 'done') {
          buckets.completed.push({ task, columnId: id });
          return;
        }

        const folderKey = getTaskSidebarFolderKey(task);
        if (buckets[folderKey]) {
          buckets[folderKey].push({ task, columnId: id });
        }
      });
    });

    SIDEBAR_FOLDER_ORDER.forEach((folderKey) => {
      sortSidebarFolderEntries(buckets[folderKey] || []);
    });

    SIDEBAR_FOLDER_ORDER.forEach((folderKey) => {
      const folder = accordion.querySelector(`[data-folder="${folderKey}"]`);
      const inner = folder?.querySelector('.gp-task-folder-panel-inner');
      if (!inner) return;

      inner.innerHTML = '';
      (buckets[folderKey] || []).forEach(({ task, columnId }) => {
        inner.appendChild(renderSidebarTaskRow(task, columnId, state.tags));
      });
    });

    syncFolderCounts(accordion);
    if (sidebarDueResume) {
      resumeMkDueSidebarEditor(panel, state, sidebarDueResume);
    }
    const animCtx = gpFolderMoveAnimPending;
    gpFolderMoveAnimPending = null;
    if (animCtx && panel) {
      requestAnimationFrame(() => runSidebarFolderMoveAnimAfterRender(panel, accordion, animCtx));
    }
    const scrollTaskId = gpSidebarScrollToTaskIdPending;
    if (scrollTaskId) {
      gpSidebarScrollToTaskIdPending = null;
      requestAnimationFrame(() => {
        const scrollRow = panel.querySelector(`.gp-task-row[data-task-id="${scrollTaskId}"]`);
        const scrollEl = panel.querySelector('.gp-card');
        if (scrollRow && scrollEl) {
          scrollSidebarToCenterTask(scrollEl, scrollRow, panel, 'auto');
        }
      });
    }
  }

  function isKanbanDragActive() {
    return document.body.classList.contains('mytasks-kanban-dragging')
      || Boolean(document.querySelector('.mk-card.is-dragging'));
  }

  function refreshLinkedTaskViews(state, options = {}) {
    const normalized = normalizeKanbanState(state || kanbanStateCache || getDefaultKanbanState());
    const panel = document.getElementById('gp-panel');
    if (panel && !isSidebarTitleEditActive() && !options.skipSidebarRender) {
      renderSidebarTasks(panel, normalized);
    }

    const filterNav = document.querySelector('.mytasks-filter-nav');
    if (filterNav) {
      const canPatchFilters = Boolean(
        options.filtersOnly
        && filterNav.querySelector('[data-filter-list="view"] input'),
      );
      if (canPatchFilters) {
        patchKanbanFilterNav(filterNav, normalized);
      } else {
        renderKanbanFilterNav(filterNav, normalized);
      }
    }

    if (isKanbanDragActive()) return;

    const roots = [...document.querySelectorAll('.mytasks-kanban')];
    if (!roots.length) return;

    const filtersOnly = Boolean(options.filtersOnly);

    roots.forEach((root) => {
      const board = root.querySelector('.mytasks-kanban__board');
      const hasColumns = Boolean(board?.querySelector('.mk-column'));

      if (!filtersOnly || !hasColumns) {
        renderKanbanBoard(root, normalized);
        const nextBoard = root.querySelector('.mytasks-kanban__board');
        if (!nextBoard) return;
        nextBoard.dataset.dndWired = 'false';
        wireKanbanDragAndDrop(nextBoard);
      }

      applyKanbanBoardFilters(root, normalized, { animate: filtersOnly });
    });
  }

  async function syncTaskViewsFromStorage() {
    const state = await loadKanbanState();
    refreshLinkedTaskViews(state);
    return state;
  }

  function readSidebarStorage(keys) {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve({});
        return;
      }

      chrome.storage.local.get(keys, (result) => {
        resolve(result || {});
      });
    });
  }

  function writeSidebarStorage(data) {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve();
        return;
      }

      chrome.storage.local.set(data, () => {
        resolve();
      });
    });
  }

  function primeKanbanFiltersFromLocalStorage() {
    const stored = readFiltersFromLocalStorage();
    if (!stored) return null;

    const base = kanbanStateCache || getDefaultKanbanState();
    kanbanStateCache = normalizeKanbanState({
      ...base,
      filters: stored,
    });
    return kanbanStateCache;
  }

  async function loadKanbanState() {
    const stored = await readSidebarStorage([KANBAN_STORAGE_KEY]);
    const chromeState = stored[KANBAN_STORAGE_KEY];
    const lsFilters = readFiltersFromLocalStorage();

    kanbanStateCache = normalizeKanbanState({
      ...(chromeState || getDefaultKanbanState()),
      filters: {
        ...(chromeState?.filters || getDefaultKanbanFilters()),
        ...(lsFilters || {}),
      },
    });
    return kanbanStateCache;
  }

  async function saveKanbanState(state, options = {}) {
    const saveGeneration = ++kanbanFilterSaveGeneration;
    kanbanStateCache = normalizeKanbanState(state);
    persistFiltersToLocalStorage(kanbanStateCache.filters);
    await writeSidebarStorage({
      [KANBAN_STORAGE_KEY]: kanbanStateCache,
    });
    if (saveGeneration === kanbanFilterSaveGeneration) {
      refreshLinkedTaskViews(kanbanStateCache, options);
    }
    return kanbanStateCache;
  }

  function getKanbanFilterNavElement() {
    return document.querySelector('.mytasks-filter-nav');
  }

  function applyKanbanFilterDraft(nav, updates) {
    if (!kanbanStateCache) {
      kanbanStateCache = getDefaultKanbanState();
    }

    const nextFilters = updates?.clearAll
      ? getDefaultKanbanFilters()
      : normalizeKanbanFilters({
        ...kanbanStateCache.filters,
        ...updates,
        selectedTags: [],
      });

    kanbanStateCache = {
      ...kanbanStateCache,
      filters: nextFilters,
    };

    const filterNav = nav || getKanbanFilterNavElement();
    if (filterNav) {
      patchKanbanFilterNav(filterNav, kanbanStateCache);
    }

    if (isKanbanDragActive()) return kanbanStateCache;

    document.querySelectorAll('.mytasks-kanban').forEach((root) => {
      applyKanbanBoardFilters(root, kanbanStateCache, { animate: false });
      updateKanbanFilterBar(root, kanbanStateCache);
    });

    return kanbanStateCache;
  }

  function commitKanbanFilterUpdate(nav, updates, options = {}) {
    applyKanbanFilterDraft(nav, updates);
    return updateKanbanFilters(updates, options);
  }

  async function updateKanbanFilters(updates, options = {}) {
    if (!kanbanStateCache) {
      await loadKanbanState();
    }

    const base = kanbanStateCache || getDefaultKanbanState();
    const nextFilters = updates?.clearAll
      ? getDefaultKanbanFilters()
      : {
        ...base.filters,
        ...updates,
        selectedTags: [],
      };

    const state = {
      ...base,
      filters: normalizeKanbanFilters(nextFilters),
    };

    kanbanStateCache = state;
    return saveKanbanState(state, { filtersOnly: Boolean(options.filtersOnly) });
  }

  function renderCard(task) {
    const card = document.createElement('div');
    card.className = 'mk-card';
    card.draggable = false;
    card.dataset.cardId = task.id;
    card.dataset.chipColor = task.chipColor || resolveKanbanChipColor(task.chip, task.chipColor, task.courseKey);
    if (task.chipCustomHex) {
      card.dataset.chipCustomHex = task.chipCustomHex;
    } else {
      delete card.dataset.chipCustomHex;
    }
    card.dataset.starred = task.starred ? 'true' : 'false';
    if (task.chip) {
      card.dataset.chip = task.chip;
    }
    if (task.dueDate) {
      card.dataset.dueDate = task.dueDate;
    }
    if (task.dueTimeStart) {
      card.dataset.dueTimeStart = task.dueTimeStart;
    }
    if (task.dueTimeEnd) {
      card.dataset.dueTimeEnd = task.dueTimeEnd;
    }
    if (task.allDay) {
      card.dataset.allDay = 'true';
    }
    if (task.notes) {
      card.dataset.notes = task.notes;
    }
    if (task.subtasks?.length) {
      card.dataset.subtasks = JSON.stringify(task.subtasks);
    }

    const top = document.createElement('div');
    top.className = 'mk-card-top';

    const header = document.createElement('div');
    header.className = 'mk-card-header';

    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'mk-card-title';
    title.value = task.title;
    title.setAttribute('aria-label', 'Task title');
    title.spellcheck = true;
    title.autocomplete = 'off';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'mk-delete-btn';
    deleteBtn.draggable = false;
    deleteBtn.setAttribute('aria-label', 'Delete task');
    deleteBtn.innerHTML = MK_DELETE_TRASH_ICON_SVG;

    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = 'mk-star-btn';
    starBtn.draggable = false;
    starBtn.setAttribute('aria-label', 'Star task');
    starBtn.setAttribute('aria-pressed', task.starred ? 'true' : 'false');
    starBtn.textContent = task.starred ? '★' : '☆';
    starBtn.classList.toggle('is-starred', Boolean(task.starred));

    const headerActions = document.createElement('div');
    headerActions.className = 'mk-card-header-actions';
    headerActions.appendChild(deleteBtn);
    headerActions.appendChild(starBtn);

    header.appendChild(title);
    header.appendChild(headerActions);

    const due = document.createElement('div');
    due.className = 'mk-card-due mk-card-due-btn';
    mountDueScheduleInAnchor(due, task);

    top.appendChild(header);
    top.appendChild(due);

    const footer = document.createElement('div');
    footer.className = 'mk-card-footer';

    const chip = document.createElement('span');
    chip.className = `mk-chip mk-chip--${card.dataset.chipColor}`;
    chip.textContent = task.chip;
    if (card.dataset.chipColor === 'custom' && card.dataset.chipCustomHex) {
      chip.style.setProperty('--gp-mk-chip-fg', card.dataset.chipCustomHex);
    }

    footer.appendChild(chip);

    const deleteConfirm = document.createElement('div');
    deleteConfirm.className = 'mk-card-delete-confirm';
    deleteConfirm.setAttribute('aria-hidden', 'true');

    const deleteConfirmText = document.createElement('span');
    deleteConfirmText.className = 'mk-card-delete-confirm__text';
    deleteConfirmText.textContent = 'Delete this task?';

    const deleteConfirmActions = document.createElement('div');
    deleteConfirmActions.className = 'mk-card-delete-confirm__actions';

    const deleteConfirmBtn = document.createElement('button');
    deleteConfirmBtn.type = 'button';
    deleteConfirmBtn.className = 'mk-card-delete-confirm__delete';
    deleteConfirmBtn.textContent = 'Delete';

    const deleteCancelBtn = document.createElement('button');
    deleteCancelBtn.type = 'button';
    deleteCancelBtn.className = 'mk-card-delete-confirm__cancel';
    deleteCancelBtn.textContent = 'Cancel';

    deleteConfirmActions.appendChild(deleteConfirmBtn);
    deleteConfirmActions.appendChild(deleteCancelBtn);
    deleteConfirm.appendChild(deleteConfirmText);
    deleteConfirm.appendChild(deleteConfirmActions);

    card.appendChild(top);
    card.appendChild(footer);
    card.appendChild(deleteConfirm);
    attachMkCardSubtaskIndicator(card, task.subtasks);

    return card;
  }

  function serializeKanbanBoard(board) {
    const columns = {};
    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      columns[id] = [];
    });

    const seenIds = new Set();

    board.querySelectorAll('.mk-column').forEach((column) => {
      const colId = column.dataset.columnId;
      if (!KANBAN_COLUMN_DEFS.some((def) => def.id === colId)) return;

      const cardsEl = column.querySelector(':scope > .mk-column-cards');
      if (!cardsEl) return;

      cardsEl.querySelectorAll('.mk-card:not(.is-dragging)').forEach((cardEl) => {
        const cid = cardEl.dataset.cardId;
        if (!cid || seenIds.has(cid)) return;
        seenIds.add(cid);

        const subtasks = (() => {
          try {
            return cardEl.dataset.subtasks ? JSON.parse(cardEl.dataset.subtasks) : [];
          } catch (_) {
            return [];
          }
        })();

        columns[colId].push({
          id: cid,
          title: getKanbanCardTitleValue(cardEl) || 'Project Outline',
          dueDate: cardEl.dataset.dueDate || undefined,
          dueTimeStart: cardEl.dataset.dueTimeStart || undefined,
          dueTimeEnd: cardEl.dataset.dueTimeEnd || undefined,
          allDay: cardEl.dataset.allDay === 'true',
          due: cardEl.querySelector('.mk-card-due')?.textContent || 'Due Thurs, May 21',
          chip: cardEl.querySelector('.mk-chip')?.textContent || 'PSYC101',
          chipColor: cardEl.dataset.chipColor || 'blue',
          chipCustomHex: cardEl.dataset.chipCustomHex || undefined,
          starred: cardEl.dataset.starred === 'true',
          notes: cardEl.dataset.notes || '',
          subtasks: Array.isArray(subtasks) ? subtasks : [],
        });
      });
    });

    return { columns };
  }

  function collapseDuplicateKanbanIds(columns) {
    const claimed = new Set();
    const out = {};

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      out[id] = [];
    });

    [...KANBAN_COLUMN_DEFS].reverse().forEach(({ id }) => {
      (columns[id] || []).forEach((card) => {
        if (!card?.id || claimed.has(card.id)) return;
        claimed.add(card.id);
        out[id].push(card);
      });
    });

    return out;
  }

  function mergeSerializedKanbanColumns(board, state) {
    const serialized = serializeKanbanBoard(board).columns;
    const domIds = new Set();
    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      (serialized[id] || []).forEach((cardData) => {
        if (cardData.id) domIds.add(cardData.id);
      });
    });

    const columns = {};
    const existingById = new Map();

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      (state.columns[id] || []).forEach((card) => {
        existingById.set(card.id, { card, columnId: id });
      });
    });

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      const container = board.querySelector(`.mk-column-cards[data-column-id="${id}"]`);
      if (!container) return;

      const next = [];
      (serialized[id] || []).forEach((cardData) => {
        if (!cardData.id) return;

        const existing = existingById.get(cardData.id);
        next.push(existing
          ? {
            ...existing.card,
            ...cardData,
            dueDate: cardData.dueDate || existing.card.dueDate,
          }
          : normalizeKanbanCard(cardData, cardData.id, state.tags || []));
      });

      (state.columns[id] || []).forEach((card) => {
        if (domIds.has(card.id)) return;
        next.push(card);
      });

      columns[id] = next;
    });

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      if (columns[id] !== undefined) return;
      columns[id] = (state.columns[id] || []).filter((card) => !domIds.has(card.id));
    });

    return collapseDuplicateKanbanIds(columns);
  }

  function getCardsForColumn(state, columnId) {
    return state.columns[columnId] || [];
  }

  function ensureKanbanFilterBar(root) {
    if (!root) return null;

    let bar = root.querySelector('.mytasks-kanban__filter-bar');
    if (bar) return bar;

    const legacyToolbar = root.querySelector('.mytasks-kanban__toolbar');
    if (legacyToolbar) {
      legacyToolbar.remove();
    }

    bar = document.createElement('div');
    bar.className = 'mytasks-kanban__filter-bar';
    bar.hidden = true;
    bar.innerHTML = '<div class="mytasks-kanban__filter-pills" role="list" aria-label="Active filters"></div>';
    const board = root.querySelector('.mytasks-kanban__board');
    if (board) {
      root.insertBefore(bar, board);
    } else {
      root.appendChild(bar);
    }
    return bar;
  }

  function updateKanbanFilterBar(root, state) {
    const bar = ensureKanbanFilterBar(root);
    if (!bar) return;

    const pillsHost = bar.querySelector('.mytasks-kanban__filter-pills');
    if (!pillsHost) return;

    const pills = getKanbanActiveFilterPills(state);
    const hasFilters = pills.length > 0;

    bar.hidden = !hasFilters;
    bar.classList.toggle('is-visible', hasFilters);
    pillsHost.innerHTML = '';

    pills.forEach((pill) => {
      const item = document.createElement('span');
      item.className = 'mytasks-kanban__filter-pill';
      item.setAttribute('role', 'listitem');
      item.dataset.filterPillType = pill.type;
      item.dataset.filterPillId = pill.id;

      const label = document.createElement('span');
      label.className = 'mytasks-kanban__filter-pill-label';
      label.textContent = pill.label;

      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'mytasks-kanban__filter-pill-dismiss';
      dismiss.dataset.filterPillDismiss = 'true';
      dismiss.setAttribute('aria-label', `Remove ${pill.label} filter`);
      dismiss.textContent = '×';

      item.appendChild(label);
      item.appendChild(dismiss);
      pillsHost.appendChild(item);
    });
  }

  function buildKanbanColumnHeader(label, filtered) {
    const title = document.createElement('h3');
    title.className = 'mk-column-header';
    if (filtered) {
      title.classList.add('mk-column-header--filtered');
    }

    const labelEl = document.createElement('span');
    labelEl.className = 'mk-column-header__label';
    labelEl.textContent = label;
    title.appendChild(labelEl);

    if (filtered) {
      const badge = document.createElement('span');
      badge.className = 'mk-column-header__filter-badge';
      badge.textContent = 'Filtered';
      badge.setAttribute('aria-label', 'Board is filtered');
      title.appendChild(badge);
    }

    return title;
  }

  function syncKanbanColumnFilterHeaders(board, filtered) {
    if (!board) return;

    board.querySelectorAll('.mk-column').forEach((column) => {
      const columnId = column.dataset.columnId;
      const def = KANBAN_COLUMN_DEFS.find(({ id }) => id === columnId);
      const label = def?.label || columnId || '';
      const existingHeader = column.querySelector('.mk-column-header');

      if (!existingHeader) return;

      const replacement = buildKanbanColumnHeader(label, filtered);
      existingHeader.replaceWith(replacement);
    });
  }

  function buildKanbanColumnEmptyState() {
    const empty = document.createElement('div');
    empty.className = 'mk-column-empty';
    empty.setAttribute('aria-hidden', 'true');
    empty.innerHTML = `
      <span class="mk-column-empty__icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 4h16v16H4z"></path>
          <path d="M4 9h16"></path>
          <path d="M9 4v16"></path>
        </svg>
      </span>
      <p class="mk-column-empty__text">No tasks match this filter</p>
    `;
    return empty;
  }

  function syncKanbanColumnEmptyState(column, visibleCount, filtered) {
    const cardsContainer = column?.querySelector('.mk-column-cards');
    if (!cardsContainer) return;

    let empty = cardsContainer.querySelector('.mk-column-empty');
    if (!filtered || visibleCount > 0) {
      empty?.remove();
      return;
    }

    if (!empty) {
      empty = buildKanbanColumnEmptyState();
      cardsContainer.appendChild(empty);
    }
    empty.hidden = false;
  }

  function setKanbanCardFilterVisibility(cardEl, matches, animate) {
    const wasHidden = cardEl.classList.contains('mk-card--filter-hidden')
      || cardEl.classList.contains('mk-card--filter-collapsed');

    cardEl.setAttribute('aria-hidden', matches ? 'false' : 'true');

    if (!animate) {
      cardEl.classList.toggle('mk-card--filter-hidden', !matches);
      cardEl.classList.toggle('mk-card--filter-collapsed', !matches);
      cardEl.classList.remove('mk-card--filter-leave', 'mk-card--filter-enter', 'mk-card--filter-enter-active');
      return;
    }

    if (matches) {
      cardEl.classList.remove('mk-card--filter-leave');
      if (wasHidden) {
        cardEl.classList.remove('mk-card--filter-collapsed', 'mk-card--filter-hidden');
        cardEl.classList.add('mk-card--filter-enter');
        requestAnimationFrame(() => {
          cardEl.classList.add('mk-card--filter-enter-active');
        });
        window.setTimeout(() => {
          cardEl.classList.remove('mk-card--filter-enter', 'mk-card--filter-enter-active');
        }, KANBAN_FILTER_ANIM_MS);
      }
      return;
    }

    if (!wasHidden) {
      cardEl.classList.add('mk-card--filter-leave');
      window.setTimeout(() => {
        cardEl.classList.remove('mk-card--filter-leave');
        cardEl.classList.add('mk-card--filter-collapsed', 'mk-card--filter-hidden');
      }, KANBAN_FILTER_ANIM_MS);
      return;
    }

    cardEl.classList.add('mk-card--filter-hidden', 'mk-card--filter-collapsed');
  }

  function applyKanbanBoardFilters(root, state, options = {}) {
    const board = root?.querySelector('.mytasks-kanban__board');
    if (!board) return;

    const filters = state.filters || getDefaultKanbanFilters();
    const filtered = isBoardFilterActive(filters);
    const animate = options.animate !== false;
    board.classList.toggle('mytasks-kanban__board--filtered', filtered);
    board.classList.remove('mytasks-kanban__board--single-column');

    syncKanbanColumnFilterHeaders(board, filtered);

    board.querySelectorAll('.mk-column').forEach((column) => {
      const columnId = column.dataset.columnId;
      let visibleCount = 0;

      column.querySelectorAll('.mk-card').forEach((cardEl) => {
        const located = findKanbanCardInState(state, cardEl.dataset.cardId);
        const card = located?.card;
        const matchColumnId = columnId || located?.columnId;
        const matches = card
          ? cardMatchesBoardFilters(card, matchColumnId, filters)
          : !filtered;

        setKanbanCardFilterVisibility(cardEl, matches, animate);
        if (matches) visibleCount += 1;
      });

      syncKanbanColumnEmptyState(column, visibleCount, filtered);
    });

    updateKanbanFilterBar(root, state);
  }

  function renderKanbanBoard(root, state) {
    const board = root?.querySelector('.mytasks-kanban__board');
    if (!board) return;

    clearMkDeleteConfirm();

    const filtered = isBoardFilterActive(state.filters);
    board.classList.remove('mytasks-kanban__board--single-column');
    board.classList.toggle('mytasks-kanban__board--filtered', filtered);
    board.innerHTML = '';

    KANBAN_COLUMN_DEFS.forEach(({ id, label }) => {
      const column = document.createElement('div');
      column.className = 'mk-column';
      column.dataset.columnId = id;

      const title = buildKanbanColumnHeader(label, filtered);

      const cards = document.createElement('div');
      cards.className = 'mk-column-cards';
      cards.dataset.columnId = id;

      getCardsForColumn(state, id).forEach((card) => {
        const cardEl = renderCard(card);
        if (!cardMatchesBoardFilters(card, id, state.filters)) {
          cardEl.classList.add('mk-card--filter-hidden', 'mk-card--filter-collapsed');
        }
        cards.appendChild(cardEl);
      });

      column.appendChild(title);
      column.appendChild(cards);
      board.appendChild(column);
    });

    updateKanbanFilterBar(root, state);
    applyKanbanBoardFilters(root, state, { animate: false });
  }

  function createKanbanShell() {
    const root = document.createElement('div');
    root.className = 'mytasks-kanban';

    const filterBar = document.createElement('div');
    filterBar.className = 'mytasks-kanban__filter-bar';
    filterBar.hidden = true;
    filterBar.innerHTML = '<div class="mytasks-kanban__filter-pills" role="list" aria-label="Active filters"></div>';

    const board = document.createElement('div');
    board.className = 'mytasks-kanban__board';
    board.setAttribute('aria-label', 'Kanban board');

    root.appendChild(filterBar);
    root.appendChild(board);
    return root;
  }

  let gpGlobalTaskModalsWired = false;
  let gpManageTagsDraft = null;
  let gpResumeCreateTaskLayerAfterTags = false;
  function getGlobalTaskModalsRoot() {
    return document.getElementById('gp-task-modals-root');
  }

  function buildGlobalTaskModalsMarkup() {
    return `
<div id="gp-task-modals-root" class="gp-task-modals-root" hidden>
  <div id="gp-ct-layer" class="gp-ct-layer" hidden>
    <div class="gp-ct-scrim" data-gp-ct-dismiss="true" aria-hidden="true"></div>
    <div class="gp-ct-dialog" role="dialog" aria-modal="true" aria-labelledby="gp-ct-heading">
      <header class="gp-ct-header">
        <div class="gp-ct-header-chrome" aria-hidden="true">
          <span class="gp-ct-drag" aria-hidden="true">
            <span class="gp-ct-drag-dot"></span>
            <span class="gp-ct-drag-dot"></span>
            <span class="gp-ct-drag-dot"></span>
          </span>
          <span class="gp-ct-task-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11l3 3L22 4"></path>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
          </span>
          <span id="gp-ct-heading" class="gp-ct-header-title">Task</span>
        </div>
        <button type="submit" form="gp-ct-form" class="gp-ct-btn gp-ct-btn--primary gp-ct-header-save" tabindex="-1" aria-hidden="true">Save</button>
        <button type="button" class="gp-ct-icon-btn gp-ct-close-btn" data-gp-ct-dismiss="true" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>
      <form id="gp-ct-form" class="gp-ct-form" novalidate>
        <input type="hidden" name="column" id="gp-ct-column" value="todo">
        <input type="hidden" name="chip" id="gp-ct-chip" value="">
        <div class="gp-ct-field gp-ct-field--title">
          <input class="gp-ct-title-input" name="title" type="text" autocomplete="off" placeholder="Add title" aria-label="Task title">
        </div>
        <div class="gp-ct-row gp-ct-row--date">
          <span class="gp-ct-row-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9"></circle>
              <polyline points="12 7 12 12 15 14"></polyline>
            </svg>
          </span>
          <div class="gp-ct-date-cluster">
            <div class="gp-ct-datetime-bar">
              <div class="gp-ct-date-anchor">
                <button type="button" class="gp-ct-date-btn" id="gp-ct-date-btn" aria-expanded="false" aria-haspopup="dialog" aria-label="Due date">
                  <span id="gp-ct-date-btn-label"></span>
                </button>
                <input type="hidden" name="dueDate" id="gp-ct-due-date" value="">
                <div class="gp-ct-cal-pop" id="gp-ct-cal-pop" hidden role="dialog" aria-label="Choose date">
                  <div class="gp-ct-cal-head">
                    <span class="gp-ct-cal-mo" id="gp-ct-cal-month-label"></span>
                    <div class="gp-ct-cal-nav">
                      <button type="button" class="gp-ct-cal-nav-btn" id="gp-ct-cal-prev" aria-label="Previous month">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                      </button>
                      <button type="button" class="gp-ct-cal-nav-btn" id="gp-ct-cal-next" aria-label="Next month">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                      </button>
                    </div>
                  </div>
                  <div class="gp-ct-cal-weekdays" aria-hidden="true">
                    <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                  </div>
                  <div class="gp-ct-cal-grid" id="gp-ct-cal-grid"></div>
                </div>
              </div>
              <span class="gp-ct-time-dash" aria-hidden="true">—</span>
              <div class="gp-ct-time-slot">
                <input type="hidden" name="dueTimeStart" id="gp-ct-time-start" value="">
                <button type="button" class="gp-ct-time-btn" id="gp-ct-time-start-btn" aria-expanded="false" aria-haspopup="listbox" aria-label="Start time">
                  <span id="gp-ct-time-start-label">6:30pm</span>
                </button>
              </div>
              <div class="gp-ct-time-slot">
                <input type="hidden" name="dueTimeEnd" id="gp-ct-time-end" value="">
                <button type="button" class="gp-ct-time-btn" id="gp-ct-time-end-btn" aria-expanded="false" aria-haspopup="listbox" aria-label="End time">
                  <span id="gp-ct-time-end-label">7:30pm</span>
                </button>
              </div>
              <div id="gp-ct-time-pop" class="gp-ct-time-pop" hidden role="listbox" aria-label="Choose time">
                <div id="gp-ct-time-list" class="gp-ct-time-list"></div>
              </div>
            </div>
            <div class="gp-ct-schedule-options">
              <label class="gp-ct-allday" for="gp-ct-allday">
                <input type="checkbox" class="gp-ct-allday-check" id="gp-ct-allday" name="allDay" value="1">
                <span class="gp-ct-allday-label">All day</span>
              </label>
            </div>
          </div>
        </div>
        <div class="gp-ct-section gp-ct-section--tags" id="gp-ct-tag-section">
          <div class="gp-ct-section-label">Category</div>
          <button type="button" class="gp-ct-text-btn" id="gp-ct-manage-tags" hidden>Manage tags</button>
          <div class="gp-ct-chip-scroll" id="gp-ct-chip-scroll">
            <div class="gp-ct-chip-row" id="gp-ct-chip-row" role="listbox" aria-label="Category tag"></div>
          </div>
          <div id="gp-ct-new-tag" class="gp-ct-new-tag" hidden>
            <span class="gp-ct-new-tag-dot" id="gp-ct-new-tag-dot"></span>
            <input type="text" id="gp-ct-new-tag-input" class="gp-ct-new-tag-input" maxlength="40" placeholder="Tag name" aria-label="New tag name">
            <button type="button" class="gp-ct-btn gp-ct-btn--primary gp-ct-btn--small" id="gp-ct-new-tag-add">Add</button>
            <button type="button" class="gp-ct-icon-btn gp-ct-icon-btn--small" id="gp-ct-new-tag-cancel" aria-label="Cancel new tag">×</button>
            <div id="gp-ct-color-pop" class="gp-ct-color-pop" hidden role="listbox" aria-label="Tag color"></div>
          </div>
        </div>
        <div class="gp-ct-section">
          <div class="gp-ct-section-label">Status</div>
          <div class="gp-ct-segmented" role="radiogroup" aria-label="Task status">
            <button type="button" class="gp-ct-seg is-active" data-gp-ct-status="todo" role="radio" aria-checked="true">Planned</button>
            <button type="button" class="gp-ct-seg" data-gp-ct-status="progress" role="radio" aria-checked="false">In progress</button>
            <button type="button" class="gp-ct-seg" data-gp-ct-status="done" role="radio" aria-checked="false">Done</button>
          </div>
        </div>
        <div class="gp-ct-row gp-ct-row--notes">
          <span class="gp-ct-row-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </span>
          <textarea class="gp-ct-notes" name="notes" rows="2" placeholder="Add description" aria-label="Description"></textarea>
        </div>
        <div class="gp-ct-section">
          <div class="gp-ct-section-label">Subtasks</div>
          <div class="gp-ct-subtasks-wrap">
            <div id="gp-ct-subtasks-list" class="gp-ct-subtasks-list"></div>
            <div class="gp-ct-subtasks-footer">
              <button type="button" class="gp-ct-text-btn gp-ct-add-subtask-btn" id="gp-ct-add-subtask">+ Add subtask</button>
              <p class="gp-ct-hint">Subtasks are saved with the task</p>
            </div>
          </div>
        </div>
        <footer class="gp-ct-footer">
          <div class="gp-ct-footer-right">
            <button type="button" class="gp-ct-btn gp-ct-btn--text" data-gp-ct-dismiss="true">Cancel</button>
            <button type="submit" class="gp-ct-btn gp-ct-btn--primary">Save</button>
          </div>
        </footer>
      </form>
    </div>
  </div>

  <div id="gp-mt-layer" class="gp-mt-layer" hidden>
    <div class="gp-mt-scrim" data-gp-mt-dismiss="true"></div>
    <div class="gp-mt-dialog" role="dialog" aria-modal="true" aria-labelledby="gp-mt-title">
      <h2 id="gp-mt-title" class="gp-mt-title">Your tags</h2>
      <p class="gp-mt-sub">Assign colors to classify your tasks. Tags appear on tasks and in the kanban board.</p>
      <div id="gp-mt-rows" class="gp-mt-rows"></div>
      <button type="button" class="gp-mt-add" id="gp-mt-add-row" aria-label="Add tag">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
      <div class="gp-mt-actions">
        <button type="button" class="gp-ct-btn gp-ct-btn--text" id="gp-mt-cancel">Cancel</button>
        <button type="button" class="gp-ct-btn gp-ct-btn--primary" id="gp-mt-save">Save</button>
      </div>
    </div>
  </div>

</div>`.trim();
  }

  function ensureGlobalTaskModals() {
    if (getGlobalTaskModalsRoot()) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = buildGlobalTaskModalsMarkup();
    const modRoot = wrap.firstElementChild;
    if (!modRoot) return;
    document.body.appendChild(modRoot);
    wireGlobalTaskModalsOnce();
  }

  function resetCreateTaskTagSectionEngagement() {
    const tagSection = document.getElementById('gp-ct-tag-section');
    const manageBtn = document.getElementById('gp-ct-manage-tags');
    if (tagSection) delete tagSection.dataset.tagsEngaged;
    if (manageBtn) manageBtn.hidden = true;
  }

  function openGlobalCreateTaskModal(options = {}) {
    ensureGlobalTaskModals();
    const root = getGlobalTaskModalsRoot();
    const layer = document.getElementById('gp-ct-layer');
    const form = document.getElementById('gp-ct-form');
    if (!root || !layer || !form) return;

    const preferredColumnId = options.preferredColumnId;
    void loadKanbanState().then((state) => {
      const col = preferredColumnId || getDefaultCreateColumnId(state);
      const colInput = document.getElementById('gp-ct-column');
      if (colInput) colInput.value = col;

      document.querySelectorAll('.gp-ct-seg').forEach((btn) => {
        const active = btn.dataset.gpCtStatus === col;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
      });

      form.reset();
      if (colInput) colInput.value = col;
      const chipInput = document.getElementById('gp-ct-chip');
      if (chipInput) chipInput.value = '';

      resetCreateTaskSubtasks();

      const newTagEl = document.getElementById('gp-ct-new-tag');
      if (newTagEl) newTagEl.hidden = true;
      const colorPop = document.getElementById('gp-ct-color-pop');
      if (colorPop) {
        colorPop.hidden = true;
        colorPop.innerHTML = '';
      }

      renderCreateTaskTagChips(state);
      syncCreateTaskStatusSegments(col);

      resetCreateTaskTagSectionEngagement();

      const mtLayer = document.getElementById('gp-mt-layer');
      if (mtLayer) mtLayer.hidden = true;
      gpResumeCreateTaskLayerAfterTags = false;
      gpManageTagsDraft = null;

      const due = document.getElementById('gp-ct-due-date');
      if (due && !due.value) {
        due.value = formatDueDateIso(new Date());
      }
      setCreateTaskDueIso(due?.value || formatDueDateIso(new Date()));

      setCreateTaskTimeFieldsFromHm('18:30', '19:30');
      resetCreateTaskAllDay();
      closeCreateTaskCalendar();

      root.hidden = false;
      layer.hidden = false;
      document.body.classList.add('gp-task-modals-open');

      const kr = getActiveKanbanRoot();
      if (kr) kr.classList.add('is-modal-open');

      queueMicrotask(() => {
        form.querySelector('.gp-ct-title-input')?.focus();
      });
    });
  }

  function closeGlobalCreateTaskModal() {
    closeGpCtSpectrumPop();
    closeCreateTaskCalendar();
    closeCreateTaskTimePop();
    const root = getGlobalTaskModalsRoot();
    const layer = document.getElementById('gp-ct-layer');
    const mt = document.getElementById('gp-mt-layer');
    if (layer) layer.hidden = true;
    const kanbanRoot = getActiveKanbanRoot();
    if (kanbanRoot) kanbanRoot.classList.remove('is-modal-open');
    if (mt && !mt.hidden) {
      return;
    }
    if (root) root.hidden = true;
    document.body.classList.remove('gp-task-modals-open');
  }

  function syncCreateTaskStatusSegments(columnId) {
    document.querySelectorAll('.gp-ct-seg').forEach((btn) => {
      const active = btn.dataset.gpCtStatus === columnId;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    const colInput = document.getElementById('gp-ct-column');
    if (colInput) colInput.value = columnId;
  }

  function renderCreateTaskTagChips(state) {
    const row = document.getElementById('gp-ct-chip-row');
    if (!row) return;
    row.innerHTML = '';
    const tags = (state.tags || []).filter((t) => !t.hidden);
    const chipVal = document.getElementById('gp-ct-chip')?.value;

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'gp-ct-chip gp-ct-chip--dashed';
    addBtn.id = 'gp-ct-chip-new';
    addBtn.setAttribute('role', 'option');
    addBtn.setAttribute('aria-selected', 'false');
    addBtn.textContent = '+ New';
    row.appendChild(addBtn);

    tags.forEach((tag) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gp-ct-chip';
      btn.dataset.tagId = tag.id;
      btn.setAttribute('role', 'option');
      const selected = chipVal === tag.label || (!chipVal && tag.label === tags[0]?.label);
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
      btn.classList.toggle('is-selected', selected);
      const dot = document.createElement('span');
      dot.className = 'gp-ct-chip-dot';
      dot.style.background = tagResolvedHex(tag);
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(tag.label));
      row.appendChild(btn);
    });

    const chipInput = document.getElementById('gp-ct-chip');
    if (chipInput && !chipInput.value && tags[0]) {
      chipInput.value = tags[0].label;
    }
  }

  function applyInlineNewTagCustomColorFromPicker(rawHex) {
    const hex = normalizeHexColor(rawHex);
    if (!hex) return;
    selectNewTagDotColor('custom', hex);
  }

  function normalizeCustomPaletteColors(raw) {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((c) => normalizeHexColor(c)).filter(Boolean))]
      .slice(0, GP_CUSTOM_PALETTE_MAX);
  }

  function loadCustomPaletteColors() {
    return [...gpCustomPaletteCache];
  }

  async function ensureCustomPaletteCache() {
    if (gpCustomPaletteCacheReady) return loadCustomPaletteColors();

    let colors = [];
    try {
      const stored = await readSidebarStorage([GP_CUSTOM_PALETTE_STORAGE_KEY]);
      colors = normalizeCustomPaletteColors(stored[GP_CUSTOM_PALETTE_STORAGE_KEY]);
    } catch (_) {
      colors = [];
    }

    if (!colors.length) {
      try {
        const raw = localStorage.getItem(GP_CUSTOM_PALETTE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        colors = normalizeCustomPaletteColors(parsed);
        if (colors.length) {
          await writeSidebarStorage({ [GP_CUSTOM_PALETTE_STORAGE_KEY]: colors });
          try {
            localStorage.removeItem(GP_CUSTOM_PALETTE_STORAGE_KEY);
          } catch (_) {
            /* ignore */
          }
        }
      } catch (_) {
        colors = [];
      }
    }

    gpCustomPaletteCache = colors;
    gpCustomPaletteCacheReady = true;
    return loadCustomPaletteColors();
  }

  function saveCustomPaletteColors(colors) {
    const normalized = normalizeCustomPaletteColors(colors);
    gpCustomPaletteCache = normalized;
    gpCustomPaletteCacheReady = true;
    void writeSidebarStorage({ [GP_CUSTOM_PALETTE_STORAGE_KEY]: normalized });
    return normalized;
  }

  function normalizeHiddenPresetKeys(raw) {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter((k) => TAG_PALETTE_KEYS.includes(k)))];
  }

  function loadHiddenPresetKeys() {
    return [...gpHiddenPresetCache];
  }

  async function ensureHiddenPresetCache() {
    if (gpHiddenPresetCacheReady) return loadHiddenPresetKeys();

    let hidden = [];
    try {
      const stored = await readSidebarStorage([GP_HIDDEN_PRESET_PALETTE_STORAGE_KEY]);
      hidden = normalizeHiddenPresetKeys(stored[GP_HIDDEN_PRESET_PALETTE_STORAGE_KEY]);
    } catch (_) {
      hidden = [];
    }

    gpHiddenPresetCache = hidden;
    gpHiddenPresetCacheReady = true;
    return loadHiddenPresetKeys();
  }

  function saveHiddenPresetKeys(keys) {
    const normalized = normalizeHiddenPresetKeys(keys);
    gpHiddenPresetCache = normalized;
    gpHiddenPresetCacheReady = true;
    void writeSidebarStorage({ [GP_HIDDEN_PRESET_PALETTE_STORAGE_KEY]: normalized });
    return normalized;
  }

  function loadVisiblePresetKeys() {
    const hidden = new Set(loadHiddenPresetKeys());
    const visible = TAG_PALETTE_KEYS.filter((k) => !hidden.has(k));
    return visible.length ? visible : [...TAG_PALETTE_KEYS];
  }

  async function ensurePaletteCaches() {
    await Promise.all([ensureCustomPaletteCache(), ensureHiddenPresetCache()]);
  }

  function clearGpCtPaletteDeletePending() {
    if (gpCtPaletteDeletePending?.timeoutId) {
      clearTimeout(gpCtPaletteDeletePending.timeoutId);
    }
    if (gpCtPaletteDeletePending?.swatchEl) {
      gpCtPaletteDeletePending.swatchEl.classList.remove('is-delete-pending');
      const tip = gpCtPaletteDeletePending.swatchEl.querySelector('.gp-ct-swatch-delete-tip');
      if (tip) tip.hidden = true;
    }
    gpCtPaletteDeletePending = null;
  }

  function syncTagColorPopSelection(pop, selectedColorKey, selectedCustomHex) {
    if (!pop) return;
    const hex = normalizeHexColor(selectedCustomHex);
    const visiblePresets = loadVisiblePresetKeys();
    const key = selectedColorKey === 'custom'
      ? 'custom'
      : (visiblePresets.includes(selectedColorKey) ? selectedColorKey : visiblePresets[0]);

    pop.querySelectorAll('.gp-ct-color-swatch').forEach((sw) => {
      const isCustom = sw.classList.contains('is-palette-custom');
      let selected = false;
      if (isCustom && key === 'custom' && hex) {
        selected = normalizeHexColor(sw.dataset.paletteHex) === hex;
      } else if (!isCustom && key !== 'custom') {
        selected = sw.dataset.colorKey === key;
      }
      sw.classList.toggle('is-selected', selected);
    });
    pop.querySelector('.gp-ct-color-custom-hit')?.classList.remove('is-selected');
  }

  function selectNewTagDotColor(colorKey, customHex) {
    const dot = document.getElementById('gp-ct-new-tag-dot');
    if (!dot) return;

    if (colorKey === 'custom' && normalizeHexColor(customHex)) {
      const hex = normalizeHexColor(customHex);
      dot.dataset.colorKey = 'custom';
      dot.dataset.customHex = hex;
      dot.style.background = hex;
    } else {
      const visible = loadVisiblePresetKeys();
      const key = visible.includes(colorKey)
        ? colorKey
        : (visible.includes(TAG_PALETTE_KEYS[0]) ? TAG_PALETTE_KEYS[0] : visible[0]);
      delete dot.dataset.customHex;
      dot.dataset.colorKey = key;
      dot.style.background = TAG_HEX_BY_KEY[key];
    }

    syncTagColorPopSelection(document.getElementById('gp-ct-color-pop'), dot.dataset.colorKey, dot.dataset.customHex);
  }

  function appendPaletteSwatchDeleteUi(swatch) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'gp-ct-swatch-delete';
    del.setAttribute('aria-label', 'Remove color');
    del.textContent = '×';

    const tip = document.createElement('span');
    tip.className = 'gp-ct-swatch-delete-tip';
    tip.textContent = 'Click again to remove';
    tip.hidden = true;

    swatch.appendChild(del);
    swatch.appendChild(tip);
  }

  function getPaletteSwatchDeleteTarget(swatch) {
    if (!swatch) return null;
    if (swatch.classList.contains('is-palette-custom')) {
      const hex = normalizeHexColor(swatch.dataset.paletteHex);
      return hex ? { kind: 'custom', id: hex } : null;
    }
    if (swatch.classList.contains('is-palette-preset')) {
      const key = swatch.dataset.colorKey;
      return TAG_PALETTE_KEYS.includes(key) ? { kind: 'preset', id: key } : null;
    }
    return null;
  }

  function createPresetColorSwatch(key, selectedKey) {
    const swatch = document.createElement('div');
    swatch.className = 'gp-ct-color-swatch is-palette-preset';
    swatch.dataset.colorKey = key;
    swatch.style.background = TAG_HEX_BY_KEY[key];
    swatch.setAttribute('role', 'option');
    swatch.setAttribute('aria-label', `Color ${key}`);

    const chk = document.createElement('span');
    chk.className = 'gp-ct-swatch-check';
    chk.setAttribute('aria-hidden', 'true');
    chk.innerHTML = GP_CT_SWATCH_CHECK_SVG;

    swatch.appendChild(chk);
    appendPaletteSwatchDeleteUi(swatch);
    if (key === selectedKey) swatch.classList.add('is-selected');
    return swatch;
  }

  function createCustomPaletteSwatch(hex) {
    const swatch = document.createElement('div');
    swatch.className = 'gp-ct-color-swatch is-palette-custom';
    swatch.dataset.colorKey = 'custom';
    swatch.dataset.paletteHex = hex;
    swatch.style.background = hex;
    swatch.setAttribute('role', 'option');
    swatch.setAttribute('aria-label', `Custom color ${hex}`);

    const chk = document.createElement('span');
    chk.className = 'gp-ct-swatch-check';
    chk.setAttribute('aria-hidden', 'true');
    chk.innerHTML = GP_CT_SWATCH_CHECK_SVG;

    swatch.appendChild(chk);
    appendPaletteSwatchDeleteUi(swatch);
    return swatch;
  }

  function ensureGpCtColorAddPanel(pop) {
    let panel = pop.querySelector('.gp-ct-color-add-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.className = 'gp-ct-color-add-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Add custom color');
    panel.innerHTML = `
      <div class="gp-ct-color-add-card">
        <div class="gp-ct-color-add-inner">
          <div class="gp-ct-add-sv-surface">
            <div class="gp-ct-add-sv-bg"></div>
            <div class="gp-ct-add-sv-grad-s" aria-hidden="true"></div>
            <div class="gp-ct-add-sv-grad-v" aria-hidden="true"></div>
            <div class="gp-ct-add-sv-marker"></div>
          </div>
          <div class="gp-ct-add-controls">
            <button type="button" class="gp-ct-add-eyedropper" aria-label="Pick color from screen">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="m2 22 1-1h3l9.5-9.5a2.12 2.12 0 0 0-3-3L3 18v3Z"></path>
                <path d="M14 6l4-4"></path>
                <path d="m18 2 4 4"></path>
              </svg>
            </button>
            <span class="gp-ct-add-preview" aria-hidden="true"></span>
            <div class="gp-ct-add-hue-wrap">
              <div class="gp-ct-add-hue-strip">
                <div class="gp-ct-add-hue-marker"></div>
              </div>
            </div>
          </div>
          <div class="gp-ct-add-rgb-row">
            <label class="gp-ct-add-rgb-field">
              <input type="number" class="gp-ct-add-r" min="0" max="255" inputmode="numeric" aria-label="Red">
              <span class="gp-ct-add-rgb-label">R</span>
            </label>
            <label class="gp-ct-add-rgb-field">
              <input type="number" class="gp-ct-add-g" min="0" max="255" inputmode="numeric" aria-label="Green">
              <span class="gp-ct-add-rgb-label">G</span>
            </label>
            <label class="gp-ct-add-rgb-field">
              <input type="number" class="gp-ct-add-b" min="0" max="255" inputmode="numeric" aria-label="Blue">
              <span class="gp-ct-add-rgb-label">B</span>
            </label>
            <button type="button" class="gp-ct-add-format-toggle" aria-label="Toggle hex mode" aria-pressed="false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polyline points="18 15 12 9 6 15"></polyline>
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
          <div class="gp-ct-add-footer-row">
            <span class="gp-ct-add-hex-preview" aria-hidden="true"></span>
            <input type="text" class="gp-ct-add-hex" maxlength="7" autocomplete="off" spellcheck="false" placeholder="#000000" aria-label="Hex color">
            <button type="button" class="gp-ct-color-add-confirm" data-gp-ct-color-add="confirm">Add</button>
          </div>
        </div>
      </div>
      <button type="button" class="gp-ct-color-add-cancel" data-gp-ct-color-add="cancel">Cancel</button>`.trim();

    pop.prepend(panel);
    wireGpCtColorAddPanel(panel);
    return panel;
  }

  function closeGpCtColorAddPanel() {
    const pop = document.getElementById('gp-ct-color-pop');
    const panel = pop?.querySelector('.gp-ct-color-add-panel');
    if (panel) {
      panel.hidden = true;
      panel.querySelector('.gp-ct-color-add-card')?.classList.remove('is-hex-mode');
    }
  }

  function openGpCtColorAddPanel() {
    const pop = document.getElementById('gp-ct-color-pop');
    if (!pop) return;
    clearGpCtPaletteDeletePending();
    const panel = ensureGpCtColorAddPanel(pop);
    const dot = document.getElementById('gp-ct-new-tag-dot');
    let seed = '#1a73e8';
    if (dot?.dataset.colorKey === 'custom' && dot.dataset.customHex) {
      seed = normalizeHexColor(dot.dataset.customHex) || seed;
    } else if (dot?.dataset.colorKey && TAG_HEX_BY_KEY[dot.dataset.colorKey]) {
      seed = TAG_HEX_BY_KEY[dot.dataset.colorKey];
    }
    setGpCtSpectrumFromHex(seed);
    pop.prepend(panel);
    panel.hidden = false;
    renderGpCtColorAddPanelUi(panel);
    const hexIn = panel.querySelector('.gp-ct-add-hex');
    hexIn?.focus();
    hexIn?.select();
  }

  async function confirmGpCtColorAdd() {
    const pop = document.getElementById('gp-ct-color-pop');
    const panel = pop?.querySelector('.gp-ct-color-add-panel');
    const hexIn = panel?.querySelector('.gp-ct-add-hex');
    const hx = normalizeHexColor(hexIn?.value) || getGpCtSpectrumHex();
    if (!hx) return;

    await ensureCustomPaletteCache();
    const colors = loadCustomPaletteColors();
    if (!colors.includes(hx)) {
      saveCustomPaletteColors([...colors, hx]);
    }
    closeGpCtColorAddPanel();

    renderTagColorPop(pop, {
      selectedColorKey: 'custom',
      selectedCustomHex: hx,
    });
    selectNewTagDotColor('custom', hx);
  }

  async function removeCustomPaletteColor(hex) {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return;
    await ensureCustomPaletteCache();
    saveCustomPaletteColors(loadCustomPaletteColors().filter((c) => c !== normalized));

    const dot = document.getElementById('gp-ct-new-tag-dot');
    if (dot?.dataset.colorKey === 'custom' && normalizeHexColor(dot.dataset.customHex) === normalized) {
      selectNewTagDotColor(loadVisiblePresetKeys()[0], null);
    }
  }

  async function removePresetPaletteColor(key) {
    if (!TAG_PALETTE_KEYS.includes(key)) return;
    await ensureHiddenPresetCache();
    const hidden = loadHiddenPresetKeys();
    if (!hidden.includes(key)) {
      saveHiddenPresetKeys([...hidden, key]);
    }

    const dot = document.getElementById('gp-ct-new-tag-dot');
    if (dot?.dataset.colorKey === key) {
      selectNewTagDotColor(loadVisiblePresetKeys()[0], null);
    }
  }

  function renderTagColorPop(pop, options = {}) {
    if (!pop) return;
    clearGpCtPaletteDeletePending();
    closeGpCtColorAddPanel();
    closeGpCtSpectrumPop();

    const selectedColorKey = options.selectedColorKey || loadVisiblePresetKeys()[0];
    const selectedCustomHex = normalizeHexColor(options.selectedCustomHex);
    const presetSelected = selectedColorKey === 'custom' ? null : selectedColorKey;

    let addPanel = pop.querySelector('.gp-ct-color-add-panel');
    [...pop.childNodes].forEach((node) => {
      if (node !== addPanel) node.remove();
    });
    if (addPanel) pop.prepend(addPanel);

    loadVisiblePresetKeys().forEach((key) => {
      pop.appendChild(createPresetColorSwatch(key, presetSelected));
    });

    loadCustomPaletteColors().forEach((hex) => {
      const sw = createCustomPaletteSwatch(hex);
      if (selectedColorKey === 'custom' && selectedCustomHex === hex) {
        sw.classList.add('is-selected');
      }
      pop.appendChild(sw);
    });

    const customs = loadCustomPaletteColors();
    if (customs.length < GP_CUSTOM_PALETTE_MAX) {
      const customHit = document.createElement('div');
      customHit.className = 'gp-ct-color-custom-hit';
      customHit.id = 'gp-ct-color-custom-hit';
      const plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'gp-ct-color-plus-btn';
      plusBtn.setAttribute('aria-label', 'Add custom color');
      plusBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
      customHit.appendChild(plusBtn);
      pop.appendChild(customHit);
    } else {
      const maxSlot = document.createElement('div');
      maxSlot.className = 'gp-ct-color-max-slot';
      maxSlot.setAttribute('aria-label', 'Max colors reached');
      const tip = document.createElement('span');
      tip.className = 'gp-ct-color-max-tooltip';
      tip.textContent = 'Max colors reached';
      maxSlot.appendChild(tip);
      pop.appendChild(maxSlot);
    }

    syncTagColorPopSelection(pop, selectedColorKey, selectedCustomHex);
  }

  function handleTagColorPopClick(event) {
    const pop = document.getElementById('gp-ct-color-pop');
    if (!pop || pop.hidden) return;

    const deleteBtn = event.target.closest('.gp-ct-swatch-delete');
    if (deleteBtn) {
      event.preventDefault();
      event.stopPropagation();
      const swatch = deleteBtn.closest('.gp-ct-color-swatch');
      const target = getPaletteSwatchDeleteTarget(swatch);
      if (!swatch || !target) return;

      const pending = gpCtPaletteDeletePending;
      if (pending?.kind === target.kind && pending?.id === target.id) {
        clearGpCtPaletteDeletePending();
        swatch.classList.add('is-removing');
        window.setTimeout(() => {
          const rerender = () => {
            renderTagColorPop(pop, {
              selectedColorKey: document.getElementById('gp-ct-new-tag-dot')?.dataset.colorKey,
              selectedCustomHex: document.getElementById('gp-ct-new-tag-dot')?.dataset.customHex,
            });
          };
          if (target.kind === 'custom') {
            void removeCustomPaletteColor(target.id).then(rerender);
          } else {
            void removePresetPaletteColor(target.id).then(rerender);
          }
        }, 150);
        return;
      }

      clearGpCtPaletteDeletePending();
      const tip = swatch.querySelector('.gp-ct-swatch-delete-tip');
      if (tip) tip.hidden = false;
      swatch.classList.add('is-delete-pending');
      const timeoutId = window.setTimeout(() => {
        clearGpCtPaletteDeletePending();
      }, GP_CT_PALETTE_DELETE_CONFIRM_MS);
      gpCtPaletteDeletePending = { kind: target.kind, id: target.id, swatchEl: swatch, timeoutId };
      return;
    }

    if (gpCtPaletteDeletePending) {
      clearGpCtPaletteDeletePending();
    }

    if (event.target.closest('[data-gp-ct-color-add="confirm"]')) {
      event.preventDefault();
      event.stopPropagation();
      void confirmGpCtColorAdd();
      return;
    }

    if (event.target.closest('[data-gp-ct-color-add="cancel"]')) {
      event.preventDefault();
      event.stopPropagation();
      closeGpCtColorAddPanel();
      return;
    }

    if (event.target.closest('.gp-ct-color-plus-btn')) {
      event.preventDefault();
      event.stopPropagation();
      openGpCtColorAddPanel();
      return;
    }

    const swatch = event.target.closest('.gp-ct-color-swatch:not(.is-removing)');
    if (!swatch || !pop.contains(swatch)) return;

    closeGpCtColorAddPanel();
    closeGpCtSpectrumPop();

    if (swatch.classList.contains('is-palette-custom')) {
      const hex = normalizeHexColor(swatch.dataset.paletteHex);
      if (hex) selectNewTagDotColor('custom', hex);
      return;
    }

    const key = swatch.dataset.colorKey;
    if (key) selectNewTagDotColor(key, null);
  }

  async function openInlineNewTagEditor() {
    const box = document.getElementById('gp-ct-new-tag');
    const input = document.getElementById('gp-ct-new-tag-input');
    const dot = document.getElementById('gp-ct-new-tag-dot');
    const pop = document.getElementById('gp-ct-color-pop');
    if (!box || !input || !dot || !pop) return;

    await ensurePaletteCaches();
    box.hidden = false;
    input.value = '';
    delete dot.dataset.customHex;
    const firstKey = loadVisiblePresetKeys()[0];
    dot.dataset.colorKey = firstKey;
    dot.style.background = TAG_HEX_BY_KEY[firstKey];
    pop.hidden = false;
    renderTagColorPop(pop, { selectedColorKey: firstKey, selectedCustomHex: null });
    queueMicrotask(() => input.focus());
  }

  function closeInlineNewTagEditor() {
    closeGpCtSpectrumPop();
    closeGpCtColorAddPanel();
    clearGpCtPaletteDeletePending();
    const box = document.getElementById('gp-ct-new-tag');
    const pop = document.getElementById('gp-ct-color-pop');
    if (box) box.hidden = true;
    if (pop) {
      pop.hidden = true;
      pop.innerHTML = '';
    }
  }

  function resetCreateTaskSubtasks() {
    const list = document.getElementById('gp-ct-subtasks-list');
    if (!list) return;
    list.innerHTML = '';
    appendSubtaskRow('', false, { removable: false });
  }

  function appendSubtaskRow(title = '', done = false, options = {}) {
    const host = document.getElementById('gp-ct-subtasks-list');
    if (!host) return;
    const removable = options.removable !== false;
    const row = document.createElement('div');
    row.className = 'gp-ct-subtask';
    row.innerHTML = `
      <input type="checkbox" class="gp-ct-subtask-check" ${done ? 'checked' : ''} aria-label="Done">
      <input type="text" class="gp-ct-subtask-input" placeholder="Subtask">
      ${removable ? '<button type="button" class="gp-ct-subtask-del" aria-label="Remove subtask">×</button>' : ''}
    `;
    const textInput = row.querySelector('.gp-ct-subtask-input');
    if (textInput) textInput.value = title;
    host.appendChild(row);
  }

  function readSubtasksFromForm() {
    const list = document.getElementById('gp-ct-subtasks-list');
    if (!list) return [];
    return [...list.querySelectorAll('.gp-ct-subtask')].map((row, i) => {
      const input = row.querySelector('.gp-ct-subtask-input');
      const check = row.querySelector('.gp-ct-subtask-check');
      const title = input?.value.trim() || '';
      if (!title) return null;
      return {
        id: `st-new-${i}-${Date.now()}`,
        title,
        done: Boolean(check?.checked),
      };
    }).filter(Boolean);
  }

  async function submitGlobalCreateTaskForm() {
    const form = document.getElementById('gp-ct-form');
    if (!form) return;

    const title = form.querySelector('[name="title"]')?.value.trim();
    const dueDate = document.getElementById('gp-ct-due-date')?.value
      || form.querySelector('[name="dueDate"]')?.value;
    const dueTimeStart = normalizeDueHm(form.querySelector('[name="dueTimeStart"]')?.value || '');
    const dueTimeEnd = normalizeDueHm(form.querySelector('[name="dueTimeEnd"]')?.value || '');
    const chip = document.getElementById('gp-ct-chip')?.value?.trim() || (getDefaultTags()[0]?.label || 'PSYC101');
    const columnId = document.getElementById('gp-ct-column')?.value || 'todo';
    const notes = form.querySelector('[name="notes"]')?.value.trim() || '';
    const allDay = Boolean(document.getElementById('gp-ct-allday')?.checked);
    const subtasks = readSubtasksFromForm();

    if (!title || !dueDate) return;

    const state = await loadKanbanState();
    const tag = findTagByLabel(state.tags, chip);
    const chipColor = tag ? chipClassForColorKey(tag.colorKey) : resolveKanbanChipColor(chip, null, null);
    const chipCustomHex = (tag?.colorKey === 'custom' && normalizeHexColor(tag?.customHex))
      ? normalizeHexColor(tag.customHex)
      : undefined;

    const card = {
      id: `task-${Date.now()}`,
      title,
      dueDate,
      due: allDay
        ? formatKanbanDueLabel(dueDate)
        : formatKanbanDueWithTimes(dueDate, dueTimeStart, dueTimeEnd),
      chip,
      chipColor,
      starred: false,
      notes,
      subtasks,
    };
    if (allDay) {
      card.allDay = true;
    } else {
      if (dueTimeStart) card.dueTimeStart = dueTimeStart;
      if (dueTimeEnd) card.dueTimeEnd = dueTimeEnd;
    }
    if (chipCustomHex) card.chipCustomHex = chipCustomHex;

    state.columns[columnId] = [...(state.columns[columnId] || []), card];
    await saveKanbanState(state);
    closeGlobalCreateTaskModal();
  }

  function escapeHtmlAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderManageTagRows() {
    const host = document.getElementById('gp-mt-rows');
    if (!host || !gpManageTagsDraft) return;
    host.innerHTML = '';
    gpManageTagsDraft.forEach((tag, index) => {
      const row = document.createElement('div');
      row.className = 'gp-mt-row';
      row.dataset.index = String(index);
      row.innerHTML = `
        <button type="button" class="gp-mt-color-hit" aria-label="Choose color" data-index="${index}">
          <span class="gp-mt-dot" style="background:${escapeHtmlAttr(tagResolvedHex(tag))}"></span>
        </button>
        <input class="gp-mt-input" type="text" value="${escapeHtmlAttr(tag.label)}" aria-label="Tag name">
        <button type="button" class="gp-mt-icon-btn" data-action="hide" aria-label="Toggle visibility" title="Show in picker">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button type="button" class="gp-mt-icon-btn" data-action="del" aria-label="Delete tag">×</button>
      `;
      const hit = row.querySelector('.gp-mt-color-hit');
      const dot = hit?.querySelector('.gp-mt-dot');
      if (dot) dot.style.background = tagResolvedHex(tag);
      const hideBtn = row.querySelector('[data-action="hide"]');
      if (hideBtn) {
        hideBtn.classList.toggle('is-muted', tag.hidden);
        hideBtn.setAttribute('aria-pressed', tag.hidden ? 'true' : 'false');
      }
      host.appendChild(row);
    });
  }

  function openManageTagsModal(fromUserManageButton = false) {
    if (!fromUserManageButton) return;
    const tagSection = document.getElementById('gp-ct-tag-section');
    if (!tagSection || tagSection.dataset.tagsEngaged !== 'true') {
      return;
    }

    ensureGlobalTaskModals();
    void loadKanbanState().then((state) => {
      gpManageTagsDraft = normalizeTags(state.tags).map((t) => ({ ...t }));
      const layer = document.getElementById('gp-mt-layer');
      const root = getGlobalTaskModalsRoot();
      const ctLayer = document.getElementById('gp-ct-layer');
      if (!layer || !root) return;

      gpResumeCreateTaskLayerAfterTags = Boolean(ctLayer && !ctLayer.hidden);
      if (gpResumeCreateTaskLayerAfterTags) {
        ctLayer.hidden = true;
      }

      renderManageTagRows();
      root.hidden = false;
      layer.hidden = false;
      document.body.classList.add('gp-task-modals-open');
    });
  }

  function closeManageTagsModal() {
    const layer = document.getElementById('gp-mt-layer');
    if (layer) layer.hidden = true;
    gpManageTagsDraft = null;

    if (gpResumeCreateTaskLayerAfterTags) {
      const ctLayer = document.getElementById('gp-ct-layer');
      if (ctLayer) ctLayer.hidden = false;
      gpResumeCreateTaskLayerAfterTags = false;
      return;
    }

    const root = getGlobalTaskModalsRoot();
    const ct = document.getElementById('gp-ct-layer');
    if (root && ct?.hidden !== false) {
      root.hidden = true;
    }
    if (!ct || ct.hidden) {
      document.body.classList.remove('gp-task-modals-open');
    }
  }

  async function saveManageTagsModal() {
    if (!gpManageTagsDraft) return;
    let next = gpManageTagsDraft.filter((t) => t.label.trim());
    if (next.length === 0) {
      next = getDefaultTags();
    }
    const state = await loadKanbanState();
    state.tags = normalizeTags(next);
    await saveKanbanState(state);
    closeManageTagsModal();
    const st = kanbanStateCache || await loadKanbanState();
    renderCreateTaskTagChips(st);
  }

  function wireGlobalTaskModalsOnce() {
    if (gpGlobalTaskModalsWired) return;
    gpGlobalTaskModalsWired = true;
    wireMkDueEditorOnce();

    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-gp-ct-dismiss="true"]')) {
        closeGlobalCreateTaskModal();
      }
      if (event.target.closest('[data-gp-mt-dismiss="true"]')) {
        closeManageTagsModal();
      }
    });

    const form = document.getElementById('gp-ct-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      void submitGlobalCreateTaskForm();
    });

    document.getElementById('gp-ct-chip-row')?.addEventListener('click', (e) => {
      if (e.target.closest('#gp-ct-chip-new')) {
        e.preventDefault();
        void openInlineNewTagEditor();
        return;
      }
      const chip = e.target.closest('.gp-ct-chip');
      if (!chip) return;
      document.querySelectorAll('#gp-ct-chip-row .gp-ct-chip').forEach((c) => {
        c.classList.remove('is-selected');
        c.setAttribute('aria-selected', 'false');
      });
      chip.classList.add('is-selected');
      chip.setAttribute('aria-selected', 'true');
      const id = chip.dataset.tagId;
      void loadKanbanState().then((state) => {
        const tag = state.tags.find((t) => t.id === id);
        const input = document.getElementById('gp-ct-chip');
        if (input && tag) input.value = tag.label;
      });
    });

    document.getElementById('gp-ct-date-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeCreateTaskTimePop();
      const pop = document.getElementById('gp-ct-cal-pop');
      if (pop && !pop.hidden) closeCreateTaskCalendar();
      else openCreateTaskCalendar();
    });

    document.getElementById('gp-ct-cal-prev')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = gpCtCalViewMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      gpCtCalViewMonth = new Date(v.getFullYear(), v.getMonth() - 1, 1);
      renderCreateTaskCalendar();
    });

    document.getElementById('gp-ct-cal-next')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = gpCtCalViewMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      gpCtCalViewMonth = new Date(v.getFullYear(), v.getMonth() + 1, 1);
      renderCreateTaskCalendar();
    });

    document.getElementById('gp-ct-cal-grid')?.addEventListener('click', (e) => {
      const cell = e.target.closest('.gp-ct-cal-cell');
      if (!cell?.dataset?.iso) return;
      e.preventDefault();
      e.stopPropagation();
      setCreateTaskDueIso(cell.dataset.iso);
      const picked = parseDueDateIsoLocal(cell.dataset.iso);
      if (picked) {
        gpCtCalViewMonth = new Date(picked.getFullYear(), picked.getMonth(), 1);
      }
      closeCreateTaskCalendar();
    });

    ensureCreateTaskTimeList();

    document.getElementById('gp-ct-time-start-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleCreateTaskTimePop('start');
    });

    document.getElementById('gp-ct-time-end-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleCreateTaskTimePop('end');
    });

    document.getElementById('gp-ct-time-list')?.addEventListener('click', (e) => {
      const opt = e.target.closest('.gp-ct-time-opt');
      if (!opt?.dataset?.hm || !gpCtTimePopField) return;
      e.preventDefault();
      e.stopPropagation();
      setCreateTaskTimeField(gpCtTimePopField, opt.dataset.hm);
      closeCreateTaskTimePop();
    });

    document.getElementById('gp-ct-allday')?.addEventListener('change', () => {
      syncCreateTaskAllDayUi();
    });

    document.addEventListener(
      'pointerdown',
      (e) => {
        const calPop = document.getElementById('gp-ct-cal-pop');
        if (calPop && !calPop.hidden && !e.target.closest('.gp-ct-date-anchor')) {
          closeCreateTaskCalendar();
        }
        if (e.target.closest(
          '.gp-inline-schedule-date-link, .gp-inline-schedule-time-link, .gp-inline-schedule-dropdown, #gp-mk-due-portal',
        )) {
          return;
        }
        const mkTarget = gpMkDueEditorTarget;
        const mkHost = mkTarget?.host;
        const mkSchedule = mkTarget?.scheduleEl;
        if (mkHost && mkSchedule) {
          const inHost = mkHost.contains(e.target);
          const inDueLine = e.target.closest('.mk-card-due-btn, .gp-task-due-btn');
          const inDateZone = e.target.closest('.gp-inline-schedule-date-wrap');
          const inTimeZone = e.target.closest('.gp-inline-schedule-time-wrap');
          const inDropdown = e.target.closest('.gp-inline-schedule-dropdown, #gp-mk-due-portal');
          if (!inHost) {
            closeMkDueEditor();
          } else if (inDueLine && (inDateZone || inTimeZone || inDropdown)) {
            /* keep editor open while interacting with due line dropdowns */
          } else if (inDueLine) {
            closeInlineScheduleDropdowns(mkSchedule);
          } else {
            closeMkDueEditor();
          }
        }
        const timePop = document.getElementById('gp-ct-time-pop');
        if (timePop && !timePop.hidden
          && !e.target.closest('.gp-ct-time-pop')
          && !e.target.closest('.gp-ct-time-btn')) {
          closeCreateTaskTimePop();
        }
      },
      true,
    );

    window.addEventListener('resize', () => {
      const cal = document.getElementById('gp-ct-cal-pop');
      if (cal && !cal.hidden) positionCreateTaskCalendar();
      const timePop = document.getElementById('gp-ct-time-pop');
      if (timePop && !timePop.hidden) positionCreateTaskTimePop();
      if (gpMkDueEditorTarget?.dateDropdownOpen
        || gpMkDueEditorTarget?.timeDropdownOpen
        || gpMkDueEditorTarget?.timePopField) {
        syncMkDueDropdownPortal();
      }
    });

    document.querySelector('.gp-ct-segmented')?.addEventListener('click', (e) => {
      const seg = e.target.closest('.gp-ct-seg');
      if (!seg) return;
      const col = seg.dataset.gpCtStatus;
      if (!col) return;
      syncCreateTaskStatusSegments(col);
    });

    document.getElementById('gp-ct-manage-tags')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openManageTagsModal(true);
    });

    const tagSection = document.getElementById('gp-ct-tag-section');
    const markTagSectionEngaged = () => {
      if (!tagSection || tagSection.dataset.tagsEngaged === 'true') return;
      tagSection.dataset.tagsEngaged = 'true';
      const showManageBtn = () => {
        const btn = document.getElementById('gp-ct-manage-tags');
        if (btn) btn.hidden = false;
      };
      /* Defer until after pointerup so the same click cannot land on the newly
         revealed "Manage tags" control (ghost-open of Your tags modal). */
      const onPointerUp = () => {
        document.removeEventListener('pointerup', onPointerUp, true);
        window.clearTimeout(fallbackTimer);
        window.setTimeout(showManageBtn, 0);
      };
      const fallbackTimer = window.setTimeout(() => {
        document.removeEventListener('pointerup', onPointerUp, true);
        showManageBtn();
      }, 3000);
      document.addEventListener('pointerup', onPointerUp, true);
    };

    tagSection?.addEventListener('pointerdown', (event) => {
      if (tagSection.dataset.tagsEngaged === 'true') return;
      if (event.target.closest('#gp-ct-manage-tags')) return;
      if (event.target.closest('#gp-ct-chip-scroll') || event.target.closest('#gp-ct-new-tag')) {
        markTagSectionEngaged();
      }
    });

    tagSection?.addEventListener('focusin', (event) => {
      if (tagSection.dataset.tagsEngaged === 'true') return;
      const t = event.target;
      if (!(t instanceof Element)) return;
      if (t.closest('#gp-ct-chip-row') || t.id === 'gp-ct-new-tag-input') {
        tagSection.dataset.tagsEngaged = 'true';
        window.setTimeout(() => {
          const btn = document.getElementById('gp-ct-manage-tags');
          if (btn) btn.hidden = false;
        }, 0);
      }
    });

    document.getElementById('gp-ct-add-subtask')?.addEventListener('click', () => {
      appendSubtaskRow();
      document.getElementById('gp-ct-subtasks-list')
        ?.querySelector('.gp-ct-subtask:last-of-type .gp-ct-subtask-input')
        ?.focus();
    });

    document.querySelector('.gp-ct-subtasks-wrap')?.addEventListener('click', (e) => {
      if (e.target.closest('.gp-ct-subtask-del')) {
        e.target.closest('.gp-ct-subtask')?.remove();
      }
    });

    document.querySelector('.gp-ct-subtasks-wrap')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const input = e.target.closest('.gp-ct-subtask-input');
      if (!input) return;
      e.preventDefault();
      appendSubtaskRow();
      document.getElementById('gp-ct-subtasks-list')
        ?.querySelector('.gp-ct-subtask:last-of-type .gp-ct-subtask-input')
        ?.focus();
    });

    document.getElementById('gp-ct-new-tag-add')?.addEventListener('click', () => {
      void (async () => {
        const input = document.getElementById('gp-ct-new-tag-input');
        const dot = document.getElementById('gp-ct-new-tag-dot');
        const label = input?.value.trim();
        if (!label) return;
        const colorKey = dot?.dataset.colorKey || 'blue';
        const customHex = colorKey === 'custom' ? normalizeHexColor(dot?.dataset.customHex) : '';
        const state = await loadKanbanState();
        const id = `tag-${Date.now()}`;
        const tagPayload = { id, label, hidden: false };
        if (colorKey === 'custom' && customHex) {
          tagPayload.colorKey = 'custom';
          tagPayload.customHex = customHex;
        } else {
          tagPayload.colorKey = TAG_PALETTE_KEYS.includes(colorKey) ? colorKey : 'blue';
        }
        state.tags = normalizeTags([...(state.tags || []), tagPayload]);
        await saveKanbanState(state);
        const chipInput = document.getElementById('gp-ct-chip');
        if (chipInput) chipInput.value = label;
        closeInlineNewTagEditor();
        renderCreateTaskTagChips(await loadKanbanState());
      })();
    });

    document.getElementById('gp-ct-new-tag-cancel')?.addEventListener('click', () => {
      closeInlineNewTagEditor();
    });

    document.getElementById('gp-ct-color-pop')?.addEventListener('click', handleTagColorPopClick);

    document.getElementById('gp-mt-cancel')?.addEventListener('click', () => {
      closeManageTagsModal();
    });

    document.getElementById('gp-mt-save')?.addEventListener('click', () => {
      void saveManageTagsModal();
    });

    document.getElementById('gp-mt-add-row')?.addEventListener('click', () => {
      if (!gpManageTagsDraft) return;
      gpManageTagsDraft.push({
        id: `tag-${Date.now()}`,
        label: '',
        colorKey: 'blue',
        hidden: false,
      });
      renderManageTagRows();
    });

    document.getElementById('gp-mt-rows')?.addEventListener('input', (e) => {
      const input = e.target.closest('.gp-mt-input');
      const row = input?.closest('.gp-mt-row');
      if (!row || !gpManageTagsDraft) return;
      const idx = Number(row.dataset.index);
      if (!Number.isNaN(idx)) gpManageTagsDraft[idx].label = input.value;
    });

    document.getElementById('gp-mt-rows')?.addEventListener('click', (e) => {
      const del = e.target.closest('[data-action="del"]');
      const row = e.target.closest('.gp-mt-row');
      const hideBtn = e.target.closest('[data-action="hide"]');
      const colorHit = e.target.closest('.gp-mt-color-hit');
      if (del && row && gpManageTagsDraft) {
        const idx = Number(row.dataset.index);
        gpManageTagsDraft.splice(idx, 1);
        renderManageTagRows();
        return;
      }
      if (hideBtn && row && gpManageTagsDraft) {
        const idx = Number(row.dataset.index);
        gpManageTagsDraft[idx].hidden = !gpManageTagsDraft[idx].hidden;
        renderManageTagRows();
        return;
      }
      if (colorHit && row && gpManageTagsDraft) {
        const idx = Number(row.dataset.index);
        const cur = gpManageTagsDraft[idx].colorKey;
        const order = TAG_PALETTE_KEYS;
        if (cur === 'custom') {
          gpManageTagsDraft[idx].colorKey = order[0];
          delete gpManageTagsDraft[idx].customHex;
        } else {
          const ni = (order.indexOf(cur) + 1) % order.length;
          gpManageTagsDraft[idx].colorKey = order[ni];
          delete gpManageTagsDraft[idx].customHex;
        }
        renderManageTagRows();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const colorAddPanel = document.querySelector('#gp-ct-color-pop .gp-ct-color-add-panel');
      if (colorAddPanel && !colorAddPanel.hidden) {
        closeGpCtColorAddPanel();
        e.preventDefault();
        return;
      }
      const spec = document.getElementById('gp-ct-spectrum-pop');
      if (spec && !spec.hidden) {
        closeGpCtSpectrumPop();
        e.preventDefault();
        return;
      }
      const newTag = document.getElementById('gp-ct-new-tag');
      if (newTag && !newTag.hidden) {
        closeInlineNewTagEditor();
        e.preventDefault();
        return;
      }
      const calPop = document.getElementById('gp-ct-cal-pop');
      if (calPop && !calPop.hidden) {
        closeCreateTaskCalendar();
        e.preventDefault();
        return;
      }
      if (gpMkDueEditorTarget?.scheduleEl) {
        const {
          dateDropdownOpen,
          timeDropdownOpen,
          timePopField,
          scheduleEl,
        } = gpMkDueEditorTarget;
        if (dateDropdownOpen) {
          closeMkDueDateDropdown(true);
          e.preventDefault();
          return;
        }
        if (timeDropdownOpen || timePopField) {
          closeInlineScheduleDropdowns(scheduleEl);
          e.preventDefault();
          return;
        }
        closeMkDueEditor();
        e.preventDefault();
        return;
      }
      if (document.getElementById('gp-mt-layer') && !document.getElementById('gp-mt-layer').hidden) {
        closeManageTagsModal();
        e.preventDefault();
        return;
      }
      if (document.getElementById('gp-ct-layer') && !document.getElementById('gp-ct-layer').hidden) {
        closeGlobalCreateTaskModal();
        e.preventDefault();
      }
    });
  }

  function formatKanbanDueLabel(value) {
    if (!value) return 'Due date not set';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return 'Due date not set';
    return `Due ${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  }

  function getDefaultCreateColumnId(state) {
    if (state.filters.activeList !== 'all') return state.filters.activeList;
    return 'todo';
  }

  function openCreateTaskModal(_root, preferredColumnId) {
    openGlobalCreateTaskModal({ preferredColumnId });
  }

  function closeCreateTaskModal() {
    closeGlobalCreateTaskModal();
  }

  async function toggleKanbanCardStar(root, cardId) {
    const state = await loadKanbanState();
    let changed = false;

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      state.columns[id] = (state.columns[id] || []).map((card) => {
        if (card.id !== cardId) return card;
        changed = true;
        return { ...card, starred: !card.starred };
      });
    });

    if (!changed) return;
    await saveKanbanState(state);
  }

  const MK_DELETE_TRASH_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

  const MK_SUBTASK_CHECKLIST_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path><path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"></path><path d="M9 12h6"></path><path d="M9 16h6"></path><path d="m14 11 2 2 4-4"></path></svg>`;
  const GP_TASK_DETAIL_SUBTASK_CHECK_SVG = `<svg class="gp-task-detail-subtask-check-svg" viewBox="0 0 12 10" fill="none" aria-hidden="true"><path class="gp-task-detail-subtask-check-path" d="M1 5.2 4.4 8.6 11 1.4"></path></svg>`;

  function parseSubtasksJson(raw) {
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function getSubtaskStats(subtasks) {
    const list = Array.isArray(subtasks) ? subtasks : [];
    const total = list.length;
    const completed = list.filter((item) => Boolean(item?.done)).length;
    return {
      total,
      completed,
      allDone: total > 0 && completed === total,
    };
  }

  function getTaskCategoryColorHex(task) {
    if (!task) return TAG_HEX_BY_KEY.grey;
    if (task.chipCustomHex) {
      return normalizeHexColor(task.chipCustomHex) || TAG_HEX_BY_KEY.grey;
    }
    const colorKey = task.chipColor || resolveKanbanChipColor(task.chip, task.chipColor, task.courseKey);
    return TAG_HEX_BY_KEY[colorKey] || TAG_HEX_BY_KEY.blue;
  }

  function findTaskInState(state, taskId) {
    if (!state || !taskId) return null;
    for (const { id } of KANBAN_COLUMN_DEFS) {
      const task = (state.columns[id] || []).find((card) => card.id === taskId);
      if (task) return { task, columnId: id };
    }
    return null;
  }

  function formatTaskDetailDateLine(task) {
    const d = parseDueDateIsoLocal(task?.dueDate);
    if (!d) return 'No due date';
    const dateStr = d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    if (task?.allDay) return dateStr;
    const start = formatTimeCompact12(normalizeDueHm(task?.dueTimeStart));
    const end = formatTimeCompact12(normalizeDueHm(task?.dueTimeEnd));
    if (start && end) return `${dateStr} · ${start}–${end}`;
    if (start) return `${dateStr} · ${start}`;
    return dateStr;
  }

  function formatReminderLabel(minutes) {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value === 1) return '1 minute before';
    if (value < 60) return `${value} minutes before`;
    if (value === 60) return '1 hour before';
    if (value % 60 === 0) return `${value / 60} hours before`;
    const hours = Math.floor(value / 60);
    const mins = value % 60;
    return `${hours} hour${hours === 1 ? '' : 's'} ${mins} minutes before`;
  }

  function syncMkCardSubtaskDataset(cardEl, subtasks) {
    if (!cardEl) return;
    const list = Array.isArray(subtasks) ? subtasks : [];
    if (list.length) {
      cardEl.dataset.subtasks = JSON.stringify(list);
    } else {
      delete cardEl.dataset.subtasks;
    }
  }

  function attachMkCardSubtaskIndicator(cardEl, subtasks) {
    if (!cardEl) return;

    const list = Array.isArray(subtasks) ? subtasks : [];
    const existing = cardEl.querySelector('.mk-subtask-indicator');
    if (!list.length) {
      existing?.remove();
      return;
    }

    const stats = getSubtaskStats(list);
    const categoryColor = cardEl.dataset.chipColor === 'custom' && cardEl.dataset.chipCustomHex
      ? normalizeHexColor(cardEl.dataset.chipCustomHex) || TAG_HEX_BY_KEY.grey
      : TAG_HEX_BY_KEY[cardEl.dataset.chipColor] || TAG_HEX_BY_KEY.blue;

    let btn = existing;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mk-subtask-indicator';
      btn.setAttribute('aria-label', 'View subtasks');
      btn.draggable = false;
      btn.innerHTML = `
        <span class="mk-subtask-indicator-icon" aria-hidden="true">${MK_SUBTASK_CHECKLIST_ICON_SVG}</span>
        <span class="mk-subtask-indicator-badge"></span>
      `;
      cardEl.appendChild(btn);
    }

    btn.style.setProperty('--mk-category-color', categoryColor);
    btn.classList.toggle('mk-subtask-indicator--complete', stats.allDone);
    btn.querySelector('.mk-subtask-indicator-badge').textContent = `${stats.completed}/${stats.total}`;
    btn.setAttribute('aria-label', `View subtasks, ${stats.completed} of ${stats.total} complete`);
  }

  async function persistTaskPatch(taskId, patch) {
    if (!taskId || !patch) return null;
    const state = await loadKanbanState();
    let updated = null;

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      state.columns[id] = (state.columns[id] || []).map((card) => {
        if (card.id !== taskId) return card;
        updated = { ...card, ...patch };
        return updated;
      });
    });

    if (!updated) return null;
    kanbanStateCache = normalizeKanbanState(state);
    await writeSidebarStorage({ [KANBAN_STORAGE_KEY]: kanbanStateCache });
    return updated;
  }

  let gpTaskDetailRoot = null;
  let gpTaskDetailWired = false;
  /** @type {null | { taskId: string, anchor: HTMLElement }} */
  let gpTaskDetailOpenCtx = null;
  let gpTaskDetailOutsideHandler = null;
  let gpTaskDetailEscapeHandler = null;
  let gpTaskDetailPositionCleanup = null;

  function ensureTaskDetailRoot() {
    if (gpTaskDetailRoot) return gpTaskDetailRoot;

    const root = document.createElement('div');
    root.id = 'gp-task-detail-root';
    root.className = 'gp-task-detail-root';
    root.hidden = true;
    root.innerHTML = `
      <div class="gp-task-detail-scrim" data-gp-task-detail-dismiss="true" aria-hidden="true"></div>
      <div class="gp-task-detail-card" role="dialog" aria-modal="true" aria-labelledby="gp-task-detail-title"></div>
    `.trim();
    document.body.appendChild(root);
    gpTaskDetailRoot = root;
    wireTaskDetailPopupOnce();
    return root;
  }

  function wireTaskDetailPopupOnce() {
    if (gpTaskDetailWired || !gpTaskDetailRoot) return;
    gpTaskDetailWired = true;

    gpTaskDetailRoot.addEventListener('click', (event) => {
      const dismiss = event.target.closest('[data-gp-task-detail-dismiss]');
      if (dismiss) {
        event.preventDefault();
        closeTaskDetailPopup();
        return;
      }

      const closeBtn = event.target.closest('[data-gp-task-detail-close]');
      if (closeBtn) {
        event.preventDefault();
        closeTaskDetailPopup();
        return;
      }

      const editBtn = event.target.closest('[data-gp-task-detail-edit]');
      if (editBtn && gpTaskDetailOpenCtx) {
        event.preventDefault();
        const card = document.querySelector(`.mk-card[data-card-id="${gpTaskDetailOpenCtx.taskId}"]`);
        closeTaskDetailPopup();
        const titleInput = card?.querySelector('.mk-card-title');
        if (titleInput) {
          titleInput.focus({ preventScroll: true });
          titleInput.select();
        }
        return;
      }

      const deleteBtn = event.target.closest('[data-gp-task-detail-delete]');
      if (deleteBtn && gpTaskDetailOpenCtx) {
        event.preventDefault();
        const card = document.querySelector(`.mk-card[data-card-id="${gpTaskDetailOpenCtx.taskId}"]`);
        closeTaskDetailPopup();
        if (card) openMkDeleteConfirm(card);
        return;
      }
    });

    gpTaskDetailRoot.addEventListener('change', (event) => {
      const subtaskCheck = event.target.closest('.gp-task-detail-subtask-check');
      if (!subtaskCheck || !gpTaskDetailOpenCtx) return;
      void toggleTaskDetailSubtask(gpTaskDetailOpenCtx.taskId, subtaskCheck.dataset.subtaskId, subtaskCheck.checked);
    });
  }

  function clearTaskDetailPopupListeners() {
    if (gpTaskDetailOutsideHandler) {
      document.removeEventListener('pointerdown', gpTaskDetailOutsideHandler, true);
      gpTaskDetailOutsideHandler = null;
    }
    if (gpTaskDetailEscapeHandler) {
      document.removeEventListener('keydown', gpTaskDetailEscapeHandler);
      gpTaskDetailEscapeHandler = null;
    }
    if (gpTaskDetailPositionCleanup) {
      gpTaskDetailPositionCleanup();
      gpTaskDetailPositionCleanup = null;
    }
  }

  function closeTaskDetailPopup() {
    if (!gpTaskDetailRoot) return;
    gpTaskDetailRoot.hidden = true;
    gpTaskDetailOpenCtx = null;
    clearTaskDetailPopupListeners();
    const card = gpTaskDetailRoot.querySelector('.gp-task-detail-card');
    if (card) card.innerHTML = '';
  }

  function positionTaskDetailCard(cardEl, anchorEl) {
    if (!cardEl || !anchorEl) return;

    const hostRect = anchorEl.getBoundingClientRect();
    const cardWidth = 340;
    const gap = 8;
    const margin = 8;

    cardEl.style.position = 'fixed';
    cardEl.style.width = `${cardWidth}px`;
    cardEl.style.zIndex = '2147483647';

    let left = hostRect.right + gap;
    let top = hostRect.top;

    if (left + cardWidth > window.innerWidth - margin) {
      left = hostRect.left - cardWidth - gap;
    }
    if (left < margin) {
      left = Math.max(margin, Math.min(hostRect.left, window.innerWidth - cardWidth - margin));
      top = hostRect.bottom + gap;
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - cardWidth - margin));

    const measuredHeight = cardEl.getBoundingClientRect().height || cardEl.offsetHeight || 0;
    const cardHeight = Math.max(measuredHeight, 120);
    if (top + cardHeight > window.innerHeight - margin) {
      const aboveTop = hostRect.bottom - cardHeight;
      if (aboveTop >= margin) {
        top = aboveTop;
      } else {
        top = Math.max(margin, window.innerHeight - cardHeight - margin);
      }
    }

    cardEl.style.left = `${left}px`;
    cardEl.style.top = `${top}px`;
  }

  function renderTaskDetailSubtasksSection(task, categoryColor) {
    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const stats = getSubtaskStats(subtasks);
    const progressPct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;

    const rows = subtasks.map((subtask) => {
      const id = escapeHtmlAttr(subtask.id || '');
      const title = escapeHtmlAttr(subtask.title || 'Subtask');
      const checked = subtask.done ? 'checked' : '';
      const doneClass = subtask.done ? ' is-done' : '';
      return `
        <label class="gp-task-detail-subtask${doneClass}">
          <input type="checkbox" class="gp-task-detail-subtask-check" data-subtask-id="${id}" ${checked} aria-label="${title}">
          <span class="gp-task-detail-subtask-box" aria-hidden="true">${GP_TASK_DETAIL_SUBTASK_CHECK_SVG}</span>
          <span class="gp-task-detail-subtask-label">${title}</span>
        </label>
      `;
    }).join('');

    return `
      <div class="gp-task-detail-subtasks">
        <div class="gp-task-detail-subtasks-list">${rows}</div>
        <div class="gp-task-detail-subtasks-progress" aria-hidden="true">
          <div class="gp-task-detail-subtasks-progress-fill" style="width:${progressPct}%; background:${categoryColor};"></div>
        </div>
      </div>
    `;
  }

  function renderTaskDetailCardContent(task) {
    const categoryColor = getTaskCategoryColorHex(task);
    const title = escapeHtmlAttr(task.title || 'Untitled task');
    const dateLine = escapeHtmlAttr(formatTaskDetailDateLine(task));
    const recurrenceLine = task.recurrence
      ? `<p class="gp-task-detail-recurrence">${escapeHtmlAttr(task.recurrence)}</p>`
      : '';
    const reminderLabel = formatReminderLabel(task.reminderMinutes);
    const reminderLine = reminderLabel
      ? `<div class="gp-task-detail-footer-row">
          <span class="gp-task-detail-footer-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
          </span>
          <span>${escapeHtmlAttr(reminderLabel)}</span>
        </div>`
      : '';
    const calendarName = task.calendarName || 'My Tasks';
    const subtasksSection = task.subtasks?.length
      ? `<div class="gp-task-detail-divider"></div>${renderTaskDetailSubtasksSection(task, categoryColor)}`
      : '';

    return `
      <header class="gp-task-detail-header">
        <div class="gp-task-detail-header-actions">
          <button type="button" class="gp-task-detail-icon-btn" data-gp-task-detail-edit aria-label="Edit">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
          </button>
          <button type="button" class="gp-task-detail-icon-btn" data-gp-task-detail-delete aria-label="Delete">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
          <button type="button" class="gp-task-detail-icon-btn" aria-label="Email">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>
          </button>
          <button type="button" class="gp-task-detail-icon-btn" aria-label="More options">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
          </button>
          <button type="button" class="gp-task-detail-icon-btn" data-gp-task-detail-close aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </header>
      <div class="gp-task-detail-body" style="--gp-task-detail-category:${categoryColor};">
        <div class="gp-task-detail-title-row">
          <span class="gp-task-detail-category-dot" style="background:${categoryColor};"></span>
          <h2 id="gp-task-detail-title" class="gp-task-detail-title">${title}</h2>
        </div>
        <p class="gp-task-detail-date">${dateLine}</p>
        ${recurrenceLine}
        ${subtasksSection}
      </div>
      <footer class="gp-task-detail-footer">
        ${reminderLine}
        <div class="gp-task-detail-footer-row">
          <span class="gp-task-detail-footer-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </span>
          <span>${escapeHtmlAttr(calendarName)}</span>
        </div>
      </footer>
    `;
  }

  function refreshTaskDetailSubtaskUi(cardShell, task) {
    const subtasksHost = cardShell.querySelector('.gp-task-detail-subtasks');
    if (!subtasksHost || !task.subtasks?.length) return;

    const categoryColor = getTaskCategoryColorHex(task);
    const stats = getSubtaskStats(task.subtasks);
    const progressPct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
    const fill = subtasksHost.querySelector('.gp-task-detail-subtasks-progress-fill');
    if (fill) {
      fill.style.width = `${progressPct}%`;
      fill.style.background = categoryColor;
    }

    task.subtasks.forEach((subtask) => {
      const check = subtasksHost.querySelector(`.gp-task-detail-subtask-check[data-subtask-id="${subtask.id}"]`);
      const row = check?.closest('.gp-task-detail-subtask');
      if (!row) return;
      row.classList.toggle('is-done', Boolean(subtask.done));
      if (check) check.checked = Boolean(subtask.done);
    });
  }

  async function toggleTaskDetailSubtask(taskId, subtaskId, done) {
    if (!taskId || !subtaskId) return;

    const state = kanbanStateCache || await loadKanbanState();
    const found = findTaskInState(state, taskId);
    if (!found) return;

    const nextSubtasks = (found.task.subtasks || []).map((subtask) => (
      subtask.id === subtaskId ? { ...subtask, done: Boolean(done) } : subtask
    ));

    const updated = await persistTaskPatch(taskId, { subtasks: nextSubtasks });
    if (!updated) return;

    const cardEl = document.querySelector(`.mk-card[data-card-id="${taskId}"]`);
    if (cardEl) {
      syncMkCardSubtaskDataset(cardEl, nextSubtasks);
      attachMkCardSubtaskIndicator(cardEl, nextSubtasks);
    }

    const detailCard = gpTaskDetailRoot?.querySelector('.gp-task-detail-card');
    if (detailCard && gpTaskDetailOpenCtx?.taskId === taskId) {
      refreshTaskDetailSubtaskUi(detailCard, updated);
    }
  }

  function openTaskDetailPopup(anchorEl, taskId) {
    if (!anchorEl || !taskId) return;

    const state = kanbanStateCache || getDefaultKanbanState();
    const found = findTaskInState(state, taskId);
    if (!found?.task?.subtasks?.length) return;

    closeMkDueEditor();
    closeTaskDetailPopup();

    const root = ensureTaskDetailRoot();
    const cardShell = root.querySelector('.gp-task-detail-card');
    if (!cardShell) return;

    cardShell.innerHTML = renderTaskDetailCardContent(found.task);
    root.hidden = false;
    gpTaskDetailOpenCtx = { taskId, anchor: anchorEl };

    requestAnimationFrame(() => {
      positionTaskDetailCard(cardShell, anchorEl);
      requestAnimationFrame(() => {
        positionTaskDetailCard(cardShell, anchorEl);
      });
    });

    gpTaskDetailOutsideHandler = (event) => {
      if (cardShell.contains(event.target)) return;
      closeTaskDetailPopup();
    };
    document.addEventListener('pointerdown', gpTaskDetailOutsideHandler, true);

    gpTaskDetailEscapeHandler = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeTaskDetailPopup();
    };
    document.addEventListener('keydown', gpTaskDetailEscapeHandler);

    const reposition = () => {
      if (!gpTaskDetailOpenCtx || gpTaskDetailRoot?.hidden) return;
      const shell = gpTaskDetailRoot.querySelector('.gp-task-detail-card');
      if (shell && gpTaskDetailOpenCtx.anchor) {
        positionTaskDetailCard(shell, gpTaskDetailOpenCtx.anchor);
      }
    };
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    gpTaskDetailPositionCleanup = () => {
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, true);
    };
  }

  function clearMkDeleteConfirm() {
    if (mkDeleteConfirmTimeoutId) {
      clearTimeout(mkDeleteConfirmTimeoutId);
      mkDeleteConfirmTimeoutId = null;
    }

    if (mkDeleteConfirmOutsideHandler) {
      document.removeEventListener('pointerdown', mkDeleteConfirmOutsideHandler, true);
      mkDeleteConfirmOutsideHandler = null;
    }

    if (mkDeleteConfirmEscapeHandler) {
      document.removeEventListener('keydown', mkDeleteConfirmEscapeHandler);
      mkDeleteConfirmEscapeHandler = null;
    }

    if (mkDeleteConfirmCard) {
      const confirmBar = mkDeleteConfirmCard.querySelector('.mk-card-delete-confirm');
      mkDeleteConfirmCard.classList.remove('is-delete-confirm');
      mkDeleteConfirmCard.style.removeProperty('--mk-delete-confirm-top');
      if (confirmBar) {
        confirmBar.setAttribute('aria-hidden', 'true');
      }
      mkDeleteConfirmCard = null;
    }
  }

  function syncMkDeleteConfirmOverlay(card) {
    if (!card) return;

    const dueEl = card.querySelector('.mk-card-due');
    if (!dueEl) return;

    const cardRect = card.getBoundingClientRect();
    const dueRect = dueEl.getBoundingClientRect();
    const topPx = Math.max(0, Math.round(dueRect.top - cardRect.top));
    card.style.setProperty('--mk-delete-confirm-top', `${topPx}px`);
  }

  function openMkDeleteConfirm(card) {
    if (!card) return;
    clearMkDeleteConfirm();

    mkDeleteConfirmCard = card;
    card.style.setProperty('--mk-delete-confirm-top', `${card.offsetHeight}px`);

    card.classList.add('is-delete-confirm');
    const confirmBar = card.querySelector('.mk-card-delete-confirm');
    if (confirmBar) {
      confirmBar.setAttribute('aria-hidden', 'false');
    }

    requestAnimationFrame(() => {
      syncMkDeleteConfirmOverlay(card);
    });

    mkDeleteConfirmTimeoutId = window.setTimeout(() => {
      clearMkDeleteConfirm();
    }, MK_DELETE_CONFIRM_AUTO_CANCEL_MS);

    mkDeleteConfirmOutsideHandler = (event) => {
      if (card.contains(event.target)) return;
      clearMkDeleteConfirm();
    };
    document.addEventListener('pointerdown', mkDeleteConfirmOutsideHandler, true);

    mkDeleteConfirmEscapeHandler = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      clearMkDeleteConfirm();
    };
    document.addEventListener('keydown', mkDeleteConfirmEscapeHandler);
  }

  async function removeKanbanCardById(cardId) {
    if (!cardId) return;

    const state = await loadKanbanState();
    let removed = false;

    KANBAN_COLUMN_DEFS.forEach(({ id }) => {
      const prev = state.columns[id] || [];
      const next = prev.filter((card) => card.id !== cardId);
      if (next.length !== prev.length) {
        state.columns[id] = next;
        removed = true;
      }
    });

    if (!removed) return;
    await saveKanbanState(state);
  }

  async function confirmMkDeleteKanbanCard(card) {
    if (!card) return;

    const cardId = card.dataset.cardId;
    if (!cardId) return;

    clearMkDeleteConfirm();

    card.classList.add('is-removing');
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      card.addEventListener('transitionend', (event) => {
        if (event.target !== card) return;
        if (event.propertyName === 'opacity' || event.propertyName === 'transform') {
          finish();
        }
      });

      window.setTimeout(finish, MK_CARD_REMOVE_ANIM_MS + 40);
    });

    card.remove();
    await removeKanbanCardById(cardId);
  }

  function getActiveKanbanRoot() {
    return activeNativeTasksHost?.querySelector(':scope > .mytasks-kanban')
      || document.querySelector('.mytasks-native-tasks-layout > .mytasks-kanban');
  }

  function isStarredNavLabel(label) {
    return /\bstarred\b/i.test(label) && !/\bunstarred\b/i.test(label);
  }

  function isAllTasksNavLabel(label) {
    return /\ball tasks?\b/i.test(label);
  }

  async function setKanbanStarredFilter(root, starredOnly) {
    await commitKanbanFilterUpdate(getKanbanFilterNavElement(), {
      activeNavIds: starredOnly ? ['starred'] : [],
      activeList: 'all',
    }, { filtersOnly: true });
  }

  async function clearAllKanbanFilters(root) {
    await commitKanbanFilterUpdate(getKanbanFilterNavElement(), { clearAll: true }, { filtersOnly: true });
  }

  async function setKanbanActiveList(root, activeList) {
    if (activeList === 'all') {
      await clearAllKanbanFilters(root);
      return;
    }

    const state = await loadKanbanState();
    state.filters.activeList = activeList;
    await saveKanbanState(state);
  }

  function normalizeWheelPixels(delta, deltaMode, sizeRef) {
    if (deltaMode === 1) {
      return delta * 16;
    }
    if (deltaMode === 2) {
      return delta * (sizeRef || 1);
    }
    return delta;
  }

  function onKanbanBoardWheel(event) {
    const board = event.currentTarget;
    const maxScrollLeft = board.scrollWidth - board.clientWidth;
    if (maxScrollLeft <= 1) return;

    const dxRaw = normalizeWheelPixels(event.deltaX, event.deltaMode, board.clientWidth);
    const dyRaw = normalizeWheelPixels(event.deltaY, event.deltaMode, board.clientHeight);

    let horizontalDelta = 0;
    if (event.shiftKey) {
      horizontalDelta = Math.abs(dyRaw) >= Math.abs(dxRaw) ? dyRaw : dxRaw;
    } else if (Math.abs(dxRaw) >= Math.abs(dyRaw) && Math.abs(dxRaw) >= 0.5) {
      horizontalDelta = dxRaw;
    } else {
      return;
    }

    if (Math.abs(horizontalDelta) < 0.5) return;

    const before = board.scrollLeft;
    const next = Math.min(maxScrollLeft, Math.max(0, before + horizontalDelta));
    if (next === before) {
      return;
    }

    board.scrollLeft = next;
    event.preventDefault();
    event.stopPropagation();
  }

  function wireKanbanBoardWheelScroll(board) {
    if (!board || board.dataset.gpBoardWheelWired === 'true') return;
    board.dataset.gpBoardWheelWired = 'true';
    board.addEventListener('wheel', onKanbanBoardWheel, { passive: false });
  }

  function wireTaskTitleEditing(root, { wiredFlag, inputSelector, hostSelector }) {
    if (!root || root.dataset[wiredFlag] === 'true') return;
    root.dataset[wiredFlag] = 'true';

    root.addEventListener('pointerdown', (event) => {
      if (event.target.closest(inputSelector)) {
        event.stopPropagation();
      }
    }, true);

    root.addEventListener('mousedown', (event) => {
      const input = event.target.closest(inputSelector);
      if (!input || !root.contains(input)) return;
      event.stopPropagation();
      if (document.activeElement !== input) {
        input.focus({ preventScroll: true });
        input.select();
      }
    }, true);

    root.addEventListener('focusin', (event) => {
      const input = event.target.closest(inputSelector);
      if (!input || !root.contains(input)) return;
      input.closest(hostSelector)?.classList.add('is-editing-title');
      input.dataset.editStartValue = input.value;
    });

    root.addEventListener('focusout', (event) => {
      const input = event.target.closest(inputSelector);
      if (!input || !root.contains(input)) return;
      input.closest(hostSelector)?.classList.remove('is-editing-title');
      commitTaskTitleInput(input);
    });

    root.addEventListener('keydown', (event) => {
      const input = event.target.closest(inputSelector);
      if (!input || !root.contains(input)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        input.value = input.dataset.editStartValue || input.value;
        input.blur();
      }
    });
  }

  function wireKanbanCardTitleEditing(root) {
    wireTaskTitleEditing(root, {
      wiredFlag: 'titleEditWired',
      inputSelector: '.mk-card-title',
      hostSelector: '.mk-card',
    });
  }

  function wireKanbanInteractions(root) {
    if (!root || root.dataset.interactionsWired === 'true') return;
    root.dataset.interactionsWired = 'true';

    wireKanbanBoardWheelScroll(root.querySelector('.mytasks-kanban__board'));
    wireKanbanCardTitleEditing(root);

    root.addEventListener('click', (event) => {
      const deleteBtn = event.target.closest('.mk-delete-btn');
      if (deleteBtn && root.contains(deleteBtn)) {
        event.preventDefault();
        event.stopPropagation();
        const card = deleteBtn.closest('.mk-card');
        if (card) {
          openMkDeleteConfirm(card);
        }
        return;
      }

      const deleteConfirmBtn = event.target.closest('.mk-card-delete-confirm__delete');
      if (deleteConfirmBtn && root.contains(deleteConfirmBtn)) {
        event.preventDefault();
        event.stopPropagation();
        const card = deleteConfirmBtn.closest('.mk-card');
        if (card) {
          void confirmMkDeleteKanbanCard(card);
        }
        return;
      }

      const deleteCancelBtn = event.target.closest('.mk-card-delete-confirm__cancel');
      if (deleteCancelBtn && root.contains(deleteCancelBtn)) {
        event.preventDefault();
        event.stopPropagation();
        clearMkDeleteConfirm();
        return;
      }

      const starBtn = event.target.closest('.mk-star-btn');
      if (starBtn && root.contains(starBtn)) {
        event.preventDefault();
        event.stopPropagation();
        const card = starBtn.closest('.mk-card');
        if (card?.dataset.cardId) {
          toggleKanbanCardStar(root, card.dataset.cardId);
        }
        return;
      }

      const subtaskBtn = event.target.closest('.mk-subtask-indicator');
      if (subtaskBtn && root.contains(subtaskBtn)) {
        event.preventDefault();
        event.stopPropagation();
        const card = subtaskBtn.closest('.mk-card');
        if (card?.dataset.cardId) {
          openTaskDetailPopup(subtaskBtn, card.dataset.cardId);
        }
        return;
      }

      const filterPillDismiss = event.target.closest('[data-filter-pill-dismiss]');
      if (filterPillDismiss && root.contains(filterPillDismiss)) {
        event.preventDefault();
        const pill = filterPillDismiss.closest('.mytasks-kanban__filter-pill');
        if (!pill) return;

        const filterNav = getKanbanFilterNavElement();
        if (pill.dataset.filterPillType === 'view') {
          void commitKanbanFilterUpdate(filterNav, { activeNavIds: [] }, { filtersOnly: true });
          return;
        }

        if (pill.dataset.filterPillType === 'category') {
          const label = pill.dataset.filterPillId;
          const nextCategories = (kanbanStateCache?.filters?.activeCategories || [])
            .filter((entry) => entry !== label);
          void commitKanbanFilterUpdate(filterNav, { activeCategories: nextCategories }, { filtersOnly: true });
        }
        return;
      }
    });
  }

  async function persistKanbanBoard(board) {
    const baseState = kanbanStateCache || getDefaultKanbanState();
    const nextState = {
      ...baseState,
      columns: mergeSerializedKanbanColumns(board, baseState),
    };
    await saveKanbanState(nextState);
  }

  function wireKanbanDragAndDrop(board) {
    if (!board || board.dataset.dndWired === 'true') return;
    board.dataset.dndWired = 'true';

    const DRAG_THRESHOLD_PX = 6;

    let draggedCard = null;
    let dragGhost = null;
    let dragClone = null;
    let pendingCard = null;
    let dragActive = false;
    let activePointerId = null;
    let pointerX = 0;
    let pointerY = 0;
    let startX = 0;
    let startY = 0;
    let cloneOffsetX = 0;
    let cloneOffsetY = 0;
    let hoveredColumn = null;
    let activeDropColumn = null;
    let originContainer = null;
    let originNextSibling = null;

    function getColumnCards(container) {
      return [...container.querySelectorAll('.mk-card:not(.is-dragging)')];
    }

    function getGhostInsertBefore(container, clientY) {
      const cards = getColumnCards(container);
      for (let index = 0; index < cards.length; index += 1) {
        const card = cards[index];
        const rect = card.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (midpoint > clientY) {
          return card;
        }
      }
      return null;
    }

    function isGhostInPosition(container, insertBefore) {
      if (!dragGhost || dragGhost.parentElement !== container) return false;
      if (!insertBefore) return dragGhost === container.lastElementChild;
      return dragGhost.nextElementSibling === insertBefore;
    }

    function recordCardTops(scope) {
      const tops = new Map();
      scope.querySelectorAll('.mk-card').forEach((card) => {
        tops.set(card, card.getBoundingClientRect().top);
      });
      return tops;
    }

    function playFlip(scope, beforeTops) {
      const animations = [];
      scope.querySelectorAll('.mk-card').forEach((card) => {
        const firstTop = beforeTops.get(card);
        if (firstTop === undefined) return;
        const lastTop = card.getBoundingClientRect().top;
        const delta = firstTop - lastTop;
        if (Math.abs(delta) < 0.5) return;
        animations.push({ card, delta });
      });

      if (!animations.length) return;

      animations.forEach(({ card, delta }) => {
        card.style.transition = 'none';
        card.style.transform = `translateY(${delta}px)`;
      });

      requestAnimationFrame(() => {
        animations.forEach(({ card }) => {
          card.style.transition = '';
          card.style.transform = '';
        });
      });
    }

    function createDragGhost(height) {
      const ghost = document.createElement('div');
      ghost.className = 'mk-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.height = `${height}px`;
      return ghost;
    }

    function createDragClone(card, rect) {
      const host = document.createElement('div');
      host.className = 'mytasks-kanban mk-drag-clone-host';
      host.setAttribute('aria-hidden', 'true');
      host.style.width = `${rect.width}px`;

      const clone = card.cloneNode(true);
      clone.classList.remove(
        'is-dragging',
        'is-drop-snap',
        'is-editing-title',
        'is-schedule-open',
      );
      clone.classList.add('mk-drag-clone');
      clone.querySelectorAll('.gp-inline-schedule-dropdown').forEach((el) => {
        el.hidden = true;
      });
      clone.querySelectorAll('.gp-inline-schedule-date-link.is-open, .gp-inline-schedule-time-link.is-open')
        .forEach((el) => el.classList.remove('is-open'));
      clone.querySelectorAll('.mk-card-due-btn.is-schedule-active, .gp-task-due-btn.is-schedule-active')
        .forEach((el) => el.classList.remove('is-schedule-active'));

      host.appendChild(clone);
      document.body.appendChild(host);
      return host;
    }

    function updateDragClonePosition() {
      if (!dragClone) return;
      dragClone.style.left = `${pointerX - cloneOffsetX}px`;
      dragClone.style.top = `${pointerY - cloneOffsetY}px`;
    }

    function clearDropTargets() {
      board.querySelectorAll('.mk-column-cards.is-drop-target').forEach((column) => {
        column.classList.remove('is-drop-target');
      });
    }

    function placeDragGhost(container, clientY) {
      if (!dragGhost || !container) return;

      const insertBefore = getGhostInsertBefore(container, clientY);
      if (isGhostInPosition(container, insertBefore)) return;

      const beforeTops = recordCardTops(board);
      if (dragGhost.parentElement && dragGhost.parentElement !== container) {
        dragGhost.remove();
      }

      if (insertBefore) {
        container.insertBefore(dragGhost, insertBefore);
      } else {
        container.appendChild(dragGhost);
      }

      playFlip(board, beforeTops);
    }

    function getDropColumnAt(clientX, clientY) {
      if (dragClone) {
        dragClone.style.visibility = 'hidden';
      }

      const target = document.elementFromPoint(clientX, clientY);

      if (dragClone) {
        dragClone.style.visibility = '';
      }

      const resolveColumnCards = (el) => {
        if (!el || !(el instanceof Element)) return null;
        const onCards = el.closest('.mk-column-cards');
        if (onCards && board.contains(onCards)) return onCards;
        const column = el.closest('.mk-column');
        if (column && board.contains(column)) {
          const cards = column.querySelector(':scope > .mk-column-cards');
          if (cards && board.contains(cards)) return cards;
        }
        return null;
      };

      let container = resolveColumnCards(target);

      if (!container) {
        board.querySelectorAll('.mk-column').forEach((column) => {
          if (container) return;
          const rect = column.getBoundingClientRect();
          const inside = clientX >= rect.left && clientX <= rect.right
            && clientY >= rect.top && clientY <= rect.bottom;
          if (!inside) return;
          const cards = column.querySelector(':scope > .mk-column-cards');
          if (cards && board.contains(cards)) {
            container = cards;
          }
        });
      }

      if (container && board.contains(container)) return container;
      if (hoveredColumn && board.contains(hoveredColumn)) return hoveredColumn;
      if (activeDropColumn && board.contains(activeDropColumn)) return activeDropColumn;
      return null;
    }

    function finishDraggedCardSnap() {
      if (!draggedCard) return;
      draggedCard.classList.remove('is-dragging');
      draggedCard.classList.add('is-drop-snap');
      window.setTimeout(() => {
        draggedCard?.classList.remove('is-drop-snap');
      }, 150);
    }

    function resetDragState() {
      draggedCard = null;
      dragGhost = null;
      dragClone = null;
      pendingCard = null;
      dragActive = false;
      activePointerId = null;
      hoveredColumn = null;
      activeDropColumn = null;
      originContainer = null;
      originNextSibling = null;
      document.body.classList.remove('mytasks-kanban-dragging');
    }

    function detachPointerListeners() {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    }

    function beginDrag(card, event) {
      dragActive = true;
      draggedCard = card;
      pointerX = event.clientX;
      pointerY = event.clientY;

      const rect = card.getBoundingClientRect();
      cloneOffsetX = event.clientX - rect.left + 8;
      cloneOffsetY = event.clientY - rect.top + 8;

      originContainer = card.parentElement;
      originNextSibling = card.nextSibling;

      dragGhost = createDragGhost(rect.height);
      dragClone = createDragClone(card, rect);
      updateDragClonePosition();

      if (!originContainer?.classList.contains('mk-column-cards')) {
        cancelDrag();
        return;
      }

      originContainer.replaceChild(dragGhost, card);
      card.classList.add('is-dragging');

      hoveredColumn = originContainer;
      activeDropColumn = originContainer;
      document.body.classList.add('mytasks-kanban-dragging');
    }

    async function commitDrag() {
      if (!draggedCard || !dragGhost?.parentElement) {
        cancelDrag();
        return;
      }

      const beforeTops = recordCardTops(board);
      dragGhost.replaceWith(draggedCard);
      playFlip(board, beforeTops);

      if (dragClone) {
        dragClone.remove();
        dragClone = null;
      }

      clearDropTargets();
      finishDraggedCardSnap();
      document.body.classList.remove('mytasks-kanban-dragging');
      await persistKanbanBoard(board);
      resetDragState();
    }

    function cancelDrag() {
      const beforeTops = recordCardTops(board);

      if (dragGhost?.parentElement && draggedCard) {
        dragGhost.replaceWith(draggedCard);
      } else if (originContainer && draggedCard) {
        if (originNextSibling && originNextSibling.parentElement === originContainer) {
          originContainer.insertBefore(draggedCard, originNextSibling);
        } else {
          originContainer.appendChild(draggedCard);
        }
      }

      if (draggedCard) {
        draggedCard.classList.remove('is-dragging', 'is-drop-snap');
      }

      if (dragClone) {
        dragClone.remove();
        dragClone = null;
      }

      clearDropTargets();
      playFlip(board, beforeTops);
      resetDragState();
    }

    function clearPointerSelection() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      selection.removeAllRanges();
    }

    function onPointerMove(event) {
      if (event.pointerId !== activePointerId) return;

      if (!dragActive) {
        if (!pendingCard) return;
        const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
        if (distance < DRAG_THRESHOLD_PX) return;
        event.preventDefault();
        beginDrag(pendingCard, event);
        pendingCard = null;
      } else {
        event.preventDefault();
      }

      clearPointerSelection();

      pointerX = event.clientX;
      pointerY = event.clientY;
      updateDragClonePosition();

      const container = getDropColumnAt(pointerX, pointerY);
      if (!container) {
        clearDropTargets();
        return;
      }

      hoveredColumn = container;
      activeDropColumn = container;
      clearDropTargets();
      container.classList.add('is-drop-target');
      placeDragGhost(container, pointerY);
    }

    async function onPointerUp(event) {
      if (event.pointerId !== activePointerId) return;

      detachPointerListeners();

      if (!dragActive) {
        pendingCard = null;
        activePointerId = null;
        document.body.classList.remove('mytasks-kanban-dragging');
        clearPointerSelection();
        return;
      }

      const container = getDropColumnAt(pointerX, pointerY) || activeDropColumn;
      if (container && dragGhost?.parentElement) {
        await commitDrag();
      } else {
        cancelDrag();
      }

      activePointerId = null;
    }

    function onPointerDown(event) {
      if (event.button !== 0) return;

      const card = event.target.closest('.mk-card');
      if (!card || !board.contains(card)) return;
      if (event.target.closest('.mk-card-header-actions')) return;
      if (event.target.closest('.mk-card-delete-confirm')) return;
      if (event.target.closest('.mk-card-due-btn')) return;
      if (event.target.closest('.mk-card-title')) return;
      if (card.classList.contains('is-editing-title')) return;
      if (card.classList.contains('is-delete-confirm')) return;

      pendingCard = card;
      activePointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;

      event.preventDefault();
      clearPointerSelection();
      document.body.classList.add('mytasks-kanban-dragging');

      document.addEventListener('pointermove', onPointerMove, { passive: false });
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
    }

    board.addEventListener('pointerdown', onPointerDown);
  }

  async function loadKanbanBoard(root) {
    const kanbanRoot = root?.classList?.contains('mytasks-kanban')
      ? root
      : root?.closest('.mytasks-kanban');
    if (!kanbanRoot) return;

    wireKanbanInteractions(kanbanRoot);
    await syncTaskViewsFromStorage();
  }

  function getElementLabel(el) {
    if (!el) return '';
    return `${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-tooltip') || ''} ${el.getAttribute('title') || ''}`.trim();
  }

  function isExtensionTasksControl(el) {
    return Boolean(
      el?.closest('#gp-panel, .mytasks-sidebar, #gp-sidebar-btn, .gp-sidebar-btn-shell, #gp-sidebar-rail')
      || /\bmy tasks\b/i.test(getElementLabel(el)),
    );
  }

  function isGoogleTasksRailControl(el) {
    if (!el || isExtensionTasksControl(el) || !isVisibleElement(el)) return false;

    const label = getElementLabel(el);
    if (!/\btasks?\b/i.test(label)) return false;

    const rect = el.getBoundingClientRect();
    return rect.right >= window.innerWidth - 220;
  }

  function isTasksRailControlActive(el) {
    if (!el) return false;

    if (el.getAttribute('aria-pressed') === 'true') return true;
    if (el.getAttribute('aria-selected') === 'true') return true;
    if (el.getAttribute('aria-expanded') === 'true') return true;
    if (el.getAttribute('aria-current') === 'true') return true;

    const selectedAncestor = el.closest('[aria-pressed="true"], [aria-selected="true"], [aria-expanded="true"], [aria-current="true"]');
    return Boolean(selectedAncestor && selectedAncestor.contains(el) && isGoogleTasksRailControl(el));
  }

  function findActiveGoogleTasksRailControl() {
    const controls = [...document.querySelectorAll('button, [role="button"], div[role="button"]')]
      .filter(isGoogleTasksRailControl);

    return controls.find(isTasksRailControlActive) || controls[0] || null;
  }

  function getTasksPanelDescriptor(el) {
    if (!el) return '';

    const pieces = [
      el.getAttribute('aria-label'),
      el.getAttribute('data-tooltip'),
      el.getAttribute('title'),
      el.getAttribute('role'),
    ];
    const heading = el.querySelector('h1, h2, h3, [role="heading"]');
    if (heading) {
      pieces.push(heading.textContent);
    }

    return pieces.filter(Boolean).join(' ').trim();
  }

  function hasTasksPanelSignals(el) {
    if (!el) return false;

    const descriptor = getTasksPanelDescriptor(el);
    if (/\btasks?\b/i.test(descriptor)) return true;

    if (el.querySelector('iframe[src*="tasks.google"], iframe[src*="tasks"]')) return true;

    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (/\badd a task\b/i.test(text)) return true;
    if (/\bcreate (a )?task\b/i.test(text)) return true;
    if (/\bmy lists?\b/i.test(text)) return true;

    return [...el.querySelectorAll('h1, h2, h3, [role="heading"], [role="tab"], button, [role="button"]')]
      .some((node) => /^\s*tasks?\s*$/i.test((node.textContent || '').trim()));
  }

  function isTasksSurfaceVisible(el) {
    if (!el || !isVisibleElement(el)) return false;
    if (el.closest('#gp-panel, .mytasks-sidebar')) return false;

    const calendarMain = getCalendarMainEl();
    if (calendarMain && (el === calendarMain || el.contains(calendarMain))) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width < 180 || rect.height < 120) return false;

    const onRightSide = rect.left >= window.innerWidth * 0.45 && rect.right >= window.innerWidth - 56;
    const hasTaskIframe = Boolean(el.querySelector('iframe[src*="tasks.google"], iframe[src*="tasks"]'));

    return onRightSide || hasTaskIframe;
  }

  function scoreTasksPanelCandidate(el, railActive) {
    if (!isTasksSurfaceVisible(el)) return -1;

    const hasSignals = hasTasksPanelSignals(el);
    if (!hasSignals && !railActive) return -1;

    const rect = el.getBoundingClientRect();
    let score = rect.width * rect.height;

    if (hasSignals) score += 200_000;
    if (el.querySelector('iframe[src*="tasks.google"], iframe[src*="tasks"]')) score += 1_000_000;
    if (/\btasks?\b/i.test(getTasksPanelDescriptor(el))) score += 50_000;
    if (rect.right >= window.innerWidth - 24) score += 10_000;
    if (railActive) score += 25_000;

    return score;
  }

  function pickBestTasksPanel(candidates, railActive) {
    let best = null;
    let bestScore = -1;

    candidates.forEach((candidate) => {
      const score = scoreTasksPanelCandidate(candidate, railActive);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    });

    return best;
  }

  function findTasksPanelFromRailControl(control, railActive) {
    if (!control) return null;

    const candidates = new Set();
    let ancestor = control.parentElement;

    for (let depth = 0; depth < 14 && ancestor; depth += 1) {
      if (isTasksSurfaceVisible(ancestor) && (hasTasksPanelSignals(ancestor) || railActive)) {
        candidates.add(ancestor);
      }

      ancestor.querySelectorAll('[role="complementary"], aside, div[data-ved], iframe[src*="tasks.google"], iframe[src*="tasks"]').forEach((node) => {
        const panel = node.matches('iframe')
          ? node.parentElement
          : node;

        if (panel && isTasksSurfaceVisible(panel) && (hasTasksPanelSignals(panel) || railActive)) {
          candidates.add(panel);
        }
      });

      ancestor = ancestor.parentElement;
    }

    return pickBestTasksPanel(candidates, railActive);
  }

  function findVisibleGoogleTasksPanel() {
    const candidates = new Set();
    const activeControl = findActiveGoogleTasksRailControl();
    const railActive = Boolean(activeControl && isTasksRailControlActive(activeControl));

    document.querySelectorAll('iframe[src*="tasks.google"], iframe[src*="tasks"]').forEach((iframe) => {
      if (!isVisibleElement(iframe)) return;

      let host = iframe.parentElement;
      for (let depth = 0; depth < 8 && host; depth += 1) {
        if (isTasksSurfaceVisible(host)) {
          candidates.add(host);
          break;
        }
        host = host.parentElement;
      }
    });

    document.querySelectorAll('[role="complementary"], aside, div[data-ved]').forEach((el) => {
      if (!isTasksSurfaceVisible(el) || !hasTasksPanelSignals(el)) return;
      candidates.add(el);
    });

    const panelFromRail = findTasksPanelFromRailControl(activeControl, railActive);
    if (panelFromRail) {
      candidates.add(panelFromRail);
    }

    return pickBestTasksPanel(candidates, railActive);
  }

  function findNativeTasksIframe(scope) {
    if (!scope) return null;
    return scope.querySelector('iframe[src*="tasks.google"], iframe[src*="tasks"]');
  }

  function isNativeTasksManagedElement(el) {
    if (!(el instanceof Element)) return false;
    return Boolean(
      el.closest('.mytasks-kanban, .mytasks-native-tasks-nav, .mytasks-native-tasks-layout, #gp-panel, .mytasks-sidebar'),
    );
  }

  function shouldScheduleNativeTasksKanbanSync(mutations) {
    return mutations.some((mutation) => {
      if (isNativeTasksManagedElement(mutation.target)) return false;

      if (mutation.type === 'attributes'
        && mutation.target instanceof Element
        && mutation.target.hasAttribute('data-mytasks-native-hidden')) {
        return false;
      }

      if (mutation.type === 'childList') {
        const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
        if (changedNodes.some((node) => isNativeTasksManagedElement(node))) return false;
      }

      return true;
    });
  }

  function isNativeTasksLayoutStable(host) {
    if (!host?.classList.contains('mytasks-native-tasks-layout')) return false;

    const navShell = host.querySelector(':scope > .mytasks-native-tasks-nav');
    const iframe = navShell ? findNativeTasksIframe(navShell) : null;
    const board = host.querySelector(':scope > .mytasks-kanban .mytasks-kanban__board');

    return Boolean(navShell && iframe && board);
  }

  function ensureNativeTasksLayout(host) {
    if (!host) return;
    host.classList.add('mytasks-native-tasks-layout');
  }

  function restoreNativeTasksIframe(scope) {
    if (!scope) return;

    scope.querySelectorAll('iframe[src*="tasks.google"], iframe[src*="tasks"]').forEach((iframe) => {
      iframe.removeAttribute('data-mytasks-hidden-native');
      iframe.style.removeProperty('display');
    });
  }

  function tagColorStyles(tagMeta) {
    const colorKey = tagMeta?.colorKey || 'blue';
    if (colorKey === 'custom' && normalizeHexColor(tagMeta?.customHex)) {
      const hex = normalizeHexColor(tagMeta.customHex);
      return {
        swatch: hex,
        pillClass: 'mytasks-filter-tag-pill--custom',
        pillStyle: `--gp-filter-tag-fg:${hex};--gp-filter-tag-bg:${hex}22`,
      };
    }

    return {
      swatch: tagResolvedHex({ colorKey }),
      pillClass: `mytasks-filter-tag-pill--${chipClassForColorKey(colorKey)}`,
      pillStyle: '',
    };
  }

  function buildKanbanViewRadioOption(option, activeViewId) {
    const label = document.createElement('label');
    label.className = 'mytasks-filter-nav__option mytasks-filter-nav__option--radio';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'kanban-view-filter';
    input.value = option.id;
    input.className = 'mytasks-filter-nav__input';
    input.checked = option.id === 'all' ? !activeViewId : activeViewId === option.id;

    const control = document.createElement('span');
    control.className = 'mytasks-filter-nav__control mytasks-filter-nav__control--radio';
    control.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'mytasks-filter-nav__option-label';
    text.textContent = option.label;

    label.appendChild(input);
    label.appendChild(control);
    if (option.iconKey && KANBAN_NAV_ICONS[option.iconKey]) {
      const icon = document.createElement('span');
      icon.className = 'mytasks-filter-nav__option-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = KANBAN_NAV_ICONS[option.iconKey];
      label.appendChild(icon);
    }
    label.appendChild(text);
    return label;
  }

  function getCategoryFilterInputId(categoryLabel) {
    return `kanban-category-${String(categoryLabel).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  }

  function buildKanbanCategoryCheckboxOption(category, activeCategories) {
    const label = document.createElement('label');
    label.className = 'mytasks-filter-nav__option mytasks-filter-nav__option--checkbox';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = getCategoryFilterInputId(category.label);
    input.value = category.label;
    input.className = 'mytasks-filter-nav__input';
    input.checked = activeCategories.includes(category.label);
    label.htmlFor = input.id;

    const control = document.createElement('span');
    control.className = 'mytasks-filter-nav__control mytasks-filter-nav__control--checkbox';
    control.setAttribute('aria-hidden', 'true');

    const colors = tagColorStyles(category);
    const swatch = document.createElement('span');
    swatch.className = 'mytasks-filter-nav__swatch';
    swatch.style.backgroundColor = colors.swatch;
    swatch.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'mytasks-filter-nav__option-label';
    text.textContent = category.label;

    const count = document.createElement('span');
    count.className = 'mytasks-filter-nav__count';
    count.textContent = String(category.count);

    label.appendChild(input);
    label.appendChild(control);
    label.appendChild(swatch);
    label.appendChild(text);
    label.appendChild(count);
    return label;
  }

  function buildKanbanFilterNavMarkup() {
    return `
<aside class="mytasks-filter-nav" aria-label="Task filters">
  <div class="mytasks-filter-nav__create-wrap">
    <button type="button" class="mytasks-create-btn" data-nav-create="true">
      <span class="mytasks-create-btn__icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </span>
      <span class="mytasks-create-btn__label">Create</span>
    </button>
  </div>
  <div class="mytasks-filter-nav__scroll">
    <section class="mytasks-filter-nav__section mytasks-filter-nav__section--view">
      <h2 class="mytasks-filter-nav__heading">View</h2>
      <div class="mytasks-filter-nav__view-list" data-filter-list="view" role="radiogroup" aria-label="View"></div>
    </section>

    <section class="mytasks-filter-nav__section mytasks-filter-nav__section--categories">
      <div class="mytasks-filter-nav__section-head mytasks-filter-nav__section-head--categories">
        <button type="button" class="mytasks-filter-nav__section-toggle" data-section="categories" aria-expanded="true">
          <svg class="mytasks-filter-nav__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <span class="mytasks-filter-nav__heading">Categories</span>
        </button>
        <button type="button" class="mytasks-filter-nav__select-all-categories" hidden>Select all</button>
        <button type="button" class="mytasks-filter-nav__clear-categories" hidden>Clear</button>
      </div>
      <div class="mytasks-filter-nav__section-panel" data-section-panel="categories">
        <div class="mytasks-filter-nav__list" data-filter-list="categories"></div>
        <button type="button" class="mytasks-filter-nav__manage-tags">+ Manage tags</button>
      </div>
    </section>
  </div>
</aside>
`.trim();
  }

  function patchKanbanFilterNav(nav, state) {
    if (!nav) return;

    const filters = state.filters || getDefaultKanbanFilters();
    const activeViewId = getActiveViewFilterId(filters);
    const activeCategories = filters.activeCategories || [];

    nav.querySelectorAll('[data-filter-list="view"] .mytasks-filter-nav__input').forEach((input) => {
      input.checked = input.value === 'all' ? !activeViewId : input.value === activeViewId;
    });

    nav.querySelectorAll('[data-filter-list="categories"] .mytasks-filter-nav__input').forEach((input) => {
      input.checked = activeCategories.includes(input.value);
    });

    const clearCategoriesBtn = nav.querySelector('.mytasks-filter-nav__clear-categories');
    const selectAllCategoriesBtn = nav.querySelector('.mytasks-filter-nav__select-all-categories');
    const categoryInputs = nav.querySelectorAll('[data-filter-list="categories"] .mytasks-filter-nav__input');
    const allCategoryLabels = [...categoryInputs].map((input) => input.value);
    const allCategoriesSelected = allCategoryLabels.length > 0
      && allCategoryLabels.every((label) => activeCategories.includes(label));

    if (clearCategoriesBtn) {
      clearCategoriesBtn.hidden = activeCategories.length === 0;
    }
    if (selectAllCategoriesBtn) {
      selectAllCategoriesBtn.hidden = !allCategoryLabels.length || allCategoriesSelected;
    }

    const categoriesSection = nav.querySelector('.mytasks-filter-nav__section--categories');
    if (categoriesSection) {
      const collapsed = Boolean(filters.sectionsCollapsed?.categories);
      categoriesSection.classList.toggle('is-collapsed', collapsed);
      const toggle = categoriesSection.querySelector('.mytasks-filter-nav__section-toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      }
    }
  }

  function renderKanbanFilterNav(nav, state) {
    if (!nav) return;

    const filters = state.filters || getDefaultKanbanFilters();
    const viewList = nav.querySelector('[data-filter-list="view"]');
    const categoriesList = nav.querySelector('[data-filter-list="categories"]');
    const clearCategoriesBtn = nav.querySelector('.mytasks-filter-nav__clear-categories');
    const selectAllCategoriesBtn = nav.querySelector('.mytasks-filter-nav__select-all-categories');
    const activeViewId = getActiveViewFilterId(filters);
    const activeCategories = filters.activeCategories || [];

    if (viewList) {
      viewList.innerHTML = '';
      KANBAN_VIEW_RADIO_OPTIONS.forEach((option) => {
        viewList.appendChild(buildKanbanViewRadioOption(option, activeViewId));
      });
    }

    if (categoriesList) {
      categoriesList.innerHTML = '';
      categoriesList.classList.remove('mytasks-filter-nav__list--category-pills');
      const categories = getBoardCategoryRows(state);

      if (!categories.length) {
        const empty = document.createElement('p');
        empty.className = 'mytasks-filter-nav__empty';
        empty.textContent = 'No categories yet';
        categoriesList.appendChild(empty);
      } else {
        categories.forEach((category) => {
          categoriesList.appendChild(buildKanbanCategoryCheckboxOption(category, activeCategories));
        });
      }

      const allCategoryLabels = categories.map((row) => row.label);
      const allCategoriesSelected = allCategoryLabels.length > 0
        && allCategoryLabels.every((label) => activeCategories.includes(label));

      if (clearCategoriesBtn) {
        clearCategoriesBtn.hidden = activeCategories.length === 0;
      }
      if (selectAllCategoriesBtn) {
        selectAllCategoriesBtn.hidden = !allCategoryLabels.length || allCategoriesSelected;
      }
    }

    const categoriesSection = nav.querySelector('.mytasks-filter-nav__section--categories');
    if (categoriesSection) {
      const collapsed = Boolean(filters.sectionsCollapsed?.categories);
      categoriesSection.classList.toggle('is-collapsed', collapsed);
      const toggle = categoriesSection.querySelector('.mytasks-filter-nav__section-toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      }
    }
  }

  let kanbanFilterNavWired = false;
  let kanbanFilterSaveGeneration = 0;

  function readCategoryFilterSelection(nav) {
    return [...nav.querySelectorAll(
      '[data-filter-list="categories"] .mytasks-filter-nav__input:checked',
    )].map((el) => el.value);
  }

  function wireKanbanFilterNav(nav) {
    if (!nav || kanbanFilterNavWired) return;
    kanbanFilterNavWired = true;

    nav.addEventListener('change', (event) => {
      const input = event.target;
      if (!nav.contains(input) || !input.classList.contains('mytasks-filter-nav__input')) return;

      if (input.matches('[data-filter-list="view"] input[type="radio"]')) {
        const nextViewId = input.value === 'all' ? [] : [input.value];
        void commitKanbanFilterUpdate(nav, { activeNavIds: nextViewId }, { filtersOnly: true });
        return;
      }

      if (input.matches('[data-filter-list="categories"] input[type="checkbox"]')) {
        void commitKanbanFilterUpdate(nav, {
          activeCategories: readCategoryFilterSelection(nav),
        }, { filtersOnly: true });
      }
    });

    nav.addEventListener('click', (event) => {
      const createBtn = event.target.closest('[data-nav-create]');
      if (createBtn && nav.contains(createBtn)) {
        event.preventDefault();
        openGlobalCreateTaskModal({});
        return;
      }

      const selectAllCategoriesBtn = event.target.closest('.mytasks-filter-nav__select-all-categories');
      if (selectAllCategoriesBtn && nav.contains(selectAllCategoriesBtn)) {
        event.preventDefault();
        const labels = getBoardCategoryRows(kanbanStateCache || getDefaultKanbanState())
          .map((row) => row.label);
        void commitKanbanFilterUpdate(nav, { activeCategories: labels }, { filtersOnly: true });
        return;
      }

      const clearCategoriesBtn = event.target.closest('.mytasks-filter-nav__clear-categories');
      if (clearCategoriesBtn && nav.contains(clearCategoriesBtn)) {
        event.preventDefault();
        void commitKanbanFilterUpdate(nav, { activeCategories: [] }, { filtersOnly: true });
        return;
      }

      const manageTagsBtn = event.target.closest('.mytasks-filter-nav__manage-tags');
      if (manageTagsBtn && nav.contains(manageTagsBtn)) {
        event.preventDefault();
        openManageTagsModalForNav();
        return;
      }

      const sectionToggle = event.target.closest('.mytasks-filter-nav__section-toggle');
      if (sectionToggle && nav.contains(sectionToggle)) {
        event.preventDefault();
        const sectionKey = sectionToggle.dataset.section;
        if (sectionKey !== 'categories') return;

        void loadKanbanState().then((state) => {
          const collapsed = { ...state.filters.sectionsCollapsed };
          collapsed.categories = !collapsed.categories;
          return updateKanbanFilters({
            sectionsCollapsed: collapsed,
          }, { filtersOnly: true });
        });
      }
    });
  }

  function ensureKanbanFilterNav(navShell) {
    if (!navShell) return null;

    let frameWrap = navShell.querySelector(':scope > .mytasks-native-tasks-nav__frame');
    const iframe = findNativeTasksIframe(navShell);

    if (iframe && !frameWrap) {
      frameWrap = document.createElement('div');
      frameWrap.className = 'mytasks-native-tasks-nav__frame';
      navShell.insertBefore(frameWrap, iframe);
      frameWrap.appendChild(iframe);
    }

    let filterNav = navShell.querySelector(':scope > .mytasks-filter-nav');
    if (filterNav && (
      !filterNav.querySelector('[data-filter-list="view"]')
      || !filterNav.querySelector('[data-nav-create]')
    )) {
      filterNav.remove();
      filterNav = null;
      kanbanFilterNavWired = false;
    }

    if (!filterNav) {
      const template = document.createElement('template');
      template.innerHTML = buildKanbanFilterNavMarkup();
      filterNav = template.content.firstElementChild;
      if (!filterNav) return null;
      if (frameWrap) {
        navShell.insertBefore(filterNav, frameWrap);
      } else {
        navShell.appendChild(filterNav);
      }
      wireKanbanFilterNav(filterNav);
    } else if (frameWrap && filterNav.compareDocumentPosition(frameWrap) & Node.DOCUMENT_POSITION_PRECEDING) {
      navShell.insertBefore(filterNav, frameWrap);
    }

    void loadKanbanState().then((state) => {
      renderKanbanFilterNav(filterNav, state);
    });

    return filterNav;
  }

  function openManageTagsModalForNav() {
    ensureGlobalTaskModals();
    void loadKanbanState().then((state) => {
      gpManageTagsDraft = normalizeTags(state.tags).map((t) => ({ ...t }));
      const layer = document.getElementById('gp-mt-layer');
      const root = getGlobalTaskModalsRoot();
      if (!layer || !root) return;

      gpResumeCreateTaskLayerAfterTags = false;
      renderManageTagRows();
      root.hidden = false;
      layer.hidden = false;
      document.body.classList.add('gp-task-modals-open');
    });
  }

  function ensureNativeTasksNavShell(host) {
    if (!host) return null;

    let navShell = host.querySelector(':scope > .mytasks-native-tasks-nav');
    const iframe = findNativeTasksIframe(host);

    if (!iframe) {
      return navShell;
    }

    if (!navShell) {
      navShell = document.createElement('div');
      navShell.className = 'mytasks-native-tasks-nav';

      const kanban = host.querySelector(':scope > .mytasks-kanban');
      if (kanban) {
        host.insertBefore(navShell, kanban);
      } else {
        host.prepend(navShell);
      }
    }

    if (iframe.parentElement !== navShell) {
      navShell.appendChild(iframe);
    }

    restoreNativeTasksIframe(navShell);
    ensureKanbanFilterNav(navShell);
    return navShell;
  }

  function findTasksInjectHost(panel) {
    if (!panel) return null;

    const existingLayout = panel.querySelector('.mytasks-native-tasks-layout');
    if (existingLayout) return existingLayout;

    const iframe = findNativeTasksIframe(panel);
    if (iframe) {
      let host = iframe.parentElement;
      while (host && host !== panel) {
        if (host.classList.contains('mytasks-native-tasks-nav') || host.classList.contains('mytasks-kanban')) {
          host = host.parentElement;
          continue;
        }
        break;
      }

      if (host) return host;
    }

    const explicit = panel.querySelector('[role="main"], [role="region"][aria-label*="Task" i]');
    if (explicit) return explicit;

    let bestChild = panel;
    let bestScore = panel.clientHeight * panel.clientWidth;

    panel.querySelectorAll('div').forEach((child) => {
      if (child.classList.contains('mytasks-kanban')
        || child.classList.contains('mytasks-native-tasks-nav')
        || child.classList.contains('mytasks-native-tasks-layout')
        || child.closest('.mytasks-kanban')) return;

      const style = window.getComputedStyle(child);
      const scrollable = style.overflowY === 'auto' || style.overflowY === 'scroll';
      const score = (child.clientHeight * child.clientWidth) + (scrollable ? 10000 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestChild = child;
      }
    });

    return bestChild;
  }

  function restoreNativeTaskListSurfaces(scope) {
    const root = scope || document;
    root.querySelectorAll('[data-mytasks-native-hidden]').forEach((el) => {
      el.removeAttribute('data-mytasks-native-hidden');
      el.style.removeProperty('display');
    });
  }

  function hideNativeTaskListSurfaces(panel, host) {
    if (!host) return;

    const calendarMain = getCalendarMainEl();

    host.querySelectorAll(':scope > *').forEach((child) => {
      if (!(child instanceof Element)) return;
      if (child.classList.contains('mytasks-kanban') || child.classList.contains('mytasks-native-tasks-nav')) return;
      if (calendarMain && (child === calendarMain || child.contains(calendarMain))) return;

      child.setAttribute('data-mytasks-native-hidden', 'true');
      child.style.setProperty('display', 'none', 'important');
    });

    if (!panel || !panel.contains(host)) return;

    panel.querySelectorAll('iframe[src*="tasks.google"], iframe[src*="tasks"]').forEach((iframe) => {
      if (host.contains(iframe)) return;
      iframe.setAttribute('data-mytasks-native-hidden', 'true');
      iframe.style.setProperty('display', 'none', 'important');
    });
  }

  function syncKanbanHostSize(host) {
    const kanban = host?.querySelector(':scope > .mytasks-kanban');
    if (!host || !kanban) return;

    const rect = host.getBoundingClientRect();
    if (!rect.height) return;

    const style = window.getComputedStyle(host);
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const innerHeight = Math.max(0, rect.height - paddingTop - paddingBottom);

    kanban.style.height = `${innerHeight}px`;
    kanban.style.minHeight = `${innerHeight}px`;
  }

  function observeNativeTasksHost(host) {
    if (!host || nativeTasksResizeObserver) return;

    nativeTasksResizeObserver = new ResizeObserver(() => {
      syncKanbanHostSize(host);
    });
    nativeTasksResizeObserver.observe(host);
    syncKanbanHostSize(host);
  }

  function setupKanbanStorageListener() {
    if (kanbanStorageListenerWired || !chrome?.storage?.onChanged) return;
    kanbanStorageListenerWired = true;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[KANBAN_STORAGE_KEY]) return;

      const incoming = normalizeKanbanState(changes[KANBAN_STORAGE_KEY].newValue);
      const incomingFilters = JSON.stringify(incoming.filters || {});
      const cacheFilters = JSON.stringify(kanbanStateCache?.filters || {});
      if (incomingFilters === cacheFilters) return;

      kanbanStateCache = incoming;
      if (isKanbanDragActive()) return;
      refreshLinkedTaskViews(kanbanStateCache);
    });
  }

  function handleNativeTasksFrameMessage(event) {
    if (!event?.data || event.data.source !== MYTASKS_MESSAGE_SOURCE) return;
    if (!/\.google\.com$/.test(event.origin || '')) return;

    const root = getActiveKanbanRoot();
    if (!root) return;

    if (event.data.type === 'MYTASKS_NATIVE_CREATE') {
      openCreateTaskModal(root, event.data.columnId);
      return;
    }

    if (event.data.type === 'MYTASKS_NATIVE_STARRED') {
      const starredOnly = event.data.active === undefined ? true : Boolean(event.data.active);
      setKanbanStarredFilter(root, starredOnly);
      return;
    }

    if (event.data.type === 'MYTASKS_NATIVE_LIST') {
      const listId = event.data.listId || 'all';
      if (listId === 'all') {
        clearAllKanbanFilters(root);
      }
    }
  }

  function setupNativeTasksFrameBridge() {
    window.addEventListener('message', handleNativeTasksFrameMessage);
    setupKanbanStorageListener();
  }

  async function injectKanbanIntoNativeTasksPanel(host) {
    if (!host || host.closest('#gp-panel, .mytasks-sidebar')) return;

    ensureNativeTasksLayout(host);
    ensureNativeTasksNavShell(host);
    hideNativeTaskListSurfaces(findVisibleGoogleTasksPanel(), host);

    const existingRoot = host.querySelector(':scope > .mytasks-kanban');
    if (existingRoot) {
      await loadKanbanBoard(existingRoot);
      observeNativeTasksHost(host);
      activeNativeTasksHost = host;
      syncGpSidebarLayout();
      return;
    }

    const root = createKanbanShell();
    host.appendChild(root);
    activeNativeTasksHost = host;
    await loadKanbanBoard(root);
    observeNativeTasksHost(host);
    syncGpSidebarLayout();
  }

  async function syncNativeTasksKanban() {
    if (nativeTasksSyncInFlight) return;

    const panel = findVisibleGoogleTasksPanel();
    if (!panel) {
      activeNativeTasksHost = null;
      restoreNativeTaskListSurfaces(document);
      if (nativeTasksResizeObserver) {
        nativeTasksResizeObserver.disconnect();
        nativeTasksResizeObserver = null;
      }
      return;
    }

    if (activeNativeTasksHost && !activeNativeTasksHost.isConnected) {
      activeNativeTasksHost = null;
    }

    const host = findTasksInjectHost(panel);
    if (!host) return;

    hideNativeTaskListSurfaces(panel, host);

    if (isNativeTasksLayoutStable(host)) {
      ensureNativeTasksNavShell(host);
      syncKanbanHostSize(host);
      activeNativeTasksHost = host;
      syncGpSidebarLayout();
      return;
    }

    nativeTasksSyncInFlight = true;
    nativeTasksObserver?.disconnect();

    try {
      await injectKanbanIntoNativeTasksPanel(host);
    } catch (error) {
      console.error('My Tasks kanban sync failed.', error);
    } finally {
      nativeTasksSyncInFlight = false;
      nativeTasksObserver?.observe(document.documentElement, nativeTasksObserverConfig);
    }
  }

  const nativeTasksObserverConfig = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'aria-hidden', 'aria-expanded', 'aria-selected', 'aria-pressed', 'aria-current'],
  };

  function scheduleNativeTasksKanbanSync() {
    window.clearTimeout(nativeTasksKanbanDebounce);
    nativeTasksKanbanDebounce = window.setTimeout(() => {
      syncNativeTasksKanban();
    }, 120);
  }

  function setupNativeTasksKanbanObserver() {
    if (nativeTasksObserver) {
      scheduleNativeTasksKanbanSync();
      return;
    }

    nativeTasksObserver = new MutationObserver((mutations) => {
      if (!shouldScheduleNativeTasksKanbanSync(mutations)) return;
      scheduleNativeTasksKanbanSync();
    });

    nativeTasksObserver.observe(document.documentElement, nativeTasksObserverConfig);

    document.addEventListener('click', (event) => {
      const control = event.target.closest('button, [role="button"], div[role="button"]');
      if (!control || !isGoogleTasksRailControl(control)) return;

      scheduleNativeTasksKanbanSync();
      window.setTimeout(scheduleNativeTasksKanbanSync, 250);
    }, true);

    scheduleNativeTasksKanbanSync();
  }

  function isNativeTasksEmbedFrame() {
    return window.location.hostname.includes('tasks.google.com') && window !== window.top;
  }

  function isCalendarTopFrame() {
    return window.location.hostname.includes('calendar.google.com') && window === window.top;
  }

  function initNativeTasksEmbedFrame() {
    if (window.__gpTasksEmbedReady) return;
    window.__gpTasksEmbedReady = true;

    const postToParent = (payload) => {
      window.parent.postMessage({
        source: MYTASKS_MESSAGE_SOURCE,
        ...payload,
      }, '*');
    };

    let lastPostedStarredFilter = null;

    const postStarredFilterState = (active) => {
      if (lastPostedStarredFilter === active) return;
      lastPostedStarredFilter = active;
      postToParent({ type: 'MYTASKS_NATIVE_STARRED', active });
    };

    const getControlLabel = (el) => {
      if (!(el instanceof Element)) return '';
      return `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.textContent || ''}`.replace(/\s+/g, ' ').trim();
    };

    const isNavControlSelected = (control) => (
      control.getAttribute('aria-selected') === 'true'
      || control.getAttribute('aria-current') === 'true'
      || control.getAttribute('aria-pressed') === 'true'
    );

    const syncEmbedNavSelection = () => {
      let starredSelected = false;
      let allTasksSelected = false;

      document.querySelectorAll('[data-mytasks-embed-nav="true"]').forEach((control) => {
        if (!isNavControlSelected(control)) return;

        const label = getControlLabel(control);
        if (isStarredNavLabel(label)) {
          starredSelected = true;
          return;
        }

        if (isAllTasksNavLabel(label)) {
          allTasksSelected = true;
        }
      });

      if (starredSelected) {
        postStarredFilterState(true);
        return;
      }

      if (allTasksSelected) {
        postStarredFilterState(false);
      }
    };

    const matchListId = (label) => {
      const matcher = KANBAN_LIST_MATCHERS.find(({ pattern }) => pattern.test(label));
      return matcher?.id || null;
    };

    const isEmbedCreateControl = (label) => (
      (/\b(create|add)\b/i.test(label) && /\b(task|list)\b/i.test(label))
      && !/\bcreate\s+new\s+list\b/i.test(label)
    );

    const hideEmbedNativeSidebar = () => {
      const hideEmbedNavElement = (el) => {
        if (!(el instanceof Element)) return;
        el.setAttribute('data-mytasks-embed-nav-hidden', 'true');
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      };

      document.querySelectorAll('[data-mytasks-embed-nav="true"]').forEach((el) => {
        hideEmbedNavElement(el);
      });

      document.querySelectorAll('button, [role="button"], a, [role="menuitem"], li, [role="listitem"]').forEach((el) => {
        if (!(el instanceof Element)) return;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.left > 280) return;

        const label = getControlLabel(el);
        if (isEmbedCreateControl(label)
          || /^\s*lists?\s*$/i.test(label)
          || isAllTasksNavLabel(label)
          || isStarredNavLabel(label)
          || /\bcreate\s+new\s+list\b/i.test(label)
          || /\bmy\s+tasks?\b/i.test(label)
          || (matchListId(label) && matchListId(label) !== 'all')) {
          hideEmbedNavElement(el);
        }
      });

      document.querySelectorAll('div, section, nav, ul, li, h1, h2, h3, h4, span').forEach((el) => {
        if (!(el instanceof Element)) return;
        if (el.getAttribute('data-mytasks-embed-nav-hidden') === 'true') return;

        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.left > 280 || rect.top > 320) return;

        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 120) return;

        if (/^\s*lists?\s*$/i.test(text)
          || isAllTasksNavLabel(text)
          || isStarredNavLabel(text)
          || /\bcreate\s+new\s+list\b/i.test(text)
          || /\bmy\s+tasks?\b/i.test(text)
          || /^\+?\s*create\s*$/i.test(text)
          || isEmbedCreateControl(text)) {
          hideEmbedNavElement(el);
        }
      });
    };

    const hideEmbedTaskPane = () => {
      document.querySelectorAll('[role="main"], main, [role="region"]').forEach((el) => {
        if (!(el instanceof Element)) return;
        if (el.closest('[data-mytasks-embed-nav]')) return;

        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        if (rect.left >= 240 && rect.width > 200) {
          el.setAttribute('data-mytasks-embed-hidden', 'true');
          el.style.setProperty('display', 'none', 'important');
        }
      });

      document.querySelectorAll('button, [role="button"], a, [role="menuitem"], li, [role="listitem"]').forEach((el) => {
        if (!(el instanceof Element)) return;
        const rect = el.getBoundingClientRect();
        if (rect.left < 260) {
          el.setAttribute('data-mytasks-embed-nav', 'true');
        }
      });

      hideEmbedNativeSidebar();
    };

    const injectEmbedNavStyles = () => {
      if (document.getElementById('gp-embed-nav-styles')) return;
      const style = document.createElement('style');
      style.id = 'gp-embed-nav-styles';
      style.textContent = `
        [data-mytasks-embed-nav-hidden="true"],
        [data-mytasks-embed-list-hidden="true"] {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          overflow: hidden !important;
          pointer-events: none !important;
        }
      `;
      document.documentElement.appendChild(style);
    };

    document.addEventListener('click', (event) => {
      const control = event.target.closest('button, [role="button"], a, [role="menuitem"], li, [role="listitem"]');
      if (!control) return;

      const label = getControlLabel(control);
      if (!label) return;

      if (/\b(create|add)\b.{0,24}\b(task|list)\b/i.test(label) || /\bcreate (a )?new (task|list)\b/i.test(label)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        postToParent({ type: 'MYTASKS_NATIVE_CREATE' });
        return;
      }

      if (isAllTasksNavLabel(label)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        postStarredFilterState(false);
        postToParent({ type: 'MYTASKS_NATIVE_LIST', listId: 'all' });
        return;
      }

      if (isStarredNavLabel(label)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        postStarredFilterState(true);
        return;
      }

      const listId = matchListId(label);
      if (listId && listId !== 'all') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }, true);

    const embedObserver = new MutationObserver(() => {
      hideEmbedTaskPane();
      hideEmbedNativeSidebar();
      syncEmbedNavSelection();
    });

    embedObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'class', 'style', 'aria-selected', 'aria-current', 'aria-pressed'],
    });

    injectEmbedNavStyles();
    hideEmbedTaskPane();
    hideEmbedNativeSidebar();
    syncEmbedNavSelection();
  }

  function initTasksAccordion(root) {
    if (!root || root.dataset.wired === 'true') return;
    root.dataset.wired = 'true';

    root.querySelectorAll('.gp-task-folder').forEach((folder) => {
      const toggle = folder.querySelector('.gp-task-folder-toggle');
      if (!toggle) return;

      toggle.addEventListener('click', () => {
        const isOpen = folder.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        syncFolderEmptyState(folder);
      });
    });
  }

  function wireSidebarEvents(panel) {
    const closeBtn = panel.querySelector('#gp-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closePanel());
    }

    const createTaskBtn = panel.querySelector('#gp-create-task-btn');
    if (createTaskBtn) {
      createTaskBtn.addEventListener('click', () => {
        createTaskBtn.blur();
        openGlobalCreateTaskModal({});
      });
    }

    initTasksAccordion(panel.querySelector('#gp-tasks-accordion'));
    initTaskStatusMenus(panel);
    initTaskCompletion(panel.querySelector('#gp-tasks-accordion'));
    syncFolderCounts(panel.querySelector('#gp-tasks-accordion'));

  }

  function mountSidebar() {
    ensureGlobalTaskModals();
    let existing = document.getElementById('gp-panel');
    if (existing && existing.querySelector('#gp-view-kanban-btn, #gp-screen-kanban')) {
      existing.remove();
      existing = null;
    }

    if (existing) {
      wireSidebarEvents(existing);
      void syncTaskViewsFromStorage();
      syncGpSidebarLayout();
      return existing;
    }

    const template = document.createElement('template');
    template.innerHTML = SIDEBAR_MARKUP;
    const panel = template.content.firstElementChild;
    if (!panel) {
      throw new Error('Sidebar markup is empty.');
    }

    const mountTarget = document.body || document.documentElement;
    mountTarget.appendChild(panel);
    wireSidebarEvents(panel);
    void syncTaskViewsFromStorage();
    setupCalendarPushObserver();
    syncGpSidebarLayout();
    return panel;
  }

  function openPanel() {
    const panel = mountSidebar();
    void syncTaskViewsFromStorage();
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    setCalendarPushed(true);
    requestAnimationFrame(() => {
      setCalendarPushed(true);
      updateGpPanelChromeMetrics();
      syncGpSidebarLayout();
    });
    syncGpSidebarLayout();
    syncRailButtonState();
    return true;
  }

  function closePanel() {
    const panel = document.getElementById('gp-panel');
    if (!panel) return false;

    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    setCalendarPushed(false);
    syncGpSidebarLayout();
    syncRailButtonState();
    return false;
  }

  function togglePanel() {
    const panel = document.getElementById('gp-panel');
    if (!panel) {
      return openPanel();
    }

    if (panel.classList.contains('open')) {
      return closePanel();
    }

    return openPanel();
  }

  async function maybeClearKanbanBoardStorageOnce() {
    const stored = await readSidebarStorage([FORCE_CLEAR_KANBAN_MARKER]);
    if (!stored[FORCE_CLEAR_KANBAN_MARKER]) return;

    await new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve();
        return;
      }

      chrome.storage.local.remove([KANBAN_STORAGE_KEY, FORCE_CLEAR_KANBAN_MARKER], () => {
        resolve();
      });
    });
  }

  async function bootstrapCalendarTasksUi() {
    primeKanbanFiltersFromLocalStorage();
    await maybeClearKanbanBoardStorageOnce();
    ensureGlobalTaskModals();
    setupNativeTasksFrameBridge();
    mountSidebar();
    setupCalendarDueFolderRefreshListeners();
    await ensurePaletteCaches();
    setupRailObserver();
    setupNativeTasksKanbanObserver();
    void syncTaskViewsFromStorage();
  }

  let gpDueFolderRefreshWired = false;

  function refreshTaskViewsIfQuiet() {
    if (!document.getElementById('gp-panel')) return;
    if (isSidebarTitleEditActive() || isMkDueEditorActive()) return;
    if (kanbanStateCache) {
      refreshLinkedTaskViews(kanbanStateCache);
    } else {
      void syncTaskViewsFromStorage();
    }
  }

  function setupCalendarDueFolderRefreshListeners() {
    if (gpDueFolderRefreshWired) return;
    gpDueFolderRefreshWired = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshTaskViewsIfQuiet();
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) refreshTaskViewsIfQuiet();
    });
    window.setInterval(refreshTaskViewsIfQuiet, 60_000);
  }

  function handleToggleRequest() {
    try {
      return togglePanel();
    } catch (error) {
      console.error('My Tasks sidebar failed to load.', error);
      return false;
    }
  }

  if (isNativeTasksEmbedFrame()) {
    initNativeTasksEmbedFrame();
    return;
  }

  if (!isCalendarTopFrame()) {
    return;
  }

  if (window.__gpTasksSidebarReady) {
    return;
  }
  window.__gpTasksSidebarReady = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PING_SIDEBAR') {
      sendResponse({ ready: true });
      return true;
    }

    if (message?.type !== 'TOGGLE_SIDEBAR') {
      return false;
    }

    sendResponse({ open: handleToggleRequest() });
    return true;
  });

  void bootstrapCalendarTasksUi();
})();
