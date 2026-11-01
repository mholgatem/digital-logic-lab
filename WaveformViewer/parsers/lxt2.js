// ---------------------------------------------------------------------------
// LXT2 parser, following GTKWave's lxt2_read.c. Blocks are either one gzip
// stream or (partial-zip mode) a list of separately deflated facility stripes.
// Each block holds granules of up to 32/64 time steps; every facility has a
// bitmask of the time steps where it changes and one value code per change.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const WP = root.WaveParsers = root.WaveParsers || {};

  const HDRID = 0x1380;
  const GRANULE_SIZE = 64;
  const GRAN_SECT_TIME = 0;
  const GRAN_SECT_DICT = 1;
  const GRAN_SECT_TIME_PARTIAL = 2;
  const PARTIAL_SIZE = 2048;

  const SYM_F_INTEGER = 1 << 0;
  const SYM_F_DOUBLE = 1 << 1;
  const SYM_F_STRING = 1 << 2;
  const SYM_F_ALIAS = 1 << 3;

  // Value change codes shared by LXT2 and VZT ("ENC" enum in lxt2_read.h).
  const ENC_0 = 0;
  const ENC_1 = 1;
  const ENC_INV = 2;
  const ENC_LSH0 = 3;
  const ENC_LSH1 = 4;
  const ENC_RSH0 = 5;
  const ENC_RSH1 = 6;
  const ENC_ADD1 = 7;
  const ENC_ADD4 = 10;
  const ENC_SUB1 = 11;
  const ENC_SUB4 = 14;
  const ENC_X = 15;
  const ENC_Z = 16;
  const ENC_BLACKOUT = 17;
  const DICT_START = 18;

  function addToBits(bits, delta) {
    if (!/^[01]+$/.test(bits)) return bits;
    const width = bits.length;
    let n = BigInt('0b' + bits) + BigInt(delta);
    const mod = 1n << BigInt(width);
    n = ((n % mod) + mod) % mod;
    return n.toString(2).padStart(width, '0');
  }

  /** Applies one value change code to the previous value of a facility. */
  function applyCode(prev, vch, len, dict, isText) {
    switch (vch) {
      case ENC_0:
      case ENC_1:
        return (vch === ENC_0 ? '0' : '1').repeat(len);
      case ENC_INV: {
        let s = '';
        for (let i = 0; i < prev.length; i++) {
          const c = prev[i];
          s += c === '0' ? '1' : c === '1' ? '0' : c;
        }
        return s;
      }
      case ENC_LSH0:
      case ENC_LSH1:
        return prev.slice(1) + (vch === ENC_LSH0 ? '0' : '1');
      case ENC_RSH0:
      case ENC_RSH1:
        return (vch === ENC_RSH0 ? '0' : '1') + prev.slice(0, len - 1);
      case ENC_X:
        return 'x'.repeat(len);
      case ENC_Z:
        return 'z'.repeat(len);
      case ENC_BLACKOUT:
        return 'x'.repeat(len);
      default:
        if (vch >= ENC_ADD1 && vch <= ENC_ADD4) return addToBits(prev, vch - ENC_ADD1 + 1);
        if (vch >= ENC_SUB1 && vch <= ENC_SUB4) return addToBits(prev, -(vch - ENC_SUB1 + 1));
        {
          const s = dict[vch - DICT_START];
          if (s === undefined) throw new WP.WaveParseError('LXT2/VZT dictionary index out of range.');
          if (isText) return s;
          if (s.length >= len) return s.slice(s.length - len);
          const fill = s[0] !== '1' ? s[0] : '0';
          return fill.repeat(len - s.length) + s;
        }
    }
  }

  /** Reads the prefix-compressed facility name table. */
  function readFacNames(data, count) {
    const names = [];
    let p = 0;
    let prev = '';
    for (let i = 0; i < count; i++) {
      const clone = (data[p] << 8) | data[p + 1];
      p += 2;
      const start = p;
      while (p < data.length && data[p] !== 0) p++;
      const name = prev.slice(0, clone) + WP.latin1(data, start, p);
      p++;
      names.push(name);
      prev = name;
    }
    return names;
  }

  /** Reads per-facility geometry: rows (alias target), msb, lsb, flags. */
  function readGeometry(data, count) {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const facs = [];
    for (let i = 0; i < count; i++) {
      const o = i * 16;
      facs.push({
        rows: dv.getUint32(o),
        msb: dv.getInt32(o + 4),
        lsb: dv.getInt32(o + 8),
        flags: dv.getUint32(o + 12),
      });
    }
    return facs;
  }

  /**
   * Declares facilities in the builder (shared by LXT2 and VZT). Returns the
   * builder handle for each facility index; aliases share their root's handle.
   */
  function declareFacilities(b, names, facs, aliasFlag) {
    const handles = new Array(facs.length);
    const rootOf = (i) => {
      let guard = 0;
      while ((facs[i].flags & aliasFlag) && guard++ < facs.length) i = facs[i].rows;
      return i;
    };
    for (let i = 0; i < facs.length; i++) {
      const f = facs[i];
      const r = rootOf(i);
      const rf = facs[r];
      const kind = rf.flags & SYM_F_DOUBLE ? 'real' : rf.flags & SYM_F_STRING ? 'string' :
        rf.len === 1 ? 'bit' : 'vector';
      const range = WP.splitRange(names[i]);
      const hasRange = range.msb !== null;
      const opts = { width: kind === 'real' || kind === 'string' ? 1 : f.len, kind };
      if (!hasRange && kind === 'vector') {
        // Integers are stored with msb = lsb = 0 but are 32 bits wide.
        const isInt = (f.flags & SYM_F_INTEGER) !== 0;
        opts.msb = isInt ? f.len - 1 : f.msb;
        opts.lsb = isInt ? 0 : f.lsb;
      }
      if (rf.flags & SYM_F_INTEGER) opts.varType = 'integer';
      else if (kind === 'real') opts.varType = 'real';
      handles[i] = b.addFlatVar(names[i], opts, 'fac' + r);
    }
    return handles;
  }

  function facLength(f) {
    if (f.flags & SYM_F_INTEGER) return 32;
    return Math.abs(f.msb - f.lsb) + 1;
  }

  async function parseLxt2(bytes, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const maybeYield = WP.createYielder(onProgress);
    const r = new WP.ByteReader(bytes);
    if (r.u16() !== HDRID) throw new WP.WaveParseError('Not an LXT2 file.');
    const version = r.u16();
    if (version > 1) throw new WP.UnsupportedFormatError(`LXT2 version ${version} is not supported.`);
    const granuleSize = r.u8();
    if (granuleSize > GRANULE_SIZE) throw new WP.WaveParseError('Bad LXT2 granule size.');
    let numFacs = r.u32();
    let timezero = 0;
    if (numFacs === 0) {
      const expansion = r.u32();
      numFacs = r.u32();
      if (expansion >= 8) {
        timezero = r.i64();
        r.skip(expansion - 8);
      } else {
        r.skip(expansion);
      }
    }
    r.u32(); // numfacbytes
    r.u32(); // longest name
    const zFacNameSize = r.u32();
    const facNamePredecSize = r.u32();
    const zFacGeometrySize = r.u32();
    const timescale = r.i8();

    const names = readFacNames(WP.gunzip(r.bytesN(zFacNameSize), facNamePredecSize), numFacs);
    const facs = readGeometry(WP.gunzip(r.bytesN(zFacGeometrySize), numFacs * 16), numFacs);
    for (const f of facs) f.len = facLength(f);
    let numRealFacs = facs.findIndex((f) => f.flags & SYM_F_ALIAS);
    if (numRealFacs < 0) numRealFacs = numFacs;

    const b = new WP.WaveBuilder('lxt2');
    b.setTimescale(timescale);
    if (timezero) b.warn(`File has a time zero offset of ${timezero}; times are shown unshifted.`);
    const handles = declareFacilities(b, names, facs, SYM_F_ALIAS);

    // Block list.
    const blocks = [];
    while (r.remaining >= 24) {
      const uncompressed = r.u32();
      const compressed = r.u32();
      const start = r.u64();
      const end = r.u64();
      if (!uncompressed || !compressed || !end || r.remaining <= 0) break;
      blocks.push({ pos: r.pos, uncompressed, compressed, start, end });
      r.skip(Math.min(compressed, r.remaining));
    }
    if (!blocks.length) throw new WP.WaveParseError('LXT2 file contains no value change blocks.');

    const values = facs.map((f) => '0'.repeat(f.len));
    const isText = facs.map((f) => (f.flags & (SYM_F_DOUBLE | SYM_F_STRING)) !== 0);
    for (let bi = 0; bi < blocks.length; bi++) {
      const mem = readBlockMemory(bytes, blocks[bi]);
      processBlock(mem, granuleSize, numRealFacs, facs, values, isText, handles, b);
      await maybeYield((bi + 1) / blocks.length);
    }
    onProgress(1);
    return b.finish(blocks[0].start, blocks[blocks.length - 1].end);
  }

  function readBlockMemory(bytes, blk) {
    const src = bytes.subarray(blk.pos, blk.pos + blk.compressed);
    if (WP.isGzip(src)) return WP.gunzip(src, blk.uncompressed);
    // Partial-zip mode: stripes of [clen][unclen][iter] + gzip member.
    const r = new WP.ByteReader(bytes, blk.pos, blk.pos + blk.compressed);
    const out = new Uint8Array(blk.uncompressed);
    let o = 0;
    for (;;) {
      const clen = r.u32();
      const unclen = r.u32();
      const iter = r.u32();
      const z = r.bytesN(clen);
      const data = WP.inflateRaw(z.subarray(10), unclen);
      out.set(data.subarray(0, Math.min(data.length, out.length - o)), o);
      o += data.length;
      if (iter === 0xffffffff) break;
    }
    return out.subarray(0, o);
  }

  function processBlock(mem, granuleSize, numRealFacs, facs, values, isText, handles, b) {
    const dv = new DataView(mem.buffer, mem.byteOffset, mem.byteLength);
    const size = mem.length;
    const numMapEntries = dv.getUint32(size - 4);
    const dictSize = dv.getUint32(size - 8);
    const numDictEntries = dv.getUint32(size - 12);
    const mapEntrySize = granuleSize === GRANULE_SIZE ? 8 : 4;
    const mapStart = size - 12 - mapEntrySize * numMapEntries;
    const dictStart = mapStart - dictSize;
    if (mem[dictStart - 1] !== GRAN_SECT_DICT) throw new WP.WaveParseError('Malformed LXT2 section.');

    const dict = [];
    let p = dictStart;
    for (let i = 0; i < numDictEntries; i++) {
      const s = p;
      while (mem[p] !== 0) p++;
      dict.push(WP.latin1(mem, s, p));
      p++;
    }

    const readN = (pos, width) => {
      let v = 0;
      for (let i = 0; i < width; i++) v = v * 256 + mem[pos + i];
      return v;
    };
    // Map masks as [hi, lo] 32-bit halves (bit k = change at time slot k).
    const readMask = (idx) => {
      const o = mapStart + idx * mapEntrySize;
      return mapEntrySize === 8 ? [dv.getUint32(o), dv.getUint32(o + 4)] : [0, dv.getUint32(o)];
    };

    p = 0;
    const timeTable = new Float64Array(GRANULE_SIZE);
    while (mem[p] === GRAN_SECT_TIME || mem[p] === GRAN_SECT_TIME_PARTIAL) {
      let strtFac = 0;
      let endFac = numRealFacs;
      if (mem[p] === GRAN_SECT_TIME_PARTIAL) {
        strtFac = dv.getUint32(p + 1);
        endFac = Math.min(strtFac + PARTIAL_SIZE, numRealFacs);
        p += 8;
      }
      p++;
      const numTimes = mem[p++];
      for (let i = 0; i < numTimes; i++) {
        timeTable[i] = dv.getUint32(p) * 4294967296 + dv.getUint32(p + 4);
        p += 8;
      }
      const mapWidth = mem[p++];
      if (!mapWidth || mapWidth > 4) throw new WP.WaveParseError('Bad LXT2 map index width.');
      const masks = new Array(endFac - strtFac);
      for (let i = strtFac; i < endFac; i++) {
        masks[i - strtFac] = readMask(readN(p, mapWidth));
        p += mapWidth;
      }
      const posWidth = mem[p++];
      if (!posWidth || posWidth > 4) throw new WP.WaveParseError('Bad LXT2 position width.');
      for (let i = strtFac; i < endFac; i++) {
        const [hi, lo] = masks[i - strtFac];
        if (!hi && !lo) continue;
        const f = facs[i];
        for (let k = 0; k < numTimes; k++) {
          const set = k < 32 ? (lo >>> k) & 1 : (hi >>> (k - 32)) & 1;
          if (!set) continue;
          const vch = readN(p, posWidth);
          p += posWidth;
          const v = applyCode(values[i], vch, f.len, dict, isText[i]);
          values[i] = v;
          emit(b, handles[i], timeTable[k], v, f, isText[i]);
        }
      }
    }
  }

  function emit(b, handle, time, v, f, isText) {
    if (isText) {
      b.addChange(handle, time, f.flags & SYM_F_DOUBLE ? parseFloat(v) : v);
    } else {
      b.addChange(handle, time, f.len === 1 ? v[0] : v);
    }
  }

  WP.parseLxt2 = parseLxt2;
  // Shared with the VZT parser, which uses the same facility tables and codes.
  WP.lxt2Internals = { readFacNames, readGeometry, declareFacilities, facLength, applyCode,
    SYM_F_INTEGER, SYM_F_DOUBLE, SYM_F_STRING, SYM_F_ALIAS };
})(typeof window !== 'undefined' ? window : globalThis);
