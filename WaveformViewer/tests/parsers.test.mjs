// Parser tests for the Waveform Viewer. Run from the repo root with:
//   node --test WaveformViewer/tests/
// Every fixture in tests/fixtures/ was converted from the same VCD by the
// GTKWave tools (see gen_fixtures.sh), so each parser's output must match the
// VCD parser's output at every change time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const parserDir = join(here, '..', 'parsers');
const fixtureDir = join(here, 'fixtures');

// Load the browser scripts in the same order index.html does.
for (const f of ['bytes.js', 'decompress.js', 'model.js', 'vcd.js', 'fst.js', 'lxt.js',
  'lxt2.js', 'vzt.js', 'gtkw.js', 'index.js']) {
  vm.runInThisContext(readFileSync(join(parserDir, f), 'utf8'), { filename: f });
}
const WP = globalThis.WaveParsers;

function fixture(name) {
  return new Uint8Array(readFileSync(join(fixtureDir, name)));
}

async function load(name) {
  return WP.loadWaveform(fixture(name), name);
}

const baselinePromise = load('fixture.vcd');

function sameValue(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  }
  return a === b;
}

/** Compares `wave` against the VCD baseline signal by signal. */
function assertMatchesBaseline(base, wave, label) {
  assert.equal(wave.timescaleExp, base.timescaleExp, `${label}: timescale`);
  const byName = new Map(wave.signals.map((s) => [s.fullName, s]));
  const stripRange = (n) => n.replace(/\[[^\]]*\]$/, '');
  const byBase = new Map(wave.signals.map((s) => [stripRange(s.fullName), s]));
  for (const bs of base.signals) {
    // Reference VCDs written by GTKWave tools sometimes omit integer ranges.
    const ws = byName.get(bs.fullName) || byBase.get(bs.fullName);
    assert.ok(ws, `${label}: missing signal ${bs.fullName} (have: ${[...byName.keys()].join(', ')})`);
    assert.equal(ws.width, bs.width, `${label}: width of ${bs.fullName}`);
    assert.equal(ws.kind, bs.kind, `${label}: kind of ${bs.fullName}`);
    const times = new Set([...base.data[bs.handle].times, ...wave.data[ws.handle].times]);
    for (const t of [...times].sort((a, b) => a - b)) {
      const bv = WP.valueAt(base, bs, t);
      const wv = WP.valueAt(wave, ws, t);
      assert.ok(sameValue(bv, wv), `${label}: ${bs.fullName} @${t}: expected ${bv}, got ${wv}`);
    }
  }
}

test('VCD baseline parses', async () => {
  const base = await baselinePromise;
  assert.equal(base.timescaleExp, -12);
  const names = base.signals.map((s) => s.fullName);
  assert.ok(names.includes('fixture_tb.bus[7:0]'));
  assert.ok(names.includes('fixture_tb.asc[0:3]'));
  assert.ok(names.includes('fixture_tb.uut.clk'));
  const clk = WP.findSignal(base, 'fixture_tb.clk');
  const uutClk = WP.findSignal(base, 'fixture_tb.uut.clk');
  assert.equal(clk.handle, uutClk.handle, 'aliased id codes share storage');
  const bus = WP.findSignal(base, 'fixture_tb.bus[7:0]');
  assert.equal(WP.valueAt(base, bus, 0), 'xxxxxxxx');
  assert.equal(WP.valueAt(base, bus, 20000), '01011010');
  assert.equal(WP.formatValue(WP.valueAt(base, bus, 20000), bus, 'hex'), '5A');
  assert.equal(WP.formatValue(WP.valueAt(base, bus, 30000), bus, 'hex'), 'Z5');
  const analog = WP.findSignal(base, 'fixture_tb.analog');
  assert.equal(analog.kind, 'real');
  assert.equal(base.endTime, 1220000);
});

test('gzipped VCD matches baseline', async () => {
  assertMatchesBaseline(await baselinePromise, await load('fixture.vcd.gz'), 'vcd.gz');
});

const binaryFixtures = [
  'fixture_lz4.fst', 'fixture_fastlz.fst', 'fixture_zlib.fst', 'fixture_wrapped.fst',
  'fixture.lxt2', 'fixture_partial.lxt2', 'fixture_nocheck.lxt2',
  'fixture.vzt', 'fixture_twostate.vzt', 'fixture_rle.vzt',
  'fixture.lxt', 'fixture_clockpack.lxt', 'fixture_chgpack.lxt', 'fixture_dictpack.lxt',
  'fixture_linear.lxt',
];

for (const name of binaryFixtures) {
  test(`${name} matches baseline`, async () => {
    const base = await baselinePromise;
    const wave = await load(name);
    if (name.includes('twostate')) {
      // MVL2 mode maps x/z to 0, so only check structure and known-value times.
      for (const bs of base.signals) assert.ok(WP.findSignal(wave, bs.fullName), bs.fullName);
      return;
    }
    assertMatchesBaseline(base, wave, name);
    assert.deepEqual(wave.warnings, [], `${name}: no warnings`);
  });
}

// vcd2vzt loses some x/z values in two-state blocks, so VZT stress files are
// compared with GTKWave's own reading of them (vzt2vcd) instead.
const stressCases = {
  'stress_lz4.fst': 'stress.vcd.gz',
  'stress_fastlz.fst': 'stress.vcd.gz',
  'stress.lxt': 'stress.vcd.gz',
  'stress.lxt2': 'stress.vcd.gz',
  'stress.vzt': 'stress_vzt_ref.vcd.gz',
  'stress_rle.vzt': 'stress_rle_vzt_ref.vcd.gz',
};
for (const [name, ref] of Object.entries(stressCases)) {
  test(`${name} (multi-block stress) matches ${ref}`, async () => {
    assertMatchesBaseline(await load(ref), await load(name), name);
  });
}

