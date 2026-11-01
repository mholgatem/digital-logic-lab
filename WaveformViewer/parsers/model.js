// ---------------------------------------------------------------------------
// Common waveform model. Every parser builds one of these through WaveBuilder
// so the viewer never needs to know which file format it came from.
//
// Waveform {
//   format, timescaleExp, startTime, endTime, warnings[],
//   scope:   { name, type, path, children[], signals[] }   (root has name '')
//   signals: [{ index, name, fullName, scopePath, width, msb, lsb, varType,
//               kind: 'bit'|'vector'|'real'|'string', handle }]
//   data:    [{ times: Float64Array, values: Array }]  indexed by handle;
//            aliased signals share a handle.
// }
//
// Bit/vector values are MSB-first strings of state characters (0 1 x z and the
// VHDL extras h l u w -). Reals are numbers, strings are strings.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const WP = root.WaveParsers = root.WaveParsers || {};

  const MAX_SAFE_TIME = Number.MAX_SAFE_INTEGER;

  /** Splits "name[7:0]" / "name [7:0]" / "name[3]" into its parts. */
  function splitRange(text) {
    const m = /^(.*?)\s*\[\s*(-?\d+)\s*(?::\s*(-?\d+)\s*)?\]$/.exec(text);
    if (!m) return { base: text.trim(), msb: null, lsb: null };
    const msb = parseInt(m[2], 10);
    const lsb = m[3] === undefined ? msb : parseInt(m[3], 10);
    return { base: m[1], msb, lsb, single: m[3] === undefined };
  }

  /** Splits a hierarchical name on '.', ignoring dots inside brackets and
   * inside escaped identifiers (which run from '\' to whitespace). */
  function splitHierarchy(name, sep = '.') {
    const parts = [];
    let cur = '';
    let depth = 0;
    let escaped = false;
    for (let i = 0; i < name.length; i++) {
      const ch = name[i];
      if (escaped) {
        cur += ch;
        if (ch === ' ') escaped = false;
        continue;
      }
      if (ch === '\\' && cur === '') {
        escaped = true;
        cur += ch;
      } else if (ch === '[') {
        depth++;
        cur += ch;
      } else if (ch === ']') {
        depth--;
        cur += ch;
      } else if (ch === sep && depth === 0) {
        parts.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    parts.push(cur);
    return parts;
  }

  /** Pads a (possibly shortened) VCD-style vector value out to `width`. */
  function extendVector(value, width) {
    if (value.length >= width) {
      return value.length === width ? value : value.slice(value.length - width);
    }
    const lead = value[0];
    const fill = (lead === 'x' || lead === 'z') ? lead : '0';
    return fill.repeat(width - value.length) + value;
  }

  class WaveBuilder {
    constructor(format) {
      this.format = format;
      this.timescaleExp = -9;
      this.warnings = [];
      this.scope = { name: '', type: 'root', path: '', children: [], signals: [] };
      this.scopeStack = [this.scope];
      this.signals = [];
      this.data = [];
      this.handleKeys = new Map();
      this.sorted = [];
      this.maxTime = 0;
      this.minTime = Infinity;
      this.bigTimeWarned = false;
    }

    setTimescale(exp) {
      this.timescaleExp = exp;
    }

    warn(msg) {
      if (!this.warnings.includes(msg)) this.warnings.push(msg);
    }

    get currentScope() {
      return this.scopeStack[this.scopeStack.length - 1];
    }

    pushScope(name, type = 'module') {
      const parent = this.currentScope;
      let child = parent.children.find((c) => c.name === name);
      if (!child) {
        child = {
          name,
          type,
          path: parent.path ? parent.path + '.' + name : name,
          children: [],
          signals: [],
        };
        parent.children.push(child);
      }
      this.scopeStack.push(child);
      return child;
    }

    popScope() {
      if (this.scopeStack.length > 1) this.scopeStack.pop();
    }

    /** Makes `path` (array of scope names) current, creating scopes as needed. */
    enterPath(path) {
      this.scopeStack.length = 1;
      for (const name of path) this.pushScope(name);
    }

    /**
     * Declares a variable in the current scope. `handleKey` identifies the
     * underlying value storage; declaring the same key twice creates an alias.
     * Returns the storage handle (an integer).
     */
    addVar(opts, handleKey) {
      const width = Math.max(1, opts.width || 1);
      let kind = opts.kind;
      if (!kind) kind = width === 1 && opts.msb === null ? 'bit' : 'vector';
      if (kind === 'vector' && width === 1 && (opts.msb === null || opts.msb === undefined)) {
        kind = 'bit';
      }
      let handle;
      const key = handleKey === undefined ? Symbol('var') : handleKey;
      if (this.handleKeys.has(key)) {
        handle = this.handleKeys.get(key);
      } else {
        handle = this.data.length;
        this.data.push({ times: [], values: [] });
        this.sorted.push(true);
        this.handleKeys.set(key, handle);
      }
      const scope = this.currentScope;
      const msb = opts.msb === undefined ? null : opts.msb;
      const lsb = opts.lsb === undefined ? null : opts.lsb;
      let displayName = opts.name;
      if (msb !== null && (kind === 'vector' || kind === 'bit')) {
        displayName += msb === lsb && width === 1 ? `[${msb}]` : `[${msb}:${lsb}]`;
      }
      const sig = {
        index: this.signals.length,
        name: displayName,
        baseName: opts.name,
        fullName: scope.path ? scope.path + '.' + displayName : displayName,
        scopePath: scope.path,
        width,
        msb,
        lsb,
        varType: opts.varType || 'wire',
        kind,
        handle,
      };
      this.signals.push(sig);
      scope.signals.push(sig.index);
      return handle;
    }

    /**
     * Declares a variable from a flat hierarchical name such as
     * "top.uut.count[3:0]" (LXT/LXT2/VZT style).
     */
    addFlatVar(fullName, opts, handleKey, sep = '.') {
      const parts = splitHierarchy(fullName, sep);
      const leaf = parts.pop();
      this.enterPath(parts);
      const r = splitRange(leaf);
      const o = Object.assign({}, opts, { name: r.base });
      if (r.msb !== null && o.msb === undefined) {
        o.msb = r.msb;
        o.lsb = r.lsb;
      }
      return this.addVar(o, handleKey);
    }

    /** Records a value change. Values for the same handle at the same time
     * replace each other (last write wins, as in GTKWave). */
    addChange(handle, time, value) {
      if (time > MAX_SAFE_TIME && !this.bigTimeWarned) {
        this.bigTimeWarned = true;
        this.warn('Some times exceed 2^53 and may be shown imprecisely.');
      }
      const d = this.data[handle];
      const n = d.times.length;
      if (n > 0) {
        const lastT = d.times[n - 1];
        if (time === lastT) {
          d.values[n - 1] = value;
          return;
        }
        if (time < lastT) this.sorted[handle] = false;
      }
      d.times.push(time);
      d.values.push(value);
      if (time > this.maxTime) this.maxTime = time;
      if (time < this.minTime) this.minTime = time;
    }

    /** Sorts out-of-order handles, drops repeated values, freezes arrays. */
    finish(startTime, endTime) {
      for (let h = 0; h < this.data.length; h++) {
        let d = this.data[h];
        if (!this.sorted[h]) {
          const idx = d.times.map((_, i) => i);
          idx.sort((a, b) => d.times[a] - d.times[b] || a - b);
          const times = [];
          const values = [];
          for (const i of idx) {
            if (times.length && times[times.length - 1] === d.times[i]) {
              values[values.length - 1] = d.values[i];
            } else {
              times.push(d.times[i]);
              values.push(d.values[i]);
            }
          }
          d = { times, values };
        }
        const times = [];
        const values = [];
        for (let i = 0; i < d.times.length; i++) {
          const v = d.values[i];
          if (values.length && sameValue(values[values.length - 1], v)) continue;
          times.push(d.times[i]);
          values.push(v);
        }
        this.data[h] = { times: Float64Array.from(times), values };
      }
      const start = startTime !== undefined ? startTime : (this.minTime === Infinity ? 0 : this.minTime);
      const end = endTime !== undefined ? Math.max(endTime, start) : Math.max(this.maxTime, start);
      return {
        format: this.format,
        timescaleExp: this.timescaleExp,
        startTime: start,
        endTime: end,
        warnings: this.warnings,
        scope: this.scope,
        signals: this.signals,
        data: this.data,
      };
    }
  }

  function sameValue(a, b) {
    return a === b || (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b));
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** Index of the last change at or before `t`, or -1. */
  function changeIndexAt(times, t) {
    let lo = 0;
    let hi = times.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  /** Value of signal `sig` at time `t`, or null before its first change. */
  function valueAt(wave, sig, t) {
    const d = wave.data[sig.handle];
    const i = changeIndexAt(d.times, t);
    return i < 0 ? null : d.values[i];
  }

  /** Time of the next change strictly after `t`, or null. */
  function nextEdge(wave, sig, t) {
    const d = wave.data[sig.handle];
    const i = changeIndexAt(d.times, t) + 1;
    return i < d.times.length ? d.times[i] : null;
  }

  /** Time of the last change strictly before `t`, or null. */
  function prevEdge(wave, sig, t) {
    const d = wave.data[sig.handle];
    let i = changeIndexAt(d.times, t);
    if (i >= 0 && d.times[i] >= t) i--;
    return i >= 0 ? d.times[i] : null;
  }

  function findSignal(wave, fullName) {
    return wave.signals.find((s) => s.fullName === fullName) || null;
  }

  // -------------------------------------------------------------------------
  // Value formatting
  // -------------------------------------------------------------------------
  const RADIXES = ['hex', 'dec', 'signed', 'bin', 'oct', 'ascii'];

  function isKnown(bits) {
    return /^[01]*$/.test(bits);
  }

  /** Normalises VHDL weak states so arithmetic radixes can use them. */
  function normaliseBits(bits) {
    return bits.replace(/h/g, '1').replace(/l/g, '0');
  }

  function groupDigits(bits, size) {
    const pad = (size - (bits.length % size)) % size;
    const fill = bits[0] === 'x' || bits[0] === 'z' ? bits[0] : '0';
    const b = fill.repeat(pad) + bits;
    let out = '';
    for (let i = 0; i < b.length; i += size) {
      const g = b.slice(i, i + size);
      if (/^[01]+$/.test(g)) out += parseInt(g, 2).toString(16).toUpperCase();
      else if (/^z+$/.test(g)) out += 'Z';
      else if (/^x+$/.test(g)) out += 'X';
      else if (/[xuw-]/.test(g)) out += 'x';
      else out += 'z';
    }
    return out;
  }

  /** Formats a stored value for display in the requested radix. */
  function formatValue(value, sig, radix) {
    if (value === null || value === undefined) return '';
    if (sig.kind === 'real') return typeof value === 'number' ? formatReal(value) : String(value);
    if (sig.kind === 'string') return String(value);
    if (sig.kind === 'bit' && sig.width === 1) return value.toUpperCase();
    const bits = normaliseBits(value);
    switch (radix) {
      case 'bin':
        return value.toUpperCase();
      case 'oct':
        return groupDigits(bits, 3);
      case 'dec':
      case 'signed': {
        if (!isKnown(bits)) {
          if (/^z+$/.test(bits)) return 'Z';
          return 'X';
        }
        let n = BigInt('0b' + (bits || '0'));
        if (radix === 'signed' && bits[0] === '1') n -= 1n << BigInt(bits.length);
        return n.toString();
      }
      case 'ascii': {
        if (!isKnown(bits)) return 'X';
        let s = '';
        const pad = (8 - (bits.length % 8)) % 8;
        const b = '0'.repeat(pad) + bits;
        for (let i = 0; i < b.length; i += 8) {
          const c = parseInt(b.slice(i, i + 8), 2);
          if (c !== 0) s += c >= 32 && c < 127 ? String.fromCharCode(c) : '.';
        }
        return s;
      }
      case 'hex':
      default:
        return groupDigits(bits, 4);
    }
  }

  function formatReal(v) {
    if (!isFinite(v)) return String(v);
    if (Number.isInteger(v)) return v.toString();
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-4 || a >= 1e9)) return v.toExponential(6).replace(/\.?0+e/, 'e');
    return parseFloat(v.toPrecision(10)).toString();
  }

  // -------------------------------------------------------------------------
  // Time formatting
  // -------------------------------------------------------------------------
  const UNIT_NAMES = { 0: 's', '-3': 'ms', '-6': 'us', '-9': 'ns', '-12': 'ps', '-15': 'fs', '-18': 'as' };

  /** Parses a VCD/GTKWave timescale string like "10 ns" into an exponent. */
  function parseTimescale(text) {
    const m = /^\s*(1|10|100)?\s*(s|ms|us|ns|ps|fs|as)\s*$/i.exec(text);
    if (!m) return null;
    const mult = m[1] ? Math.log10(parseInt(m[1], 10)) : 0;
    const base = { s: 0, ms: -3, us: -6, ns: -9, ps: -12, fs: -15, as: -18 }[m[2].toLowerCase()];
    return base + mult;
  }

  /**
   * Formats `t` (in file units of 10^timescaleExp s) with the largest SI unit
   * that keeps the number >= 1, never finer than the file's own unit.
   */
  function formatTime(t, timescaleExp, digits = 6) {
    const finest = Math.floor(timescaleExp / 3) * 3;
    let unitExp = finest;
    if (t !== 0) {
      const mag = Math.floor(Math.log10(Math.abs(t))) + timescaleExp;
      unitExp = Math.min(0, Math.max(finest, Math.floor(mag / 3) * 3));
    }
    const scaled = t * Math.pow(10, timescaleExp - unitExp);
    const text = parseFloat(scaled.toPrecision(digits)).toString();
    return text + ' ' + UNIT_NAMES[unitExp];
  }

  function unitFor(exp) {
    const u = Math.floor(exp / 3) * 3;
    const mult = Math.pow(10, exp - u);
    return (mult === 1 ? '' : mult) + UNIT_NAMES[u];
  }

  WP.WaveBuilder = WaveBuilder;
  WP.splitRange = splitRange;
  WP.splitHierarchy = splitHierarchy;
  WP.extendVector = extendVector;
  WP.changeIndexAt = changeIndexAt;
  WP.valueAt = valueAt;
  WP.nextEdge = nextEdge;
  WP.prevEdge = prevEdge;
  WP.findSignal = findSignal;
  WP.formatValue = formatValue;
  WP.formatTime = formatTime;
  WP.parseTimescale = parseTimescale;
  WP.unitFor = unitFor;
  WP.RADIXES = RADIXES;
})(typeof window !== 'undefined' ? window : globalThis);
