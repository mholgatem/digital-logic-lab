// Stress fixture: long enough to span many FST/LXT2/VZT blocks, LXT clock
// repeat runs and multi-byte LXT dictionary indices.
`timescale 1ns / 1ps

module stress_tb;
  reg         clk = 1'b0;
  reg  [23:0] lfsr = 24'h1;
  reg  [63:0] wide = 64'h0123_4567_89ab_cdef;
  reg  [15:0] count = 16'd0;
  reg  [7:0]  sparse = 8'bxxxx_zzzz;
  integer     cycle;

  always #5 clk = ~clk;

  always @(posedge clk) begin
    lfsr  <= {lfsr[22:0], lfsr[23] ^ lfsr[22] ^ lfsr[21] ^ lfsr[16]};
    count <= count + 16'd1;
    wide  <= {wide[62:0], wide[63] ^ lfsr[0]};
  end

  initial begin
    $dumpfile("stress.vcd");
    $dumpvars(0, stress_tb);
    for (cycle = 0; cycle < 40; cycle = cycle + 1) begin
      #2500 sparse = cycle[7:0];
      #2500 sparse = 8'bzzzz_xxxx;
    end
    #10000 $finish;
  end
endmodule
