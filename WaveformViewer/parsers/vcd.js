// ---------------------------------------------------------------------------
// VCD (IEEE 1364 Value Change Dump) parser. Handles the 4-state and extended
// value characters, real ('r') and string ('s') changes, aliased identifier
// codes, and $comment blocks anywhere in the file.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const WP = root.WaveParsers = root.WaveParsers || {};


  function varKind(type, width) {
    if (type === 'real' || type === 'realtime' || type === 'shortreal') return 'real';
    if (type === 'string') return 'string';
    return width === 1 ? 'bit' : 'vector';
  }

  async function parseVcd(bytes, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const maybeYield = WP.createYielder(onProgress);
    const text = new TextDecoder('utf-8').decode(bytes);
    const b = new WP.WaveBuilder('vcd');
    const re = /\S+/g;
    const handles = new Map(); // id code -> { handle, width, kind }
    let m;
    let inDefinitions = true;
    let time = 0;
    let firstTime = null;
    let count = 0;

    // Collects tokens up to the next "$end" (exclusive).
    function untilEnd() {
      const out = [];
      let t;
      while ((t = re.exec(text)) !== null) {
        if (t[0] === '$end') break;
        out.push(t[0]);
      }
      return out;
    }

    function store(id, raw) {
      const h = handles.get(id);
      if (!h) return;
      let v;
      if (h.kind === 'real') {
        v = parseFloat(raw);
        if (isNaN(v)) v = NaN;
      } else if (h.kind === 'string') {
        v = raw;
      } else if (h.kind === 'bit') {
        v = raw[raw.length - 1].toLowerCase();
      } else {
        v = WP.extendVector(raw.toLowerCase(), h.width);
      }
      b.addChange(h.handle, time, v);
    }

    while ((m = re.exec(text)) !== null) {
      const tok = m[0];
      if ((++count & 0xffff) === 0) await maybeYield(m.index / text.length);

      if (tok[0] === '$') {
        switch (tok) {
          case '$comment':
          case '$date':
          case '$version':
            untilEnd();
            break;
          case '$timescale': {
            const exp = WP.parseTimescale(untilEnd().join(' '));
            if (exp !== null) b.setTimescale(exp);
            break;
          }
          case '$scope': {
            const parts = untilEnd();
            b.pushScope(parts[1] || '', parts[0] || 'module');
            break;
          }
          case '$upscope':
            untilEnd();
            b.popScope();
            break;
          case '$var': {
            const parts = untilEnd();
            if (parts.length < 4) break;
            const type = parts[0];
            const width = parseInt(parts[1], 10) || 1;
            const id = parts[2];
            const ref = WP.splitRange(parts.slice(3).join(''));
            const kind = varKind(type, width);
            const handle = b.addVar({
              name: ref.base,
              width: kind === 'real' || kind === 'string' ? 1 : width,
              msb: ref.msb,
              lsb: ref.lsb,
              varType: type,
              kind,
            }, id);
            if (!handles.has(id)) handles.set(id, { handle, width, kind });
            break;
          }
          case '$enddefinitions':
            untilEnd();
            inDefinitions = false;
            break;
          default:
            // $dumpvars / $dumpall / $dumpon / $dumpoff / $end: the values
            // inside are ordinary value changes, so just carry on.
            break;
        }
        continue;
      }

      if (inDefinitions) continue;

      const c = tok[0];
      if (c === '#') {
        time = Number(tok.slice(1));
        if (firstTime === null) firstTime = time;
      } else if (c === 'b' || c === 'B') {
        const idTok = re.exec(text);
        if (idTok) store(idTok[0], tok.slice(1));
      } else if (c === 'r' || c === 'R' || c === 's' || c === 'S') {
        const idTok = re.exec(text);
        if (idTok) store(idTok[0], tok.slice(1));
      } else if ('01xzXZuUwWhHlL-'.includes(c)) {
        store(tok.slice(1), c);
      }
    }

    onProgress(1);
    if (handles.size === 0) {
      throw new WP.WaveParseError('No $var declarations found — is this really a VCD file?');
    }
    return b.finish(firstTime === null ? 0 : firstTime, time);
  }

  WP.parseVcd = parseVcd;
})(typeof window !== 'undefined' ? window : globalThis);
