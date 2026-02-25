extends Node

# SignalBus.gd
# Centralized signal hub for cross-node communication.

# Hardware Signals
signal hardware_data_received(power: float, speed: float, cadence: float)
signal trainer_connection_changed(connected: bool)

# Run Signals
signal run_started
signal run_ended(success: bool)
signal node_selected(node_id: String)
signal edge_completed(edge_data: Dictionary)
signal gold_changed(new_amount: int)
signal inventory_updated

# UI Signals
signal autoplay_triggered(action: String)
