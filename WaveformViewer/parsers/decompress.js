// ---------------------------------------------------------------------------
// Synchronous decompressors used by the waveform parsers: DEFLATE (raw, zlib
// and gzip wrappers), LZ4 block format and FastLZ levels 1/2. Hand-written so
// the module has no third-party dependencies. They are synchronous because FST
// stores every signal's data as its own small compressed chunk, and thousands
// of async DecompressionStream round-trips would be far slower.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const WP = root.WaveParsers = root.WaveParsers || {};

  function fail(msg) {
    throw new WP.WaveParseError('Decompression failed: ' + msg);
  }

  // -------------------------------------------------------------------------
  // DEFLATE (RFC 1951)
  // -------------------------------------------------------------------------
  const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385,
    24577];
  const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  /** Canonical Huffman table: counts per length + symbols sorted by code. */
  function buildHuffman(lengths, offset, count) {
    const counts = new Uint16Array(16);
    const symbols = new Uint16Array(count);
    for (let i = 0; i < count; i++) counts[lengths[offset + i]]++;
    counts[0] = 0;
    const offs = new Uint16Array(16);
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
    for (let i = 0; i < count; i++) {
      const len = lengths[offset + i];
      if (len) symbols[offs[len]++] = i;
    }
    return { counts, symbols };
  }

  let fixedLit = null;
  let fixedDist = null;

  function getFixedTables() {
    if (!fixedLit) {
      const l = new Uint8Array(288);
      l.fill(8, 0, 144);
      l.fill(9, 144, 256);
      l.fill(7, 256, 280);
      l.fill(8, 280, 288);
      fixedLit = buildHuffman(l, 0, 288);
      const d = new Uint8Array(30).fill(5);
      fixedDist = buildHuffman(d, 0, 30);
    }
    return [fixedLit, fixedDist];
  }

  class Inflater {
    constructor(src, pos, end, sizeHint) {
      this.src = src;
      this.pos = pos;
      this.end = end;
      this.bitBuf = 0;
      this.bitCnt = 0;
      this.out = new Uint8Array(Math.max(1024, sizeHint || (end - pos) * 4));
      this.outLen = 0;
    }

    bits(n) {
      while (this.bitCnt < n) {
        if (this.pos >= this.end) fail('unexpected end of deflate stream');
        this.bitBuf |= this.src[this.pos++] << this.bitCnt;
        this.bitCnt += 8;
      }
      const v = this.bitBuf & ((1 << n) - 1);
      this.bitBuf >>>= n;
      this.bitCnt -= n;
      return v;
    }

    decodeSym(h) {
      let code = 0;
      let first = 0;
      let index = 0;
      for (let len = 1; len < 16; len++) {
        code |= this.bits(1);
        const count = h.counts[len];
        if (code - count < first) return h.symbols[index + (code - first)];
        index += count;
        first += count;
        first <<= 1;
        code <<= 1;
      }
      fail('bad huffman code');
      return 0;
    }

    grow(need) {
      if (this.outLen + need <= this.out.length) return;
      let size = this.out.length * 2;
      while (size < this.outLen + need) size *= 2;
      const next = new Uint8Array(size);
      next.set(this.out.subarray(0, this.outLen));
      this.out = next;
    }

    stored() {
      this.bitBuf = 0;
      this.bitCnt = 0;
      if (this.pos + 4 > this.end) fail('truncated stored block');
      const s = this.src;
      const len = s[this.pos] | (s[this.pos + 1] << 8);
      const nlen = s[this.pos + 2] | (s[this.pos + 3] << 8);
      if ((len ^ 0xffff) !== nlen) fail('stored block length mismatch');
      this.pos += 4;
      if (this.pos + len > this.end) fail('truncated stored block');
      this.grow(len);
      this.out.set(s.subarray(this.pos, this.pos + len), this.outLen);
      this.outLen += len;
      this.pos += len;
    }

    codes(lit, dist) {
      for (;;) {
        let sym = this.decodeSym(lit);
        if (sym < 256) {
          this.grow(1);
          this.out[this.outLen++] = sym;
        } else if (sym === 256) {
          return;
        } else {
          sym -= 257;
          if (sym >= 29) fail('bad length symbol');
          const len = LENGTH_BASE[sym] + this.bits(LENGTH_EXTRA[sym]);
          const ds = this.decodeSym(dist);
          if (ds >= 30) fail('bad distance symbol');
          const d = DIST_BASE[ds] + this.bits(DIST_EXTRA[ds]);
          if (d > this.outLen) fail('distance too far back');
          this.grow(len);
          const o = this.out;
          let from = this.outLen - d;
          for (let i = 0; i < len; i++) o[this.outLen++] = o[from++];
        }
      }
    }

    dynamic() {
      const hlit = this.bits(5) + 257;
      const hdist = this.bits(5) + 1;
      const hclen = this.bits(4) + 4;
      const clens = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) clens[CLEN_ORDER[i]] = this.bits(3);
      const clh = buildHuffman(clens, 0, 19);
      const lengths = new Uint8Array(hlit + hdist);
      let n = 0;
      while (n < hlit + hdist) {
        const sym = this.decodeSym(clh);
        if (sym < 16) {
          lengths[n++] = sym;
        } else {
          let rep;
          let val = 0;
          if (sym === 16) {
            if (n === 0) fail('repeat with no previous length');
            val = lengths[n - 1];
            rep = 3 + this.bits(2);
          } else if (sym === 17) {
            rep = 3 + this.bits(3);
          } else {
            rep = 11 + this.bits(7);
          }
          if (n + rep > hlit + hdist) fail('too many code lengths');
          while (rep--) lengths[n++] = val;
        }
      }
      this.codes(buildHuffman(lengths, 0, hlit), buildHuffman(lengths, hlit, hdist));
    }

    run() {
      let last;
      do {
        last = this.bits(1);
        const type = this.bits(2);
        if (type === 0) this.stored();
        else if (type === 1) this.codes(...getFixedTables());
        else if (type === 2) this.dynamic();
        else fail('invalid block type');
      } while (!last);
      // Discard the partial byte so `pos` points just past the stream.
      this.bitBuf = 0;
      this.bitCnt = 0;
      return this.out.subarray(0, this.outLen);
    }
  }

  /** Raw DEFLATE; returns { data, end } where `end` is the input position after the stream. */
  function inflateRawAt(src, pos = 0, end = src.length, sizeHint = 0) {
    const inf = new Inflater(src, pos, end, sizeHint);
    const data = inf.run();
    return { data, end: inf.pos };
  }

  function inflateRaw(src, sizeHint = 0) {
    return inflateRawAt(src, 0, src.length, sizeHint).data;
  }

  /** zlib-wrapped DEFLATE (RFC 1950). */
  function inflateZlib(src, sizeHint = 0) {
    if (src.length < 2) fail('zlib stream too short');
    const cmf = src[0];
    const flg = src[1];
    if ((cmf & 0x0f) !== 8 || ((cmf << 8) | flg) % 31 !== 0) fail('bad zlib header');
    if (flg & 0x20) fail('zlib preset dictionaries are not supported');
    return inflateRawAt(src, 2, src.length, sizeHint).data;
  }

  /** gzip (RFC 1952), including concatenated members. */
  function gunzip(src, sizeHint = 0) {
    const parts = [];
    let total = 0;
    let pos = 0;
    while (pos + 10 <= src.length && src[pos] === 0x1f && src[pos + 1] === 0x8b) {
      if (src[pos + 2] !== 8) fail('unknown gzip compression method');
      const flags = src[pos + 3];
      pos += 10;
      if (flags & 4) pos += 2 + (src[pos] | (src[pos + 1] << 8));
      if (flags & 8) while (pos < src.length && src[pos++] !== 0) { /* name */ }
      if (flags & 16) while (pos < src.length && src[pos++] !== 0) { /* comment */ }
      if (flags & 2) pos += 2;
      const r = inflateRawAt(src, pos, src.length, sizeHint);
      parts.push(r.data);
      total += r.data.length;
      pos = r.end + 8; // CRC32 + ISIZE
    }
    if (parts.length === 0) fail('not a gzip stream');
    if (parts.length === 1) return parts[0];
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  /** zlib or gzip, decided from the header bytes. */
  function inflateAuto(src, sizeHint = 0) {
    return isGzip(src) ? gunzip(src, sizeHint) : inflateZlib(src, sizeHint);
  }

  function isGzip(bytes) {
    return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  }

  function isBzip2(bytes) {
    return bytes.length >= 3 && bytes[0] === 0x42 && bytes[1] === 0x5a && bytes[2] === 0x68;
  }

  // -------------------------------------------------------------------------
  // LZ4 block format
  // -------------------------------------------------------------------------
  function lz4Block(src, outLen) {
    const out = new Uint8Array(outLen);
    let ip = 0;
    let op = 0;
    const n = src.length;
    while (ip < n) {
      const token = src[ip++];
      let lit = token >> 4;
      if (lit === 15) {
        let b;
        do {
          b = src[ip++];
          lit += b;
        } while (b === 255);
      }
      if (op + lit > outLen || ip + lit > n) fail('lz4 literal overrun');
      out.set(src.subarray(ip, ip + lit), op);
      ip += lit;
      op += lit;
      if (ip >= n) break;
      const offset = src[ip] | (src[ip + 1] << 8);
      ip += 2;
      if (offset === 0 || offset > op) fail('lz4 bad offset');
      let mlen = token & 15;
      if (mlen === 15) {
        let b;
        do {
          b = src[ip++];
          mlen += b;
        } while (b === 255);
      }
      mlen += 4;
      if (op + mlen > outLen) fail('lz4 match overrun');
      let from = op - offset;
      for (let i = 0; i < mlen; i++) out[op++] = out[from++];
    }
    return op === outLen ? out : out.subarray(0, op);
  }

  // -------------------------------------------------------------------------
  // FastLZ (level 1 and 2; level is stored in the first byte's top 3 bits)
  // -------------------------------------------------------------------------
  const FASTLZ_MAX_L2_DISTANCE = 8191;

  function fastlz(src, outLen) {
    if (src.length === 0) return new Uint8Array(0);
    const level = (src[0] >> 5) + 1;
    if (level !== 1 && level !== 2) fail('unknown fastlz level');
    const out = new Uint8Array(outLen);
    const n = src.length;
    let ip = 0;
    let op = 0;
    let ctrl = src[ip++] & 31;
    for (;;) {
      if (ctrl >= 32) {
        let len = (ctrl >> 5) - 1;
        const ofs = (ctrl & 31) << 8;
        let ref = op - ofs - 1;
        if (level === 1) {
          if (len === 6) len += src[ip++];
          ref -= src[ip++];
        } else {
          let code;
          if (len === 6) {
            do {
              code = src[ip++];
              len += code;
            } while (code === 255);
          }
          code = src[ip++];
          ref -= code;
          if (code === 255 && ofs === (31 << 8)) {
            const far = (src[ip] << 8) + src[ip + 1];
            ip += 2;
            ref = op - far - FASTLZ_MAX_L2_DISTANCE - 1;
          }
        }
        len += 3;
        if (ref < 0 || op + len > outLen) fail('fastlz bad match');
        for (let i = 0; i < len; i++) out[op++] = out[ref++];
      } else {
        ctrl++;
        if (op + ctrl > outLen || ip + ctrl > n) fail('fastlz literal overrun');
        out.set(src.subarray(ip, ip + ctrl), op);
        ip += ctrl;
        op += ctrl;
      }
      if (level === 1 ? ip > n - 2 : ip >= n) break;
      ctrl = src[ip++];
    }
    return op === outLen ? out : out.subarray(0, op);
  }

  WP.inflateRaw = inflateRaw;
  WP.inflateRawAt = inflateRawAt;
  WP.inflateZlib = inflateZlib;
  WP.gunzip = gunzip;
  WP.inflateAuto = inflateAuto;
  WP.isGzip = isGzip;
  WP.isBzip2 = isBzip2;
  WP.lz4Block = lz4Block;
  WP.fastlz = fastlz;
})(typeof window !== 'undefined' ? window : globalThis);
