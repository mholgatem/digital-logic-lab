// 4-to-1 multiplexer exercised through every select value.
`timescale 1ns / 1ps

module mux4 (
  input  wire [3:0] d,
  input  wire [1:0] sel,
  output wire       y
);
  assign y = d[sel];
endmodule

module mux4_tb;
  reg  [3:0] d = 4'b0000;
  reg  [1:0] sel = 2'b00;
  wire       y;
  integer    i;

  mux4 dut (.d(d), .sel(sel), .y(y));

  initial begin
    $dumpfile("mux4.vcd");
    $dumpvars(0, mux4_tb);
    for (i = 0; i < 64; i = i + 1) begin
      #10 {d, sel} = i[5:0];
    end
    #10 $finish;
  end
endmodule
