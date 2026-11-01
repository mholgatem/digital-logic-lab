// ---------------------------------------------------------------------------
// LXT (v1) parser, following GTKWave 3.3's lxt.c reader. Sections are found
// through a tag table at the end of the file. Value changes are either a
// per-facility backward-linked list (normal mode) or a flat record stream
// (vcd2lxt -linear). Supports gzip-packed sections (-chgpack), dictionary
// packed vectors (-dictpack) and clock repeat compression (-clockpack).
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const WP = root.WaveParsers = root.WaveParsers || {};

  const HDRID = 0x0138;
  const TRLID = 0xb4;

  const SECTION = {
    END: 0, CHG: 1, SYNC_TABLE: 2, FACNAME: 3, FACNAME_GEOMETRY: 4, TIMESCALE: 5,
    TIME_TABLE: 6, INITIAL_VALUE: 7, DOUBLE_TEST: 8, TIME_TABLE64: 9,
    ZFACNAME_PREDEC_SIZE: 10, ZFACNAME_SIZE: 11, ZFACNAME_GEOMETRY_SIZE: 12, ZSYNC_SIZE: 13,
    ZTIME_TABLE_SIZE: 14, ZCHG_PREDEC_SIZE: 15, ZCHG_SIZE: 16, ZDICTIONARY: 17,
    ZDICTIONARY_SIZE: 18, EXCLUDE_TABLE: 19, TIMEZERO: 20,
  };

  const SYM_F_INTEGER = 1 << 0;
  const SYM_F_DOUBLE = 1 << 1;
  const SYM_F_STRING = 1 << 2;
  const SYM_F_ALIAS = 1 << 3;

  const MVL = '01zxhuwl-xxxxxxx';
  const DOUBLE_TEST = 3.14159;

  function be32(b, p) {
    return ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3];
  }

  function beN(b, p, n) {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + b[p + i];
    return v;
  }

  function gunzipChecked(src, sizeHint, what) {
    if (WP.isBzip2(src)) {
      throw new WP.UnsupportedFormatError(
        `This LXT file uses bzip2 compression (${what}), which is not supported yet. ` +
        'Convert it to FST or VCD, or re-create it without bzip2.');
    }
    return WP.gunzip(src, sizeHint);
  }

  async function parseLxt(bytes, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const maybeYield = WP.createYielder(onProgress);
    const n = bytes.length;
    if (n < 6 || ((bytes[0] << 8) | bytes[1]) !== HDRID) throw new WP.WaveParseError('Not an LXT file.');
    if (bytes[n - 1] !== TRLID) {
      throw new WP.WaveParseError('LXT file is missing its trailer (the simulation may not have finished writing it).');
    }

    // ---- Section tag table (read backwards from the trailer) --------------
    const sec = {};
    let tp = n - 2;
    while (tp >= 4 && bytes[tp] !== SECTION.END) {
      sec[bytes[tp]] = be32(bytes, tp - 4);
      tp -= 5;
    }
    if (sec[SECTION.FACNAME] === undefined) throw new WP.WaveParseError('LXT file has no facility names.');

    // ---- Facilities -------------------------------------------------------
    const facOff = sec[SECTION.FACNAME];
    const numFacs = be32(bytes, facOff);
    const facMem = be32(bytes, facOff + 4);
    const nameData = sec[SECTION.ZFACNAME_SIZE] ?
      gunzipChecked(bytes.subarray(facOff + 8, facOff + 8 + sec[SECTION.ZFACNAME_SIZE]),
        sec[SECTION.ZFACNAME_PREDEC_SIZE], 'names') :
      bytes.subarray(facOff + 8, facOff + 8 + facMem * 2 + numFacs * 3);
    const L = WP.lxt2Internals;
    const names = L.readFacNames(nameData, numFacs);

    const geoOff = sec[SECTION.FACNAME_GEOMETRY];
    const geoData = sec[SECTION.ZFACNAME_GEOMETRY_SIZE] ?
      gunzipChecked(bytes.subarray(geoOff, geoOff + sec[SECTION.ZFACNAME_GEOMETRY_SIZE]),
        numFacs * 16, 'geometry') :
      bytes.subarray(geoOff, geoOff + numFacs * 16);
    const facs = L.readGeometry(geoData, numFacs);
    for (const f of facs) {
      f.len = Math.abs(f.msb - f.lsb) + 1;
      // vcd2lxt stores integers with their real range; fall back to 32 bits.
      if ((f.flags & SYM_F_INTEGER) && f.len === 1) f.len = 32;
    }

    // ---- Time table -------------------------------------------------------
    const { positions, times } = readTimeTable(bytes, sec);

    // ---- Change data address space ----------------------------------------
    // Packed change data is addressed as if it started at file offset 4.
    let chg = bytes;
    let chgBase = 0;
    let chgEnd = n;
    if (sec[SECTION.ZCHG_SIZE]) {
      const off = sec[SECTION.CHG];
      chg = gunzipChecked(bytes.subarray(off, off + sec[SECTION.ZCHG_SIZE]),
        sec[SECTION.ZCHG_PREDEC_SIZE], 'value changes');
      chgBase = 4;
      chgEnd = chg.length + 4;
    }
    const byteAt = (p) => chg[p - chgBase];

    // ---- Dictionary (dictpack) --------------------------------------------
    let dict = null;
    if (sec[SECTION.ZDICTIONARY] !== undefined) {
      const off = sec[SECTION.ZDICTIONARY];
      dict = {
        count: be32(bytes, off),
        memRequired: be32(bytes, off + 4),
        off16: be32(bytes, off + 8),
        off24: be32(bytes, off + 12),
        off32: be32(bytes, off + 16),
        width: be32(bytes, off + 20),
        strings: [],
      };
      const raw = gunzipChecked(bytes.subarray(off + 24), dict.memRequired, 'dictionary');
      let p = 0;
      for (let i = 0; i < dict.count; i++) {
        const s = p;
        while (p < raw.length && raw[p] !== 0) p++;
        dict.strings.push(WP.latin1(raw, s, p));
        p++;
      }
    }

    // ---- Doubles ----------------------------------------------------------
    let doubleLE = true;
    if (sec[SECTION.DOUBLE_TEST] !== undefined) {
      const dv = new DataView(bytes.buffer, bytes.byteOffset + sec[SECTION.DOUBLE_TEST], 8);
      doubleLE = dv.getFloat64(0, true) === DOUBLE_TEST;
    }

    const b = new WP.WaveBuilder('lxt');
    b.setTimescale(sec[SECTION.TIMESCALE] !== undefined ?
      (bytes[sec[SECTION.TIMESCALE]] << 24) >> 24 : -9);
    const handles = L.declareFacilities(b, names, facs, SYM_F_ALIAS);

    const timeOf = (pos) => {
      const i = WP.changeIndexAt(positions, pos);
      return times[Math.max(0, i)];
    };

    const ctx = { byteAt, dict, doubleLE, chg, chgBase };

    // ---- Collect each facility's records in forward order -----------------
    const records = facs.map(() => []);
    if (sec[SECTION.SYNC_TABLE] !== undefined) {
      const lastChange = readSyncTable(bytes, sec, numFacs);
      for (let i = 0; i < numFacs; i++) {
        if (facs[i].flags & SYM_F_ALIAS) continue;
        const list = records[i];
        let offs = lastChange[i];
        let guard = 0;
        while (offs && guard++ < 1e8) {
          const v = byteAt(offs);
          const dbytes = ((v >> 4) & 3) + 1;
          let delta = 0;
          for (let k = 0; k < dbytes; k++) delta = delta * 256 + byteAt(offs + 1 + k);
          const isText = facs[i].flags & (SYM_F_DOUBLE | SYM_F_STRING);
          list.push({ cmd: isText ? 0 : v & 0x0f, data: offs + dbytes + 1 + rowBytes(facs[i]),
            time: timeOf(offs) });
          offs = offs - delta - 2;
        }
        list.reverse();
      }
    } else {
      readLinearRecords(ctx, facs, numFacs, chgEnd, timeOf, records);
    }

    // ---- Decode -------------------------------------------------------------
    for (let i = 0; i < numFacs; i++) {
      if (facs[i].flags & SYM_F_ALIAS) continue;
      decodeFacility(ctx, facs[i], records[i], handles[i], b);
      if ((i & 0xff) === 0xff) await maybeYield(i / numFacs);
    }
    onProgress(1);
    return b.finish(times.length ? times[0] : 0, times.length ? times[times.length - 1] : 0);
  }

  function rowBytes(f) {
    const h = (f.flags & SYM_F_ALIAS) ? 0 : f.rows;
    if (!h) return 0;
    if (h >= 256 * 65536) return 4;
    if (h >= 65536) return 3;
    if (h >= 256) return 2;
    return 1;
  }

  function readTimeTable(bytes, sec) {
    const is64 = sec[SECTION.TIME_TABLE64] !== undefined;
    const off = is64 ? sec[SECTION.TIME_TABLE64] : sec[SECTION.TIME_TABLE];
    if (off === undefined) throw new WP.WaveParseError('LXT file has no time table.');
    const count = be32(bytes, off);
    const tsize = is64 ? 8 : 4;
    let data;
    let p;
    if (sec[SECTION.ZTIME_TABLE_SIZE]) {
      data = gunzipChecked(bytes.subarray(off + 4, off + 4 + sec[SECTION.ZTIME_TABLE_SIZE]),
        2 * tsize + count * (4 + tsize), 'time table');
      p = 0;
    } else {
      data = bytes;
      p = off + 4;
    }
    p += 2 * tsize; // first / last cycle
    const positions = new Float64Array(count);
    const times = new Float64Array(count);
    let last = 0;
    for (let i = 0; i < count; i++) {
      last += be32(data, p);
      positions[i] = last;
      p += 4;
    }
    last = 0;
    for (let i = 0; i < count; i++) {
      last += beN(data, p, tsize);
      times[i] = last;
      p += tsize;
    }
    return { positions, times };
  }

  function readSyncTable(bytes, sec, numFacs) {
    const off = sec[SECTION.SYNC_TABLE];
    const data = sec[SECTION.ZSYNC_SIZE] ?
      gunzipChecked(bytes.subarray(off, off + sec[SECTION.ZSYNC_SIZE]), numFacs * 4, 'sync table') :
      bytes.subarray(off, off + numFacs * 4);
    const out = new Float64Array(numFacs);
    for (let i = 0; i < numFacs; i++) out[i] = be32(data, i * 4);
    return out;
  }

  /** vcd2lxt -linear: records are [facidx][cmd][row][data] back to back. */
  function readLinearRecords(ctx, facs, numFacs, chgEnd, timeOf, records) {
    const { byteAt, dict } = ctx;
    let idxBytes = 1;
    if (numFacs >= 256 * 65536) idxBytes = 4;
    else if (numFacs >= 65536) idxBytes = 3;
    else if (numFacs >= 256) idxBytes = 2;
    let offs = 4;
    while (offs < chgEnd) {
      const start = offs;
      let facIdx = 0;
      for (let k = 0; k < idxBytes; k++) facIdx = facIdx * 256 + byteAt(offs + k);
      offs += idxBytes;
      if (facIdx >= numFacs) throw new WP.WaveParseError('Corrupt LXT change record.');
      const f = facs[facIdx];
      const isText = (f.flags & (SYM_F_DOUBLE | SYM_F_STRING)) !== 0;
      let cmd = 0;
      if (!isText) cmd = byteAt(offs++);
      offs += rowBytes(f);
      const data = offs;
      if (isText) {
        if (f.flags & SYM_F_DOUBLE) {
          offs += 8;
        } else {
          while (byteAt(offs)) offs++;
          offs++;
        }
      } else if (cmd === 0) {
        const modlen = f.flags & SYM_F_INTEGER ? 32 : f.len;
        offs += dict && modlen > dict.width ? dictIndexBytes(dict, data) : (modlen + 7) >> 3;
      } else if (cmd === 1) {
        offs += (f.len + 3) >> 2;
      } else if (cmd === 2) {
        offs += (f.len + 1) >> 1;
      } else if (cmd >= 0xc) {
        offs += (cmd & 3) + 1;
      }
      records[facIdx].push({ cmd, data, time: timeOf(start) });
    }
  }

  function dictIndexBytes(dict, pos) {
    if (!dict.off16 || pos < dict.off16) return 1;
    if (!dict.off24 || pos < dict.off24) return 2;
    if (!dict.off32 || pos < dict.off32) return 3;
    return 4;
  }

  /** Decodes one literal (non-clock) record into a bit string. */
  function parseBits(ctx, f, cmd, pos) {
    const { byteAt, dict } = ctx;
    const len = f.len;
    let s = '';
    switch (cmd) {
      case 0: {
        if (dict && len > dict.width) {
          const nb = dictIndexBytes(dict, pos);
          let idx = 0;
          for (let k = 0; k < nb; k++) idx = idx * 256 + byteAt(pos + k);
          const d = dict.strings[idx];
          if (d === undefined) return '0'.repeat(len);
          return '0'.repeat(Math.max(0, len - d.length - 1)) + '1' + d;
        }
        for (let j = 0; s.length < len; j++) {
          const ch = byteAt(pos + j);
          for (let k = 7; k >= 0 && s.length < len; k--) s += (ch >> k) & 1 ? '1' : '0';
        }
        return s;
      }
      case 1:
        for (let j = 0; s.length < len; j++) {
          const ch = byteAt(pos + j);
          for (let sh = 6; sh >= 0 && s.length < len; sh -= 2) s += MVL[(ch >> sh) & 3];
        }
        return s;
      case 2:
        for (let j = 0; s.length < len; j++) {
          const ch = byteAt(pos + j);
          s += MVL[(ch >> 4) & 15];
          if (s.length < len) s += MVL[ch & 15];
        }
        return s;
      default:
        return MVL[cmd - 3].repeat(len);
    }
  }

  function bitsToUint(bits) {
    let v = 0;
    for (let i = 0; i < bits.length; i++) v = ((v << 1) | (bits.charCodeAt(i) & 1)) >>> 0;
    return v;
  }

  function uintToBits(v, len) {
    let s = '';
    for (let k = len - 1; k >= 0; k--) s += k < 32 && (v >>> k) & 1 ? '1' : '0';
    return s;
  }

  function decodeFacility(ctx, f, list, handle, b) {
    const isDouble = (f.flags & SYM_F_DOUBLE) !== 0;
    const isString = (f.flags & SYM_F_STRING) !== 0;
    const emit = (t, bits) => b.addChange(handle, t, f.len === 1 ? bits[0] : bits);

    for (let r = 0; r < list.length; r++) {
      const rec = list[r];
      if (isDouble) {
        b.addChange(handle, rec.time, readDouble(ctx, rec.data));
        continue;
      }
      if (isString) {
        let s = '';
        for (let p = rec.data; ctx.byteAt(p); p++) s += String.fromCharCode(ctx.byteAt(p));
        b.addChange(handle, rec.time, s);
        continue;
      }
      if (rec.cmd < 0xc) {
        emit(rec.time, parseBits(ctx, f, rec.cmd, rec.data));
        continue;
      }

      // Clock repeat: extend the pattern of the previous literal records.
      const m1 = list[r - 1];
      const m2 = list[r - 2];
      if (!m1 || !m2) continue;
      let reps = 0;
      for (let k = 0; k <= (rec.cmd & 3); k++) reps = reps * 256 + ctx.byteAt(rec.data + k);
      reps++;
      const delta = m1.time - m2.time;
      if (f.len === 1) {
        const v1 = m1.cmd === 4 ? 1 : 0;
        for (let k = 1; k <= reps; k++) emit(m1.time + k * delta, (v1 ^ (k & 1)) ? '1' : '0');
      } else {
        const m3 = list[r - 3];
        const a = bitsToUint(parseBits(ctx, f, m1.cmd, m1.data));
        const bb = bitsToUint(parseBits(ctx, f, m2.cmd, m2.data));
        const c = m3 ? bitsToUint(parseBits(ctx, f, m3.cmd, m3.data)) : 0;
        const d0 = (bb - c) >>> 0;
        const d1 = (a - bb) >>> 0;
        for (let jx = 1; jx <= reps; jx++) {
          const half = Math.floor(jx / 2);
          const res = (a + Math.imul(half, d1) + Math.imul(half + (jx & 1), d0)) >>> 0;
          emit(m1.time + jx * delta, uintToBits(res, f.len));
        }
      }
      // Later clock records refer back to literal records only, so leave the
      // record list untouched.
    }
  }

  function readDouble(ctx, pos) {
    const buf = new Uint8Array(8);
    for (let k = 0; k < 8; k++) buf[k] = ctx.byteAt(pos + k);
    return new DataView(buf.buffer).getFloat64(0, ctx.doubleLE);
  }

  WP.parseLxt = parseLxt;
})(typeof window !== 'undefined' ? window : globalThis);
