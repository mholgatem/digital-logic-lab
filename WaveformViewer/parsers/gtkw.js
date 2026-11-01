// ---------------------------------------------------------------------------
// GTKWave save file (.gtkw) support: parse a save file into a viewer trace
// list, resolve its signal names against a loaded waveform, and serialize the
// viewer's trace list back into GTKWave syntax.
//
// Trace list entries (shared with the viewer):
//   { type: 'signal', name, signal (index or null), alias, radix, invert, color, warning }
//     color: null or a vaporwave palette name ('orange', 'fuchsia', 'blue',
//     'purple', 'green', 'red').
//   { type: 'blank' }
//   { type: 'label', text }
//   { type: 'groupStart', name, collapsed }
//   { type: 'groupEnd', name }
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const WP = root.WaveParsers = root.WaveParsers || {};

  // TraceEntFlagBits from gtkwave's analyzer.h.
  const TR = {
    HIGHLIGHT: 0x1,
    HEX: 0x2,
    DEC: 0x4,
    BIN: 0x8,
    OCT: 0x10,
    RJUSTIFY: 0x20,
    INVERT: 0x40,
    REVERSE: 0x80,
    EXCLUDE: 0x100,
    BLANK: 0x200,
    SIGNED: 0x400,
    ASCII: 0x800,
    COLLAPSED: 0x1000,
    FTRANSLATED: 0x2000,
    PTRANSLATED: 0x4000,
    ANALOG_STEP: 0x8000,
    ANALOG_INTERPOLATED: 0x10000,
    ANALOG_BLANK_STRETCH: 0x20000,
    REAL: 0x40000,
    ANALOG_FULLSCALE: 0x80000,
    ZEROFILL: 0x100000,
    ONEFILL: 0x200000,
    CLOSED: 0x400000,
    GRP_BEGIN: 0x800000,
    GRP_END: 0x1000000,
  };

  const NUM_NAMED_MARKERS = 26;
  // GTKWave: nsperframe = zoombase^-zoom over a 200 pixel frame.
  const PIXELS_PER_FRAME = 200;

  function zoomToTimePerPx(zoom) {
    return Math.pow(2, -zoom) / PIXELS_PER_FRAME;
  }

  function timePerPxToZoom(tpp) {
    return -Math.log2(Math.max(tpp, 1e-12) * PIXELS_PER_FRAME);
  }

  // GTKWave's "[color] n" rainbow (color.h: normal, red, orange, yellow, green,
  // blue, indigo, violet) mapped to the nearest vaporwave palette color.
  // The palette has no yellow, so yellow reads as orange.
  const GTKW_COLORS = [null, 'red', 'orange', 'orange', 'green', 'blue', 'purple', 'fuchsia'];
  const GTKW_INDEX = { red: 1, orange: 2, green: 4, blue: 5, purple: 6, fuchsia: 7 };

  /** GTKWave color index for a palette color (0 = default). */
  function colorToGtkwIndex(color) {
    return GTKW_INDEX[color] || 0;
  }

  function radixFromFlags(flags) {
    if (flags & TR.SIGNED) return 'signed';
    if (flags & TR.HEX) return 'hex';
    if (flags & TR.DEC) return 'dec';
    if (flags & TR.BIN) return 'bin';
    if (flags & TR.OCT) return 'oct';
    if (flags & TR.ASCII) return 'ascii';
    return 'hex';
  }

  function flagsFromRadix(radix) {
    return { hex: TR.HEX, dec: TR.DEC, signed: TR.SIGNED, bin: TR.BIN, oct: TR.OCT,
      ascii: TR.ASCII }[radix] || TR.HEX;
  }

  /** Parses .gtkw text. Signal names stay unresolved until resolveGtkw(). */
  function parseGtkw(text) {
    const result = {
      dumpfile: null,
      timestart: null,
      zoom: null,
      marker: null,
      namedMarkers: [],
      traces: [],
      warnings: [],
    };
    const warn = (msg) => {
      if (!result.warnings.includes(msg)) result.warnings.push(msg);
    };
    let flags = TR.RJUSTIFY | TR.HEX;
    let pendingWarning = null;
    let pendingColor = null;

    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      if (!line) continue;
      const c = line[0];

      if (c === '[') {
        const m = /^\[([^\]]*)\]\s*(.*)$/.exec(line);
        if (!m) continue;
        const key = m[1];
        const val = m[2];
        if (key === 'dumpfile') {
          result.dumpfile = val.replace(/^"(.*)"$/, '$1');
        } else if (key === 'timestart') {
          result.timestart = Number(val);
        } else if (key === 'color') {
          // Like GTKWave, the color applies to the next trace only.
          const idx = parseInt(val, 10);
          pendingColor = idx > 0 && idx < GTKW_COLORS.length ? GTKW_COLORS[idx] : null;
        } else if (key === 'fpshift_count' || key === 'transaction_args') {
          pendingWarning = `[${key}] is not supported yet.`;
        }
        continue;
      }
      if (c === '*') {
        const parts = line.slice(1).trim().split(/\s+/);
        const zoom = parseFloat(parts[0]);
        if (isFinite(zoom)) result.zoom = zoom;
        const marker = Number(parts[1]);
        if (parts.length > 1 && marker >= 0) result.marker = marker;
        result.namedMarkers = parts.slice(2).map(Number).map((t) => (t >= 0 ? t : null));
        continue;
      }
      if (c === '@') {
        flags = parseInt(line.slice(1), 16) || 0;
        continue;
      }
      if (c === '>') {
        if (Number(line.slice(1)) !== 0) warn('Per-trace time shifts (">" lines) are ignored.');
        continue;
      }
      if (c === '^') {
        pendingWarning = 'Translate filters are not supported; values are shown unfiltered.';
        continue;
      }
      if (c === '!' || c === '?') continue; // pattern search / misc state

      if (c === '-') {
        // Extra rows that stretch analog traces carry no content of their own.
        if ((flags & TR.ANALOG_BLANK_STRETCH) && !(flags & (TR.GRP_BEGIN | TR.GRP_END))) continue;
        const name = line.slice(1);
        if (flags & TR.GRP_BEGIN) {
          result.traces.push({ type: 'groupStart', name, collapsed: !!(flags & TR.CLOSED) });
        } else if (flags & TR.GRP_END) {
          result.traces.push({ type: 'groupEnd', name });
        } else if (name) {
          result.traces.push({ type: 'label', text: name });
        } else {
          result.traces.push({ type: 'blank' });
        }
        pendingWarning = null;
        pendingColor = null;
        continue;
      }

      // Everything else is a signal (optionally aliased with +{alias}).
      let alias = null;
      let spec = line;
      const am = /^\+\{([^}]*)\}\s+(.*)$/.exec(line);
      if (am) {
        alias = am[1];
        spec = am[2];
      }
      const trace = {
        type: 'signal',
        name: spec,
        signal: null,
        alias,
        radix: radixFromFlags(flags),
        invert: !!(flags & TR.INVERT),
        color: pendingColor,
        warning: pendingWarning,
      };
      pendingColor = null;
      const vm = /^[#:]\{([^}]*)\}\s*(.*)$/.exec(spec);
      if (vm) {
        // A vector built from bits. Use it directly if the vector exists.
        trace.name = vm[1];
        trace.bitList = vm[2];
      } else if (/^\(\d+\)/.test(spec)) {
        trace.bitSelect = true;
      }
      result.traces.push(trace);
      pendingWarning = null;
    }
    return result;
  }

  /** Normalises a hierarchical name for matching ("a.b [3:0]" -> "a.b[3:0]"). */
  function normName(name) {
    return name.trim().replace(/\s+\[/g, '[');
  }

  /**
   * Resolves parsed signal names against `wave`, returning a new trace list.
   * Unmatched signals keep `signal: null` and get a `warning`.
   */
  function resolveGtkw(parsed, wave) {
    const exact = new Map();
    const loose = new Map();
    for (const s of wave.signals) {
      const n = normName(s.fullName);
      if (!exact.has(n)) exact.set(n, s.index);
      const base = n.replace(/\[[^\]]*\]$/, '');
      loose.set(base, loose.has(base) ? -1 : s.index);
    }
    let unmatched = 0;
    const traces = parsed.traces.map((t) => {
      if (t.type !== 'signal') return Object.assign({}, t);
      const out = Object.assign({}, t);
      if (t.bitSelect) {
        out.warning = 'Single-bit selections of a vector are not supported yet.';
        unmatched++;
        return out;
      }
      const n = normName(t.name);
      let idx = exact.has(n) ? exact.get(n) : undefined;
      if (idx === undefined) {
        const l = loose.get(n.replace(/\[[^\]]*\]$/, ''));
        if (l !== undefined && l >= 0) idx = l;
      }
      if (idx === undefined) {
        out.warning = t.bitList ?
          'Vectors assembled from individual bits are not supported yet.' :
          'Signal not found in the loaded waveform.';
        unmatched++;
      } else {
        out.signal = idx;
        const sig = wave.signals[idx];
        if (sig.width === 1 && sig.kind === 'bit') out.radix = out.radix || 'bin';
      }
      return out;
    });
    const warnings = parsed.warnings.slice();
    if (unmatched) warnings.push(`${unmatched} saved signal(s) could not be matched to this waveform.`);
    for (const t of traces) {
      if (t.warning && !warnings.includes(t.warning) && t.signal !== null) warnings.push(t.warning);
    }
    return { traces, warnings };
  }

  /**
   * Serializes the viewer state to .gtkw text.
   * state: { wave, traces, view: { t0, timePerPx }, cursor, marker }
   */
  function serializeGtkw(state) {
    const out = [];
    const wave = state.wave;
    out.push('[*]');
    out.push('[*] Digital Logic Lab Waveform Viewer');
    out.push('[*] ' + new Date().toUTCString());
    out.push('[*]');
    if (wave && wave.fileName) out.push(`[dumpfile] "${wave.fileName}"`);
    out.push(`[timestart] ${Math.round(state.view.t0)}`);
    const zoom = timePerPxToZoom(state.view.timePerPx);
    const markerTime = state.cursor === null || state.cursor === undefined ? -1 : Math.round(state.cursor);
    const named = new Array(NUM_NAMED_MARKERS).fill(-1);
    if (state.marker !== null && state.marker !== undefined) named[0] = Math.round(state.marker);
    out.push(`*${zoom.toFixed(6)} ${markerTime} ${named.join(' ')}`);

    let lastFlags = null;
    let collapsedDepth = 0;
    const emitFlags = (f) => {
      if (f !== lastFlags) {
        out.push('@' + f.toString(16));
        lastFlags = f;
      }
    };
    for (const t of state.traces) {
      const inClosed = collapsedDepth > 0 ? TR.COLLAPSED : 0;
      switch (t.type) {
        case 'blank':
          emitFlags(TR.BLANK | inClosed);
          out.push('-');
          break;
        case 'label':
          emitFlags(TR.BLANK | inClosed);
          out.push('-' + t.text);
          break;
        case 'groupStart':
          emitFlags(TR.BLANK | TR.GRP_BEGIN | (t.collapsed ? TR.CLOSED : 0) | inClosed);
          out.push('-' + t.name);
          if (t.collapsed || collapsedDepth) collapsedDepth++;
          break;
        case 'groupEnd': {
          const closing = collapsedDepth > 0;
          if (collapsedDepth) collapsedDepth--;
          emitFlags(TR.BLANK | TR.GRP_END | (closing ? TR.CLOSED | TR.COLLAPSED : 0));
          out.push('-' + t.name);
          break;
        }
        case 'signal': {
          const sig = t.signal !== null && t.signal !== undefined && wave ? wave.signals[t.signal] : null;
          let f = TR.RJUSTIFY | inClosed | (t.invert ? TR.INVERT : 0);
          if (sig && sig.kind === 'real') f |= TR.REAL;
          else if (sig && sig.kind === 'bit') f |= TR.BIN;
          else f |= flagsFromRadix(t.radix);
          emitFlags(f);
          const colorIndex = colorToGtkwIndex(t.color);
          if (colorIndex) out.push(`[color] ${colorIndex}`);
          const name = sig ? sig.fullName : t.name;
          out.push(t.alias ? `+{${t.alias}} ${name}` : name);
          break;
        }
        default:
          break;
      }
    }
    out.push('[pattern_trace] 1');
    out.push('[pattern_trace] 0');
    return out.join('\n') + '\n';
  }

  WP.TR = TR;
  WP.GTKW_COLORS = GTKW_COLORS;
  WP.colorToGtkwIndex = colorToGtkwIndex;
  WP.parseGtkw = parseGtkw;
  WP.resolveGtkw = resolveGtkw;
  WP.serializeGtkw = serializeGtkw;
  WP.zoomToTimePerPx = zoomToTimePerPx;
  WP.timePerPxToZoom = timePerPxToZoom;
})(typeof window !== 'undefined' ? window : globalThis);
