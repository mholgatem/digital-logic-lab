// ---------------------------------------------------------------------------
// VZT parser, following GTKWave's vzt_read.c. VZT stores each block as bit
// planes: every bit of every facility points (via a value index) at a row of
// a dictionary, and row bit t is that bit's value at time tick t. A second
// plane, when present, turns 0/1 into 0/1/x/z. Only gzip-compressed files
// are supported; bzip2 and LZMA variants report UnsupportedFormatError.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const WP = root.WaveParsers = root.WaveParsers || {};

  const HDRID = 0x565a; // 'VZ'
  const GRANULE_SIZE = 32;
  const STATES = '01xz';

  /** VZT varint: little-endian 7-bit groups, the last byte has bit 7 set. */
  function readVztVarint(mem, pos) {
    let val = 0;
    let mul = 1;
    for (;;) {
      const c = mem[pos++];
      if (c === undefined) throw new WP.WaveParseError('Truncated VZT block.');
      val += (c & 0x7f) * mul;
      if (c & 0x80) return [val, pos];
      mul *= 128;
    }
  }

  function decompressSection(src, expected, what) {
    if (WP.isGzip(src)) return WP.gunzip(src, expected);
    const kind = src[0] === 0x7a && src[1] === 0x37 ? 'LZMA' : 'bzip2';
    throw new WP.UnsupportedFormatError(
      `This VZT file uses ${kind} compression (${what}), which is not supported yet. ` +
      'Re-create it with vcd2vzt -z 0 (gzip), or convert it to FST or VCD.');
  }

  function bitsToDouble(bits) {
    const buf = new Uint8Array(8);
    for (let j = 0; j < 64; j++) {
      if (bits[j] === '1') buf[j >> 3] |= 1 << (7 - (j & 7));
    }
    return new DataView(buf.buffer).getFloat64(0, false);
  }

  async function parseVzt(bytes, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const maybeYield = WP.createYielder(onProgress);
    const L = WP.lxt2Internals;
    const r = new WP.ByteReader(bytes);
    if (r.u16() !== HDRID) throw new WP.WaveParseError('Not a VZT file.');
    const version = r.u16();
    if (version > 1) throw new WP.UnsupportedFormatError(`VZT version ${version} is not supported.`);
    const granuleSize = r.u8();
    if (granuleSize > GRANULE_SIZE) throw new WP.WaveParseError('Bad VZT granule size.');
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

    const names = L.readFacNames(
      decompressSection(r.bytesN(zFacNameSize), facNamePredecSize, 'names'), numFacs);
    const facs = L.readGeometry(
      decompressSection(r.bytesN(zFacGeometrySize), numFacs * 16, 'geometry'), numFacs);

    // Lengths (aliases take their root's geometry), and value index offsets.
    const rootOf = (i) => {
      let guard = 0;
      while ((facs[i].flags & L.SYM_F_ALIAS) && guard++ < numFacs) i = facs[i].rows;
      return i;
    };
    for (let i = 0; i < numFacs; i++) {
      const f = facs[i];
      const j = rootOf(i);
      const rf = facs[j];
      if (!(f.flags & (L.SYM_F_INTEGER | L.SYM_F_STRING | L.SYM_F_DOUBLE))) {
        f.len = Math.abs(rf.msb - rf.lsb) + 1;
      } else {
        f.len = rf.flags & (L.SYM_F_INTEGER | L.SYM_F_STRING) ? 32 : 64;
      }
    }
    let numRealFacs = 0;
    let totalValues = 0;
    const vindexOffset = new Array(numFacs).fill(0);
    for (; numRealFacs < numFacs; numRealFacs++) {
      if (facs[numRealFacs].flags & L.SYM_F_ALIAS) break;
      vindexOffset[numRealFacs] = totalValues;
      totalValues += facs[numRealFacs].len;
    }

    const b = new WP.WaveBuilder('vzt');
    b.setTimescale(timescale);
    if (timezero) b.warn(`File has a time zero offset of ${timezero}; times are shown unshifted.`);
    const handles = L.declareFacilities(b, names, facs, L.SYM_F_ALIAS);

    const blocks = [];
    while (r.remaining >= 24) {
      const uncompressed = r.u32();
      const compressed = r.u32();
      let start = r.u64();
      let end = r.u64();
      const rle = start > end;
      if (rle) [start, end] = [end, start];
      if (!uncompressed || !compressed || !end || r.remaining <= 0) break;
      blocks.push({ pos: r.pos, uncompressed, compressed, start, end, rle });
      r.skip(Math.min(compressed, r.remaining));
    }
    if (!blocks.length) throw new WP.WaveParseError('VZT file contains no value change blocks.');

    for (let bi = 0; bi < blocks.length; bi++) {
      const blk = blocks[bi];
      const mem = decompressSection(bytes.subarray(blk.pos, blk.pos + blk.compressed),
        blk.uncompressed, 'value data');
      decodeBlock(mem, blk, facs, numRealFacs, vindexOffset, totalValues, handles, b, L);
      await maybeYield((bi + 1) / blocks.length);
    }
    onProgress(1);
    return b.finish(blocks[0].start, blocks[blocks.length - 1].end);
  }

  function decodeBlock(mem, blk, facs, numRealFacs, vindexOffset, totalValues, handles, b, L) {
    let p = 0;
    let numTicks;
    [numTicks, p] = readVztVarint(mem, p);
    let times;
    if (numTicks !== 0) {
      times = new Float64Array(numTicks);
      let t;
      [t, p] = readVztVarint(mem, p);
      times[0] = t;
      for (let i = 1; i < numTicks; i++) {
        let d;
        [d, p] = readVztVarint(mem, p);
        t += d;
        times[i] = t;
      }
    } else {
      numTicks = blk.end - blk.start + 1;
      times = new Float64Array(numTicks);
      for (let i = 0; i < numTicks; i++) times[i] = blk.start + i;
    }
    let numSections;
    let numDictEntries;
    [numSections, p] = readVztVarint(mem, p);
    [numDictEntries, p] = readVztVarint(mem, p);
    p = (p + 3) & ~3;

    const numWords = numSections * numDictEntries;
    let valDict;
    if (blk.rle) {
      valDict = new Uint32Array(numWords);
      let w = 0;
      let firstBit = 0;
      let currBit = 0;
      for (let i = 0; i < numDictEntries; i++) {
        let decBit = 0;
        let decWord = 0;
        let done = false;
        while (!done) {
          let runlen;
          [runlen, p] = readVztVarint(mem, p);
          if (!runlen) firstBit ^= 1;
          currBit ^= 1;
          if (!decWord && !decBit) currBit = firstBit;
          for (let j = 0; j < runlen; j++) {
            if (currBit) valDict[w] |= 1 << decBit;
            if (++decBit !== 32) continue;
            decBit = 0;
            w++;
            if (++decWord === numSections) {
              done = true;
              break;
            }
          }
        }
      }
    } else {
      valDict = new Uint32Array(numWords);
      const dv = new DataView(mem.buffer, mem.byteOffset + p, numWords * 4);
      for (let i = 0; i < numWords; i++) valDict[i] = dv.getUint32(i * 4, true);
      p += numWords * 4;
    }

    const numPlanes = mem[p++] + 1;
    p = (p + 3) & ~3;
    const vindex = new Uint32Array(numPlanes * totalValues);
    const vdv = new DataView(mem.buffer, mem.byteOffset + p, vindex.length * 4);
    for (let i = 0; i < vindex.length; i++) vindex[i] = vdv.getUint32(i * 4, true);
    p += vindex.length * 4;

    let numStrings;
    [numStrings, p] = readVztVarint(mem, p);
    const strings = [];
    for (let i = 0; i < numStrings; i++) {
      const s = p;
      while (mem[p] !== 0) p++;
      strings.push(WP.latin1(mem, s, p));
      p++;
    }

    const bitAt = (row, t) => (valDict[row * numSections + (t >> 5)] >>> (t & 31)) & 1;

    for (let idx = 0; idx < numRealFacs; idx++) {
      const f = facs[idx];
      const len = f.len;
      const off = vindexOffset[idx];
      const rows0 = vindex.subarray(off, off + len);
      const rows1 = numPlanes > 1 ? vindex.subarray(totalValues + off, totalValues + off + len) : null;
      let prev = null;
      for (let t = 0; t < numTicks; t++) {
        let v = '';
        for (let i = 0; i < len; i++) {
          const lo = bitAt(rows0[i], t);
          v += rows1 ? STATES[(bitAt(rows1[i], t) << 1) | lo] : (lo ? '1' : '0');
        }
        if (v === prev) continue;
        prev = v;
        let value;
        if (f.flags & L.SYM_F_DOUBLE) value = bitsToDouble(v);
        else if (f.flags & L.SYM_F_STRING) value = strings[parseInt(v, 2)] || '';
        else value = v;
        b.addChange(handles[idx], times[t], value);
      }
    }
  }

  WP.parseVzt = parseVzt;
})(typeof window !== 'undefined' ? window : globalThis);
