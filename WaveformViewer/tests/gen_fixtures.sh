#!/bin/sh
# Regenerates parser test fixtures from src/fixture_tb.v.
# Requires iverilog and the GTKWave converters on PATH (or set GTKWAVE_BIN /
# IVERILOG_BIN). Run from this directory: sh gen_fixtures.sh
set -e
GTKWAVE_BIN="${GTKWAVE_BIN:-/c/Users/holga/EEE120_Apps/iverilog/gtkwave/bin}"
IVERILOG_BIN="${IVERILOG_BIN:-/c/Users/holga/EEE120_Apps/iverilog/bin}"
PATH="$GTKWAVE_BIN:$IVERILOG_BIN:$PATH"

cd src
iverilog -o fixture.vvp fixture_tb.v
vvp fixture.vvp > /dev/null
cd ..

F=fixtures
mkdir -p "$F"
cp src/fixture.vcd "$F/fixture.vcd"
gzip -c src/fixture.vcd > "$F/fixture.vcd.gz"

vcd2fst -4 -v src/fixture.vcd -f "$F/fixture_lz4.fst" > /dev/null
vcd2fst -F -v src/fixture.vcd -f "$F/fixture_fastlz.fst" > /dev/null
vcd2fst -Z -v src/fixture.vcd -f "$F/fixture_zlib.fst" > /dev/null
vcd2fst -c -v src/fixture.vcd -f "$F/fixture_wrapped.fst" > /dev/null

vcd2lxt src/fixture.vcd "$F/fixture.lxt" > /dev/null
vcd2lxt src/fixture.vcd "$F/fixture_clockpack.lxt" -clockpack > /dev/null
vcd2lxt src/fixture.vcd "$F/fixture_chgpack.lxt" -chgpack > /dev/null
vcd2lxt src/fixture.vcd "$F/fixture_dictpack.lxt" -dictpack 4 > /dev/null
vcd2lxt src/fixture.vcd "$F/fixture_linear.lxt" -chgpack -linear > /dev/null
vcd2lxt src/fixture.vcd "$F/fixture_bzip2.lxt" -linear > /dev/null

vcd2lxt2 -v src/fixture.vcd -l "$F/fixture.lxt2" > /dev/null
vcd2lxt2 -p 1 -v src/fixture.vcd -l "$F/fixture_partial.lxt2" > /dev/null
vcd2lxt2 -c 1 -v src/fixture.vcd -l "$F/fixture_nocheck.lxt2" > /dev/null

vcd2vzt -v src/fixture.vcd -l "$F/fixture.vzt" > /dev/null
vcd2vzt -t -v src/fixture.vcd -l "$F/fixture_twostate.vzt" > /dev/null
vcd2vzt -r -v src/fixture.vcd -l "$F/fixture_rle.vzt" > /dev/null
vcd2vzt -z 1 -v src/fixture.vcd -l "$F/fixture_bzip2.vzt" > /dev/null

rm -f src/fixture.vvp src/fixture.vcd
echo "Fixtures written to $F/"

# Larger stress fixture (multi-block). The VCD baseline is stored gzipped.
cd src
iverilog -o stress.vvp stress_tb.v
vvp stress.vvp > /dev/null
cd ..
gzip -c src/stress.vcd > "$F/stress.vcd.gz"
vcd2fst -4 -v src/stress.vcd -f "$F/stress_lz4.fst" > /dev/null
vcd2fst -F -v src/stress.vcd -f "$F/stress_fastlz.fst" > /dev/null
vcd2lxt src/stress.vcd "$F/stress.lxt" -clockpack -dictpack 8 > /dev/null
vcd2lxt2 -m 2 -v src/stress.vcd -l "$F/stress.lxt2" > /dev/null
vcd2vzt -m 2 -v src/stress.vcd -l "$F/stress.vzt" > /dev/null
vcd2vzt -m 2 -r -v src/stress.vcd -l "$F/stress_rle.vzt" > /dev/null
# vcd2vzt drops some x/z values when a block is written with a single bit
# plane, so the VZT stress files are checked against what GTKWave reads back.
vzt2vcd "$F/stress.vzt" 2>/dev/null | gzip -c > "$F/stress_vzt_ref.vcd.gz"
vzt2vcd "$F/stress_rle.vzt" 2>/dev/null | gzip -c > "$F/stress_rle_vzt_ref.vcd.gz"
rm -f src/stress.vvp src/stress.vcd
echo "Stress fixtures written to $F/"
