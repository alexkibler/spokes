using Godot;
using System;

namespace Spokes.Core.Hardware
{
    public partial class TrainerServiceBridge : Node
    {
        private JavaScriptObject _trainerService;
        private JavaScriptObject _heartRateService;
        private JavaScriptObject _onTrainerDataCallback;
        private JavaScriptObject _onHrDataCallback;

        /// <summary>
        /// Event for received data: Power (W), Speed (km/h), Cadence (rpm).
        /// </summary>
        public event Action<int, double, double> DataReceived;

        /// <summary>
        /// Event for received Heart Rate (bpm).
        /// </summary>
        public event Action<int> HeartRateReceived;

        // Keep-alive / Re-send logic
        private double _timeSinceLastUpdate = 0;
        private const double KeepAliveInterval = 2.0;
        private double _lastGrade = 0;
        private double _lastCrr = 0;
        private double _lastCwa = 0;
        private double _lastWeight = 0;
        private bool _paramsSet = false;

        public override void _Ready()
        {
            if (OS.GetName() != "Web")
            {
                GD.Print("TrainerServiceBridge: Not running in Web export. Mocking behavior may be needed.");
                return;
            }

            var window = JavaScriptBridge.GetInterface("window");
            if (window == null)
            {
                GD.PrintErr("TrainerServiceBridge: window object not found.");
                return;
            }

            var spokes = window.Get("spokes");
            if (spokes.IsObject())
            {
                _trainerService = spokes.Get("trainerService") as JavaScriptObject;
                _heartRateService = spokes.Get("heartRateService") as JavaScriptObject;
            }

            // Setup Trainer
            if (_trainerService != null)
            {
                _onTrainerDataCallback = JavaScriptBridge.CreateCallback(new Callable(this, MethodName.OnJsData));
                _trainerService.Call("onData", _onTrainerDataCallback);
                GD.Print("TrainerServiceBridge: Connected to window.spokes.trainerService");
            }
            else
            {
                GD.PrintErr("TrainerServiceBridge: window.spokes.trainerService not found.");
            }

            // Setup Heart Rate
            if (_heartRateService != null)
            {
                _onHrDataCallback = JavaScriptBridge.CreateCallback(new Callable(this, MethodName.OnJsHrData));
                _heartRateService.Call("onData", _onHrDataCallback);
                GD.Print("TrainerServiceBridge: Connected to window.spokes.heartRateService");
            }
        }

        public override void _Process(double delta)
        {
            // FTMS Keep-Alive: Send params every 2 seconds if no update has occurred
            if (_paramsSet)
            {
                _timeSinceLastUpdate += delta;
                if (_timeSinceLastUpdate >= KeepAliveInterval)
                {
                    // Re-send existing params to prevent trainer timeout
                    SendParamsToJs(_lastGrade, _lastCrr, _lastCwa, _lastWeight);
                }
            }
        }

        public override void _ExitTree()
        {
            // Clean up callbacks on JS side
            if (_trainerService != null)
            {
                _trainerService.Call("onData", null);
            }
            if (_heartRateService != null)
            {
                _heartRateService.Call("onData", null);
            }
        }

        private void OnJsData(Variant power, Variant speedKmh, Variant cadence)
        {
            try
            {
                int p = power.AsInt32();
                double s = speedKmh.AsDouble();
                double c = cadence.AsDouble();
                DataReceived?.Invoke(p, s, c);
            }
            catch (Exception e)
            {
                GD.PrintErr($"TrainerServiceBridge: Error parsing trainer data: {e.Message}");
            }
        }

        private void OnJsHrData(Variant bpm)
        {
            try
            {
                HeartRateReceived?.Invoke(bpm.AsInt32());
            }
            catch (Exception e)
            {
                GD.PrintErr($"TrainerServiceBridge: Error parsing HR data: {e.Message}");
            }
        }

        public void Connect()
        {
            if (_trainerService != null)
            {
                _trainerService.Call("connect");
            }
            else
            {
                 GD.Print("TrainerServiceBridge: Connect Trainer called (Mock/Editor)");
            }
        }

        public void Disconnect()
        {
            _trainerService?.Call("disconnect");
        }

        public void ConnectHeartRate()
        {
            if (_heartRateService != null)
            {
                _heartRateService.Call("connect");
            }
            else
            {
                GD.Print("TrainerServiceBridge: Connect HeartRate called (Mock/Editor)");
            }
        }

        public void DisconnectHeartRate()
        {
            _heartRateService?.Call("disconnect");
        }

        /// <summary>
        /// Sends simulation parameters to the trainer.
        /// Handles the specific FTMS scaling quirks.
        /// </summary>
        /// <param name="grade">Target grade (decimal, e.g. 0.05 for 5%)</param>
        /// <param name="crr">Rolling resistance coefficient</param>
        /// <param name="cwa">Aerodynamic drag coefficient (CdA) - RAW value (e.g. 0.416)</param>
        /// <param name="playerWeightKg">Player weight in kg</param>
        public void SetSimulationParams(double grade, double crr, double cwa, double playerWeightKg)
        {
            _lastGrade = grade;
            _lastCrr = crr;
            _lastCwa = cwa;
            _lastWeight = playerWeightKg;
            _paramsSet = true;

            SendParamsToJs(grade, crr, cwa, playerWeightKg);
        }

        private void SendParamsToJs(double grade, double crr, double cwa, double playerWeightKg)
        {
            if (_trainerService == null) return;

            // Reset keep-alive timer
            _timeSinceLastUpdate = 0;

            // QUIRK 1: Grade & Crr must be scaled by (playerWeight / 83.0)
            // because FTMS trainers assume an 83kg system mass.
            double scale = playerWeightKg / 83.0;
            double effectiveGrade = grade * scale;
            double effectiveCrr = crr * scale;

            // QUIRK 2: CWA (Wind Resistance Coefficient)
            // We pass the raw CdA profile directly.
            // The JS bridge expects this value and divides it by 0.01 before sending.

            _trainerService.Call("setSimulationParams", effectiveGrade, effectiveCrr, cwa);
        }
    }
}
