#!/bin/sh
# Rebuilds the bundled example waveforms from src/*.v.
# Requires iverilog and vcd2fst (GTKWave). Run from this directory.
set -e
GTKWAVE_BIN="${GTKWAVE_BIN:-/c/Users/holga/EEE120_Apps/iverilog/gtkwave/bin}"
IVERILOG_BIN="${IVERILOG_BIN:-/c/Users/holga/EEE120_Apps/iverilog/bin}"
PATH="$GTKWAVE_BIN:$IVERILOG_BIN:$PATH"

cd src
for tb in counter mux4 traffic_fsm; do
  iverilog -o "$tb.vvp" "$tb.v"
  vvp "$tb.vvp" > /dev/null
  rm -f "$tb.vvp"
done
mv counter.vcd traffic_fsm.vcd ..
vcd2fst -v mux4.vcd -f ../mux4.fst > /dev/null
rm -f mux4.vcd
echo "Examples rebuilt."
