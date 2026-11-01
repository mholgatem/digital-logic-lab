// Fixture testbench: exercises bits, buses, X/Z, reals, nested scopes,
// aliased nets (ports share an id code in VCD) and ascending ranges.
`timescale 1ns / 1ps

module counter (
  input  wire       clk,
  input  wire       rst,
  output reg  [3:0] count
);
  always @(posedge clk or posedge rst)
    if (rst) count <= 4'd0;
    else     count <= count + 4'd1;
endmodule

module fixture_tb;
  reg        clk = 1'b0;
  reg        rst = 1'b1;
  wire [3:0] count;
  reg  [7:0] bus = 8'bxxxxxxxx;
  reg  [0:3] asc = 4'b0001;
  reg        tri_en = 1'b0;
  wire       tri_out;
  reg [31:0] wide = 32'h0;
  real       analog = 0.0;
  integer    i;

  assign tri_out = tri_en ? clk : 1'bz;

  counter uut (.clk(clk), .rst(rst), .count(count));

  always #5 clk = ~clk;

  initial begin
    $dumpfile("fixture.vcd");
    $dumpvars(0, fixture_tb);
    #12 rst = 1'b0;
    #8  bus = 8'h5A;
    #10 bus = 8'bzzzz_0101;
    #10 bus = 8'b1x0z_1x0z;
    #10 tri_en = 1'b1;
    for (i = 0; i < 20; i = i + 1) begin
      #7 wide = wide * 3 + 32'h1234_5677;
      analog = analog + 0.75;
      asc = {asc[1:3], asc[0]};
    end
    #10 bus = 8'hFF;
    tri_en = 1'b0;
    #1000 bus = 8'h00;
    #20 $finish;
  end
endmodule