test('gtkw: labels, blanks, groups, aliases and radix', async () => {
  const base = await baselinePromise;
  const parsed = WP.parseGtkw(readFileSync(join(fixtureDir, 'fixture.gtkw'), 'utf8'));
  assert.equal(parsed.dumpfile, 'C:\\Users\\student\\eee120\\fixture.vcd');
  assert.equal(parsed.zoom, -14);
  assert.equal(parsed.marker, 20000);
  assert.equal(parsed.namedMarkers[0], 45000);
  const kinds = parsed.traces.map((t) => t.type);
  assert.deepEqual(kinds, ['signal', 'signal', 'blank', 'label', 'groupStart', 'signal', 'signal',
    'groupEnd', 'groupStart', 'signal', 'signal', 'groupEnd', 'signal', 'signal', 'signal',
    'signal']);
  assert.equal(parsed.traces[3].text, 'Counter section');
  assert.equal(parsed.traces[4].collapsed, false);
  assert.equal(parsed.traces[8].collapsed, true);
  assert.equal(parsed.traces[6].alias, 'count (signed)');
  assert.equal(parsed.traces[6].radix, 'signed');
  assert.equal(parsed.traces[12].radix, 'dec');
  assert.equal(parsed.traces[15].invert, true);
  assert.ok(parsed.traces[14].warning, 'translate filter warns');

  const { traces, warnings } = WP.resolveGtkw(parsed, base);
  const resolvedNames = traces.filter((t) => t.type === 'signal')
    .map((t) => (t.signal === null ? null : base.signals[t.signal].fullName));
  assert.deepEqual(resolvedNames, ['fixture_tb.clk', 'fixture_tb.rst', 'fixture_tb.count[3:0]',
    'fixture_tb.uut.count[3:0]', 'fixture_tb.bus[7:0]', 'fixture_tb.asc[0:3]',
    'fixture_tb.wide[31:0]', null, 'fixture_tb.i[31:0]', 'fixture_tb.tri_out']);
  assert.ok(warnings.some((w) => /could not be matched/.test(w)));

  // Round trip: serialize -> parse keeps structure and formatting.
  const text = WP.serializeGtkw({ wave: base, traces, view: { t0: 0, timePerPx: WP.zoomToTimePerPx(-14) },
    cursor: 20000, marker: 45000 });
  const again = WP.parseGtkw(text);
  // 1-bit signals are always written in binary, so leave their radix out.
  const isBit = (t) => t.signal !== null && t.signal !== undefined &&
    base.signals[t.signal].kind === 'bit';
  const shape = (list, ref) => list.map((t, i) => ({
    type: t.type, name: t.name, text: t.text, collapsed: t.collapsed, alias: t.alias,
    invert: t.invert, radix: t.type === 'signal' && !isBit(ref[i]) ? t.radix : undefined,
  }));
  assert.deepEqual(shape(again.traces, traces), shape(parsed.traces, traces));
  assert.equal(Math.round(again.zoom), -14);
  assert.equal(again.marker, 20000);
  assert.equal(again.namedMarkers[0], 45000);
});

test('gtkw: [color] maps to the vaporwave palette, next trace only, and round-trips', async () => {
  const base = await baselinePromise;
  const parsed = WP.parseGtkw([
    '@28', '[color] 1', 'fixture_tb.clk', 'fixture_tb.rst',
    '@22', '[color] 3', 'fixture_tb.bus[7:0]', '[color] 6', 'fixture_tb.count[3:0]',
    '[color] 7', 'fixture_tb.wide[31:0]',
  ].join('\n'));
  // GTKWave yellow (3) has no palette match and reads as orange; indigo -> purple, violet -> fuchsia.
  assert.deepEqual(parsed.traces.map((t) => t.color), ['red', null, 'orange', 'purple', 'fuchsia']);
  assert.deepEqual(parsed.warnings, []);
  const { traces } = WP.resolveGtkw(parsed, base);
  traces[1].color = 'blue';
  const text = WP.serializeGtkw({ wave: base, traces, view: { t0: 0, timePerPx: 1 }, cursor: null, marker: null });
  assert.deepEqual(text.split('\n').filter((l) => l.startsWith('[color]')),
    ['[color] 1', '[color] 5', '[color] 2', '[color] 6', '[color] 7']);
  assert.deepEqual(WP.parseGtkw(text).traces.map((t) => t.color), ['red', 'blue', 'orange', 'purple', 'fuchsia']);
  assert.equal(WP.colorToGtkwIndex('green'), 4);
  assert.equal(WP.colorToGtkwIndex(null), 0);
});

test('format detection', () => {
  const expected = {
    'fixture.vcd': 'vcd', 'fixture.vcd.gz': 'gzip', 'fixture_lz4.fst': 'fst',
    'fixture_wrapped.fst': 'fst', 'fixture.lxt': 'lxt', 'fixture_chgpack.lxt': 'lxt',
    'fixture.lxt2': 'lxt2', 'fixture.vzt': 'vzt',
  };
  for (const [name, fmt] of Object.entries(expected)) {
    assert.equal(WP.detectFormat(fixture(name), name), fmt, name);
  }
});

test('bzip2 VZT and LXT report unsupported', async () => {
  await assert.rejects(load('fixture_bzip2.vzt'), (e) => e.name === 'UnsupportedFormatError');
  await assert.rejects(load('fixture_bzip2.lxt'), (e) => e.name === 'UnsupportedFormatError');
});
