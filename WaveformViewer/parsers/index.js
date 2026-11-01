// ---------------------------------------------------------------------------
// Format detection and the single entry point the viewer calls:
//   await WaveParsers.loadWaveform(bytes, fileName, { onProgress })
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  const WP = root.WaveParsers = root.WaveParsers || {};

  const FORMAT_LABELS = {
    vcd: 'VCD',
    fst: 'FST',
    lxt: 'LXT',
    lxt2: 'LXT2',
    vzt: 'VZT',
  };

  /** Returns 'vcd' | 'fst' | 'lxt' | 'lxt2' | 'vzt' | 'gzip' | null. */
  function detectFormat(bytes, fileName = '') {
    const b = bytes;
    if (b.length >= 2) {
      if (b[0] === 0x1f && b[1] === 0x8b) return 'gzip';
      if (b[0] === 0x01 && b[1] === 0x38) return 'lxt';
      if (b[0] === 0x13 && b[1] === 0x80) return 'lxt2';
      if (b[0] === 0x56 && b[1] === 0x5a) return 'vzt';
    }
    // FST starts with a header block (type 0) or a zlib wrapper (type 254),
    // followed by a big-endian 64-bit section length.
    if (b.length >= 9 && (b[0] === 0 || b[0] === 254) && b[1] === 0 && b[2] === 0 && b[3] === 0) {
      return 'fst';
    }
    const ext = (/\.([a-z0-9]+)(?:\.gz)?$/i.exec(fileName) || [])[1];
    if (ext && FORMAT_LABELS[ext.toLowerCase()]) return ext.toLowerCase();
    const head = WP.latin1(b, 0, Math.min(b.length, 4096));
    if (/\$(date|version|timescale|scope|var|comment|enddefinitions)\b/.test(head)) return 'vcd';
    return null;
  }

  function parserFor(format) {
    return {
      vcd: WP.parseVcd,
      fst: WP.parseFst,
      lxt: WP.parseLxt,
      lxt2: WP.parseLxt2,
      vzt: WP.parseVzt,
    }[format];
  }

  async function loadWaveform(bytes, fileName = '', options = {}) {
    let format = detectFormat(bytes, fileName);
    if (format === 'gzip') {
      bytes = WP.gunzip(bytes);
      format = detectFormat(bytes, fileName.replace(/\.gz$/i, ''));
    }
    const parser = format && parserFor(format);
    if (!parser) {
      throw new WP.UnsupportedFormatError(
        `"${fileName || 'file'}" is not a recognised waveform (VCD, FST, LXT, LXT2 or VZT).`);
    }
    const wave = await parser(bytes, options);
    wave.fileName = fileName;
    wave.formatLabel = FORMAT_LABELS[format];
    return wave;
  }

  function isSaveFile(fileName) {
    return /\.(gtkw|sav)$/i.test(fileName);
  }

  WP.detectFormat = detectFormat;
  WP.loadWaveform = loadWaveform;
  WP.isSaveFile = isSaveFile;
  WP.FORMAT_LABELS = FORMAT_LABELS;
})(typeof window !== 'undefined' ? window : globalThis);
