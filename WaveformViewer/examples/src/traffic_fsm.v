// Moore FSM: traffic light with a pedestrian request button.
`timescale 1ns / 1ps

module traffic_fsm (
  input  wire       clk,
  input  wire       reset,
  input  wire       ped_request,
  output reg  [1:0] state,
  output wire       red,
  output wire       yellow,
  output wire       green,
  output wire       walk
);
  localparam GREEN = 2'd0, YELLOW = 2'd1, RED = 2'd2, WALK = 2'd3;

  reg [1:0] next_state;
  reg [2:0] timer;

  always @(*) begin
    next_state = state;
    case (state)
      GREEN:  if (ped_request || timer == 3'd7) next_state = YELLOW;
      YELLOW: if (timer == 3'd2) next_state = RED;
      RED:    next_state = ped_request ? WALK : (timer == 3'd3 ? GREEN : RED);
      WALK:   if (timer == 3'd4) next_state = GREEN;
    endcase
  end

  always @(posedge clk) begin
    if (reset) begin
      state <= GREEN;
      timer <= 3'd0;
    end else begin
      timer <= (next_state != state) ? 3'd0 : timer + 3'd1;
      state <= next_state;
    end
  end

  assign green  = (state == GREEN);
  assign yellow = (state == YELLOW);
  assign red    = (state == RED) || (state == WALK);
  assign walk   = (state == WALK);
endmodule

module traffic_tb;
  reg        clk = 1'b0;
  reg        reset = 1'b1;
  reg        ped_request = 1'b0;
  wire [1:0] state;
  wire       red, yellow, green, walk;

  traffic_fsm dut (.clk(clk), .reset(reset), .ped_request(ped_request),
                   .state(state), .red(red), .yellow(yellow), .green(green),
                   .walk(walk));

  always #5 clk = ~clk;

  initial begin
    $dumpfile("traffic_fsm.vcd");
    $dumpvars(0, traffic_tb);
    #17  reset = 1'b0;
    #150 ped_request = 1'b1;
    #10  ped_request = 1'b0;
    #60  ped_request = 1'b1;
    #10  ped_request = 1'b0;
    #200 $finish;
  end
endmodule
