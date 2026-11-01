// 4-bit up counter with synchronous reset and enable.
`timescale 1ns / 1ps

module counter4 (
  input  wire       clk,
  input  wire       reset,
  input  wire       enable,
  output reg  [3:0] count,
  output wire       rollover
);
  always @(posedge clk)
    if (reset)       count <= 4'd0;
    else if (enable) count <= count + 4'd1;

  assign rollover = enable & (count == 4'hF);
endmodule

module counter_tb;
  reg        clk = 1'b0;
  reg        reset = 1'b1;
  reg        enable = 1'b0;
  wire [3:0] count;
  wire       rollover;

  counter4 dut (.clk(clk), .reset(reset), .enable(enable), .count(count),
                .rollover(rollover));

  always #5 clk = ~clk;

  initial begin
    $dumpfile("counter.vcd");
    $dumpvars(0, counter_tb);
    #22  reset = 1'b0;
    #10  enable = 1'b1;
    #120 enable = 1'b0;
    #30  enable = 1'b1;
    #100 reset = 1'b1;
    #20  reset = 1'b0;
    #60  $finish;
  end
endmodule
