// ---------------------------------------------------------------------------
// Byte-level helpers shared by the binary waveform parsers (FST, LXT, LXT2,
// VZT). Every parser file attaches to the global `WaveParsers` namespace so the
// module works from plain <script> tags with no build step.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const WP = root.WaveParsers = root.WaveParsers || {};

  const TWO_32 = 4294967296;

  /** Raised when a file is recognised but uses a feature we do not decode. */
  class UnsupportedFormatError extends Error {
    constructor(message) {
      super(message);
      this.name = 'UnsupportedFormatError';
    }
  }

  /** Raised when a file is truncated or otherwise malformed. */
  class WaveParseError extends Error {
    constructor(message) {
      super(message);
      this.name = 'WaveParseError';
    }
  }

  /**
   * Sequential reader over a Uint8Array. Multi-byte reads are big-endian unless
   * the method name says otherwise (all GTKWave binary formats are BE).
   */
  class ByteReader {
    constructor(bytes, offset = 0, end = bytes.length) {
      this.bytes = bytes;
      this.pos = offset;
      this.end = end;
      this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    get remaining() {
      return this.end - this.pos;
    }

    ensure(n) {
      if (this.pos + n > this.end) {
        throw new WaveParseError('Unexpected end of file (file may be truncated).');
      }
    }

    seek(pos) {
      this.pos = pos;
    }

    skip(n) {
      this.ensure(n);
      this.pos += n;
    }

    u8() {
      this.ensure(1);
      return this.bytes[this.pos++];
    }

    i8() {
      const v = this.u8();
      return v > 127 ? v - 256 : v;
    }

    u16() {
      this.ensure(2);
      const v = this.view.getUint16(this.pos);
      this.pos += 2;
      return v;
    }

    u24() {
      this.ensure(3);
      const b = this.bytes;
      const p = this.pos;
      this.pos += 3;
      return (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];
    }

    u32() {
      this.ensure(4);
      const v = this.view.getUint32(this.pos);
      this.pos += 4;
      return v;
    }

    /** 64-bit unsigned as a JS Number (exact below 2^53). */
    u64() {
      const hi = this.u32();
      const lo = this.u32();
      return hi * TWO_32 + lo;
    }

    i64() {
      this.ensure(8);
      const hi = this.view.getInt32(this.pos);
      const lo = this.view.getUint32(this.pos + 4);
      this.pos += 8;
      return hi * TWO_32 + lo;
    }

    /** Unsigned big-endian integer of `n` bytes (n <= 8). */
    uN(n) {
      let v = 0;
      for (let i = 0; i < n; i++) v = v * 256 + this.u8();
      return v;
    }

    f64() {
      this.ensure(8);
      const v = this.view.getFloat64(this.pos);
      this.pos += 8;
      return v;
    }

    f64le() {
      this.ensure(8);
      const v = this.view.getFloat64(this.pos, true);
      this.pos += 8;
      return v;
    }

    /** LEB128-style unsigned varint (FST). */
    varint() {
      let result = 0;
      let mul = 1;
      for (;;) {
        const b = this.u8();
        result += (b & 0x7f) * mul;
        if ((b & 0x80) === 0) return result;
        mul *= 128;
      }
    }

    /** LEB128-style signed varint (FST time deltas never need this, but
     * attribute values do). */
    svarint() {
      let result = 0;
      let mul = 1;
      let b;
      do {
        b = this.u8();
        result += (b & 0x7f) * mul;
        mul *= 128;
      } while (b & 0x80);
      if (b & 0x40) result -= mul;
      return result;
    }

    bytesN(n) {
      this.ensure(n);
      const out = this.bytes.subarray(this.pos, this.pos + n);
      this.pos += n;
      return out;
    }

    /** NUL-terminated string. */
    cstring() {
      const start = this.pos;
      while (this.pos < this.end && this.bytes[this.pos] !== 0) this.pos++;
      const s = latin1(this.bytes, start, this.pos);
      if (this.pos < this.end) this.pos++;
      return s;
    }
  }

  /** Decodes bytes as Latin-1 (identifier bytes are ASCII in practice). */
  function latin1(bytes, start = 0, end = bytes.length) {
    let s = '';
    const CHUNK = 8192;
    for (let i = start; i < end; i += CHUNK) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(end, i + CHUNK)));
    }
    return s;
  }

  /** Reads a varint from `bytes` at `pos`; returns [value, newPos]. */
  function readVarint(bytes, pos) {
    let result = 0;
    let mul = 1;
    for (;;) {
      const b = bytes[pos++];
      if (b === undefined) throw new WaveParseError('Unexpected end of varint data.');
      result += (b & 0x7f) * mul;
      if ((b & 0x80) === 0) return [result, pos];
      mul *= 128;
    }
  }

  /** Lets long-running parsers hand control back to the browser. */
  function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  /**
   * Returns `async (fraction) => {}` that reports progress and yields to the
   * browser at most every ~50 ms, so the page stays responsive without paying
   * a timer tick per block.
   */
  function createYielder(onProgress) {
    let last = now();
    return async (fraction) => {
      if (now() - last < 50) return;
      if (onProgress) onProgress(fraction);
      await yieldToBrowser();
      last = now();
    };
  }

  WP.UnsupportedFormatError = UnsupportedFormatError;
  WP.WaveParseError = WaveParseError;
  WP.ByteReader = ByteReader;
  WP.latin1 = latin1;
  WP.readVarint = readVarint;
  WP.yieldToBrowser = yieldToBrowser;
  WP.createYielder = createYielder;
})(typeof window !== 'undefined' ? window : globalThis);
