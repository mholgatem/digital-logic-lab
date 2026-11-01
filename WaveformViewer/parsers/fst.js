// ---------------------------------------------------------------------------
// FST (GTKWave "Fast Signal Trace") parser, following libfst's fstapi.c
// reader. Supports the whole-file zlib wrapper, zlib/LZ4/LZ4-duo hierarchy
// blocks, and VCDATA / DYN_ALIAS / DYN_ALIAS2 value change blocks packed with
// zlib, LZ4 or FastLZ.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const WP = root.WaveParsers = root.WaveParsers || {};

  const BL_HDR = 0;
  const BL_VCDATA = 1;
  const BL_BLACKOUT = 2;
  const BL_GEOM = 3;
  const BL_HIER = 4;
  const BL_VCDATA_DYN_ALIAS = 5;
  const BL_HIER_LZ4 = 6;
  const BL_HIER_LZ4DUO = 7;
  const BL_VCDATA_DYN_ALIAS2 = 8;
  const BL_ZWRAPPER = 254;
  const BL_SKIP = 255;

  const ST_GEN_ATTRBEGIN = 252;
  const ST_GEN_ATTREND = 253;
  const ST_VCD_SCOPE = 254;
  const ST_VCD_UPSCOPE = 255;

  const VAR_TYPE_NAMES = ['event', 'integer', 'parameter', 'real', 'real_parameter', 'reg',
    'supply0', 'supply1', 'time', 'tri', 'triand', 'trior', 'trireg', 'tri0', 'tri1', 'wand',
    'wire', 'wor', 'port', 'sparray', 'realtime', 'string', 'bit', 'logic', 'int', 'shortint',
    'longint', 'byte', 'enum', 'shortreal'];
  const REAL_TYPES = new Set([3, 4, 20, 29]);
  const VT_STRING = 21;
  const VT_PORT = 18;
  const VT_MAX = 29;

  const SCOPE_TYPE_NAMES = ['module', 'task', 'function', 'begin', 'fork', 'generate', 'struct',
    'union', 'class', 'interface', 'package', 'program', 'vhdl_architecture', 'vhdl_procedure',
    'vhdl_function', 'vhdl_record', 'vhdl_process', 'vhdl_block', 'vhdl_for_generate',
    'vhdl_if_generate', 'vhdl_generate', 'vhdl_package', 'sv_array'];

  const RCV_STR = 'xzhuwl-?';
  const DOUBLE_ENDTEST = 2.7182818284590452354;

  function decompressPacked(packType, src, outLen) {
    if (packType === 0x34) return WP.lz4Block(src, outLen); // '4'
    if (packType === 0x46) return WP.fastlz(src, outLen); // 'F'
    return WP.inflateZlib(src, outLen);
  }

  function zlibIfNeeded(src, uclen) {
    return src.length === uclen ? src : WP.inflateZlib(src, uclen);
  }

  async function parseFst(bytes, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const maybeYield = WP.createYielder(onProgress);
    if (bytes[0] === BL_ZWRAPPER) {
      // [type][seclen u64][uncompressed length u64][gzip data]
      bytes = WP.gunzip(bytes.subarray(17));
    }

    const r = new WP.ByteReader(bytes);
    const blocks = [];
    let header = null;
    let geom = null;
    let hier = null;

    // ---- Walk the block list --------------------------------------------
    let pos = 0;
    while (pos + 9 <= bytes.length) {
      r.seek(pos);
      const type = r.u8();
      const seclen = r.u64();
      if (type === BL_SKIP || seclen === 0) break;
      const body = pos + 9;
      if (type === BL_HDR) {
        header = readHeader(r, bytes, body);
      } else if (type === BL_GEOM) {
        geom = { body, seclen };
      } else if (type === BL_HIER || type === BL_HIER_LZ4 || type === BL_HIER_LZ4DUO) {
        hier = { type, body, seclen };
      } else if (type === BL_VCDATA || type === BL_VCDATA_DYN_ALIAS ||
        type === BL_VCDATA_DYN_ALIAS2) {
        blocks.push({ type, pos: pos + 1, seclen });
      } else if (type !== BL_BLACKOUT) {
        if (!header) throw new WP.WaveParseError('Not an FST file (missing header block).');
      }
      if (!header) throw new WP.WaveParseError('Not an FST file (missing header block).');
      pos += 1 + seclen;
    }
    if (!header) throw new WP.WaveParseError('Not an FST file.');

    const b = new WP.WaveBuilder('fst');
    b.setTimescale(header.timescale);
    if (header.timezero) {
      b.warn(`File has a time zero offset of ${header.timezero}; times are shown unshifted.`);
    }

    // ---- Signal geometry (length per handle) -----------------------------
    let signalLens = null;
    let signalReal = null;
    if (geom) {
      r.seek(geom.body);
      const uclen = r.u64();
      const maxHandle = r.u64();
      const clen = geom.seclen - 24;
      const data = zlibIfNeeded(r.bytesN(clen), uclen);
      signalLens = new Uint32Array(maxHandle);
      signalReal = new Uint8Array(maxHandle);
      let p = 0;
      for (let i = 0; i < maxHandle; i++) {
        let v;
        [v, p] = WP.readVarint(data, p);
        if (v === 0) {
          signalLens[i] = 8;
          signalReal[i] = 1;
        } else {
          signalLens[i] = v === 0xffffffff ? 0 : v;
        }
      }
    }

    // ---- Hierarchy ------------------------------------------------------
    if (!hier) throw new WP.UnsupportedFormatError('This FST file has no hierarchy block.');
    const hierData = readHierarchy(r, hier);
    const handleKinds = [];
    readHierRecords(hierData, b, handleKinds);
    if (!signalLens) {
      signalLens = new Uint32Array(handleKinds.length);
      signalReal = new Uint8Array(handleKinds.length);
      handleKinds.forEach((k, i) => {
        if (!k) return;
        signalReal[i] = k.real ? 1 : 0;
        signalLens[i] = k.real ? 8 : k.length;
      });
    }
    // Builder handles were assigned in declaration order; map FST handle -> builder handle.
    const storage = handleKinds.map((k) => (k ? k.handle : -1));
    const kinds = handleKinds.map((k) => (k ? k.kind : 'vector'));

    // ---- Value change blocks ---------------------------------------------
    for (let bi = 0; bi < blocks.length; bi++) {
      readVcBlock(bytes, blocks[bi], bi === 0, header, signalLens, signalReal, storage, kinds, b);
      await maybeYield((bi + 1) / blocks.length);
    }
    onProgress(1);
    return b.finish(header.startTime, header.endTime);
  }

  function readHeader(r, bytes, body) {
    r.seek(body);
    const startTime = r.u64();
    const endTime = r.u64();
    const dv = new DataView(bytes.buffer, bytes.byteOffset + r.pos, 8);
    const littleEndianDoubles = dv.getFloat64(0, true) === DOUBLE_ENDTEST;
    r.skip(8);
    r.u64(); // memory used by writer
    const scopeCount = r.u64();
    const varCount = r.u64();
    const maxHandle = r.u64();
    r.u64(); // vc section count
    const timescale = r.i8();
    r.skip(128 + 119); // version, date
    r.u8(); // file type
    const timezero = r.i64();
    return { startTime, endTime, littleEndianDoubles, scopeCount, varCount, maxHandle,
      timescale, timezero };
  }

  function readHierarchy(r, hier) {
    r.seek(hier.body);
    const uclen = r.u64();
    const clen = hier.seclen - 16;
    if (hier.type === BL_HIER) {
      return WP.inflateAuto(r.bytesN(clen), uclen);
    }
    const src = r.bytesN(clen);
    if (hier.type === BL_HIER_LZ4) return WP.lz4Block(src, uclen);
    const [uclen2, skip] = WP.readVarint(src, 0);
    const once = WP.lz4Block(src.subarray(skip), uclen2);
    return WP.lz4Block(once, uclen);
  }

  function readHierRecords(data, b, handleKinds) {
    const r = new WP.ByteReader(data);
    let currentHandle = 0;
    let unnamed = 0;
    while (r.remaining > 0) {
      const tag = r.u8();
      if (tag === ST_VCD_SCOPE) {
        const type = r.u8();
        let name = r.cstring();
        r.cstring(); // component
        if (!name) name = `$unnamed_scope_${unnamed++}`;
        b.pushScope(name, SCOPE_TYPE_NAMES[type] || 'module');
      } else if (tag === ST_VCD_UPSCOPE) {
        b.popScope();
      } else if (tag === ST_GEN_ATTRBEGIN) {
        r.u8();
        r.u8();
        r.cstring();
        r.varint();
      } else if (tag === ST_GEN_ATTREND) {
        // nothing
      } else if (tag <= VT_MAX) {
        r.u8(); // direction
        const rawName = r.cstring();
        let length = r.varint();
        if (tag === VT_PORT) length = (length - 2) / 3;
        const alias = r.varint();
        let fstHandle;
        if (alias === 0) fstHandle = ++currentHandle;
        else fstHandle = alias;
        const real = REAL_TYPES.has(tag);
        const kind = real ? 'real' : tag === VT_STRING ? 'string' : length === 1 ? 'bit' : 'vector';
        const ref = WP.splitRange(rawName);
        const handle = b.addVar({
          name: ref.base,
          width: real || kind === 'string' ? 1 : length,
          msb: ref.msb,
          lsb: ref.lsb,
          varType: VAR_TYPE_NAMES[tag],
          kind,
        }, fstHandle);
        if (!handleKinds[fstHandle - 1]) {
          handleKinds[fstHandle - 1] = { handle, kind, real, length };
        }
      } else {
        break;
      }
    }
  }

  function readVcBlock(bytes, block, isFirst, header, signalLens, signalReal, storage, kinds, b) {
    const r = new WP.ByteReader(bytes);
    const blkpos = block.pos; // just past the type byte
    const seclen = block.seclen;
    r.seek(blkpos + 8);
    const begTime = r.u64();
    r.u64(); // end time
    r.u64(); // memory required for traversal

    // Time table lives at the very end of the section.
    r.seek(blkpos + seclen - 24);
    const tsecUclen = r.u64();
    const tsecClen = r.u64();
    const tsecItems = r.u64();
    r.seek(blkpos + seclen - 24 - tsecClen);
    const tdata = zlibIfNeeded(r.bytesN(tsecClen), tsecUclen);
    const timeTable = new Float64Array(tsecItems);
    let tp = 0;
    let tval = 0;
    for (let i = 0; i < tsecItems; i++) {
      let d;
      [d, tp] = WP.readVarint(tdata, tp);
      tval += d;
      timeTable[i] = tval;
    }

    // Frame: every signal's value at the start of the block.
    r.seek(blkpos + 32);
    const frameUclen = r.varint();
    const frameClen = r.varint();
    const frameMaxHandle = r.varint();
    const frameSrc = r.bytesN(frameClen);
    if (isFirst) {
      const frame = zlibIfNeeded(frameSrc, frameUclen);
      let off = 0;
      for (let i = 0; i < frameMaxHandle; i++) {
        const len = signalLens[i];
        const h = storage[i];
        if (signalReal[i]) {
          if (h >= 0) b.addChange(h, begTime, readDouble(frame, off, header.littleEndianDoubles));
        } else if (len > 0 && h >= 0) {
          b.addChange(h, begTime, asciiValue(frame, off, len, kinds[i]));
        }
        off += len;
      }
    }

    const vcMaxHandle = r.varint();
    const vcStart = r.pos; // points at the pack type byte
    const packType = r.u8();

    // Chain index table.
    const indxPntr = blkpos + seclen - 24 - tsecClen - 8;
    r.seek(indxPntr);
    const chainClen = r.u64();
    const indxPos = indxPntr - chainClen;
    const chainMem = bytes.subarray(indxPos, indxPntr);
    const { table, lengths, count } = parseChainTable(chainMem,
      block.type === BL_VCDATA_DYN_ALIAS2, vcMaxHandle, indxPos - vcStart);

    const n = Math.min(count, signalLens.length);
    for (let i = 0; i < n; i++) {
      if (!table[i] || storage[i] < 0) continue;
      let p = vcStart + table[i];
      const chainEnd = p + lengths[i];
      let uncompressed;
      [uncompressed, p] = WP.readVarint(bytes, p);
      const src = bytes.subarray(p, chainEnd);
      const data = uncompressed ? decompressPacked(packType, src, uncompressed) : src;
      decodeChain(data, i, timeTable, signalLens, signalReal, header, storage[i], kinds[i], b);
    }
  }

  /** Mirrors fstReaderParseChainTable(): returns per-handle offsets/lengths. */
  function parseChainTable(mem, isAlias2, vcMaxHandle, vcLen) {
    const table = new Float64Array(vcMaxHandle + 1);
    const lengths = new Float64Array(vcMaxHandle + 1);
    const aliasOf = new Int32Array(vcMaxHandle + 1).fill(-1);
    let idx = 0;
    let pidx = 0;
    let pval = 0;
    let prevAlias = 0;
    let p = 0;
    const end = mem.length;

    function setOffset(v) {
      pval = table[idx] = pval + v;
      if (idx) lengths[pidx] = pval - table[pidx];
      pidx = idx++;
    }

    if (isAlias2) {
      while (p < end) {
        if (mem[p] & 1) {
          const sr = new WP.ByteReader(mem, p);
          const sv = sr.svarint();
          p = sr.pos;
          const shval = Math.floor(sv / 2);
          if (shval > 0) {
            setOffset(shval);
          } else if (shval < 0) {
            prevAlias = -shval - 1;
            aliasOf[idx++] = prevAlias;
          } else {
            aliasOf[idx++] = prevAlias;
          }
        } else {
          let val;
          [val, p] = WP.readVarint(mem, p);
          idx += Math.floor(val / 2);
        }
      }
    } else {
      while (p < end) {
        let val;
        [val, p] = WP.readVarint(mem, p);
        if (val === 0) {
          [val, p] = WP.readVarint(mem, p);
          aliasOf[idx++] = val - 1;
        } else if (val & 1) {
          setOffset(Math.floor(val / 2));
        } else {
          idx += Math.floor(val / 2);
        }
      }
    }
    table[idx] = vcLen;
    lengths[pidx] = table[idx] - table[pidx];
    for (let i = 0; i < idx; i++) {
      const a = aliasOf[i];
      if (a >= 0 && a < i) {
        table[i] = table[a];
        lengths[i] = lengths[a];
      }
    }
    return { table, lengths, count: idx };
  }

  function decodeChain(data, i, timeTable, signalLens, signalReal, header, handle, kind, b) {
    const len = signalLens[i];
    let p = 0;
    let ti = 0;
    const n = data.length;
    while (p < n) {
      let vli;
      [vli, p] = WP.readVarint(data, p);
      let value;
      if (len === 1) {
        let tdelta;
        if (!(vli & 1)) {
          value = ((vli >> 1) & 1) ? '1' : '0';
          tdelta = Math.floor(vli / 4);
        } else {
          value = RCV_STR[(vli >> 1) & 7];
          tdelta = Math.floor(vli / 16);
        }
        ti += tdelta;
      } else if (len === 0) {
        ti += Math.floor(vli / 2);
        let slen;
        [slen, p] = WP.readVarint(data, p);
        const s = WP.latin1(data, p, p + slen);
        p += slen;
        if (vli & 1) continue;
        value = s;
      } else if (signalReal[i]) {
        ti += Math.floor(vli / 2);
        if (vli & 1) {
          value = readDouble(data, p, header.littleEndianDoubles);
          p += 8;
        } else {
          value = NaN;
          p += 1;
        }
      } else {
        ti += Math.floor(vli / 2);
        if (!(vli & 1)) {
          let s = '';
          for (let j = 0; j < len; j++) {
            s += (data[p + (j >> 3)] >> (7 - (j & 7))) & 1 ? '1' : '0';
          }
          p += (len + 7) >> 3;
          value = kind === 'bit' ? s[s.length - 1] : s;
        } else {
          value = asciiValue(data, p, len, kind);
          p += len;
        }
      }
      if (ti >= timeTable.length) break;
      b.addChange(handle, timeTable[ti], value);
    }
  }

  function asciiValue(data, off, len, kind) {
    const s = WP.latin1(data, off, off + len).toLowerCase();
    return kind === 'bit' ? s[s.length - 1] : s;
  }

  function readDouble(data, off, littleEndian) {
    const dv = new DataView(data.buffer, data.byteOffset + off, 8);
    return dv.getFloat64(0, littleEndian);
  }

  WP.parseFst = parseFst;
})(typeof window !== 'undefined' ? window : globalThis);
