// bridge.js - Godot C# <-> Web Bluetooth Bridge
// Implements the specific FTMS and HRM logic from the Phaser prototype.

(function() {
    window.spokes = window.spokes || {};

    // ─── UUIDs ──────────────────────────────────────────────────────────────
    const FTMS_SERVICE_UUID = '00001826-0000-1000-8000-00805f9b34fb';
    const INDOOR_BIKE_DATA_UUID = '00002ad2-0000-1000-8000-00805f9b34fb';
    const CONTROL_POINT_UUID = '00002ad9-0000-1000-8000-00805f9b34fb';

    const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
    const HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

    // ─── Op Codes ───────────────────────────────────────────────────────────
    const OP_REQUEST_CONTROL = 0x00;
    const OP_START_RESUME = 0x07;
    const OP_SET_INDOOR_BIKE_SIMULATION = 0x11;

    // ─── Flags ──────────────────────────────────────────────────────────────
    const FLAGS = {
        MORE_DATA: 0,
        AVG_SPEED: 1,
        INST_CADENCE: 2,
        AVG_CADENCE: 3,
        TOTAL_DISTANCE: 4,
        RESISTANCE_LEVEL: 5,
        INST_POWER: 6,
        AVG_POWER: 7,
        EXPENDED_ENERGY: 8,
        HEART_RATE: 9,
        METABOLIC_EQUIV: 10,
        ELAPSED_TIME: 11,
        REMAINING_TIME: 12,
    };

    class TrainerService {
        constructor() {
            this.device = null;
            this.server = null;
            this.service = null;
            this.dataChar = null;
            this.controlChar = null;
            this.connected = false;
            this.controlGranted = false;
            this.pendingParams = null;
            this.dataCallback = null;
        }

        async connect() {
            try {
                this.device = await navigator.bluetooth.requestDevice({
                    filters: [{ services: [FTMS_SERVICE_UUID] }]
                });

                this.device.addEventListener('gattserverdisconnected', this.onDisconnect.bind(this));

                this.server = await this.device.gatt.connect();
                this.service = await this.server.getPrimaryService(FTMS_SERVICE_UUID);

                // Indoor Bike Data
                this.dataChar = await this.service.getCharacteristic(INDOOR_BIKE_DATA_UUID);
                await this.dataChar.startNotifications();
                this.dataChar.addEventListener('characteristicvaluechanged', this.handleData.bind(this));

                // Control Point
                try {
                    this.controlChar = await this.service.getCharacteristic(CONTROL_POINT_UUID);
                    await this.controlChar.startNotifications();
                    this.controlChar.addEventListener('characteristicvaluechanged', this.handleControlResponse.bind(this));

                    // Request Control
                    const buf = new Uint8Array([OP_REQUEST_CONTROL]);
                    await this.controlChar.writeValue(buf);
                    this.connected = true;
                } catch (e) {
                    console.warn('[Bridge] Control Point unavailable:', e);
                    this.connected = true; // Still connected for data
                }

            } catch (e) {
                console.error('[Bridge] Trainer Connection failed:', e);
                this.connected = false;
                throw e;
            }
        }

        disconnect() {
            if (this.device && this.device.gatt.connected) {
                this.device.gatt.disconnect();
            }
            this.connected = false;
            this.controlGranted = false;
        }

        onData(callback) {
            this.dataCallback = callback;
        }

        handleData(event) {
            const data = event.target.value;
            const flags = data.getUint16(0, true);
            let offset = 2;

            const result = {
                timestamp: Date.now()
            };

            // Speed (if MORE_DATA bit 0 is 0)
            if (!(flags & (1 << FLAGS.MORE_DATA))) {
                result.instantaneousSpeed = data.getUint16(offset, true) / 100;
                offset += 2;
            }

            // Avg Speed
            if (flags & (1 << FLAGS.AVG_SPEED)) offset += 2;

            // Cadence
            if (flags & (1 << FLAGS.INST_CADENCE)) {
                result.instantaneousCadence = data.getUint16(offset, true) / 2;
                offset += 2;
            }

            // Avg Cadence
            if (flags & (1 << FLAGS.AVG_CADENCE)) offset += 2;

            // Total Distance
            if (flags & (1 << FLAGS.TOTAL_DISTANCE)) offset += 3;

            // Resistance Level
            if (flags & (1 << FLAGS.RESISTANCE_LEVEL)) offset += 2;

            // Power
            if (flags & (1 << FLAGS.INST_POWER)) {
                result.instantaneousPower = data.getInt16(offset, true);
                offset += 2;
            }

            if (this.dataCallback) {
                // Godot callbacks receive values as arguments.
                // We pass a JSON string to simplify parsing on C# side, or separate args.
                // Let's pass a JS object, Godot handles it.
                this.dataCallback(
                    result.instantaneousPower || 0,
                    result.instantaneousSpeed || 0,
                    result.instantaneousCadence || 0
                );
            }
        }

        handleControlResponse(event) {
            const data = event.target.value;
            if (data.byteLength < 3 || data.getUint8(0) !== 0x80) return;

            const opCode = data.getUint8(1);
            const result = data.getUint8(2);

            if (opCode === OP_REQUEST_CONTROL && result === 0x01) {
                console.log('[Bridge] Control granted.');
                this.controlGranted = true;
                // Start/Resume
                const startBuf = new Uint8Array([OP_START_RESUME]);
                this.controlChar.writeValue(startBuf).catch(e => console.error(e));
            } else if (opCode === OP_START_RESUME && result === 0x01) {
                console.log('[Bridge] Session started.');
                if (this.pendingParams) {
                    const { grade, crr, cwa } = this.pendingParams;
                    this.setSimulationParams(grade, crr, cwa);
                }
            }
        }

        async setSimulationParams(grade, crr, cwa) {
            if (!this.controlChar) return;

            this.pendingParams = { grade, crr, cwa };

            if (!this.controlGranted) return;

            // 7 bytes: Op(1) + Wind(2) + Grade(2) + Crr(1) + CWA(1)
            const buf = new DataView(new ArrayBuffer(7));
            buf.setUint8(0, OP_SET_INDOOR_BIKE_SIMULATION);
            buf.setInt16(1, 0, true); // Wind Speed (0)
            buf.setInt16(3, Math.round(grade * 10000), true); // Grade (0.01%)
            buf.setUint8(5, Math.min(255, Math.round(crr / 0.0001))); // Crr (0.0001)
            buf.setUint8(6, Math.min(255, Math.round(cwa / 0.01))); // CWA (0.01 kg/m) - RAW per prompt

            try {
                await this.controlChar.writeValue(buf);
            } catch (e) {
                console.error('[Bridge] Failed to set params:', e);
            }
        }

        onDisconnect() {
            this.connected = false;
            this.controlGranted = false;
        }
    }

    class HeartRateService {
        constructor() {
            this.device = null;
            this.server = null;
            this.service = null;
            this.char = null;
            this.dataCallback = null;
        }

        async connect() {
            try {
                this.device = await navigator.bluetooth.requestDevice({
                    filters: [{ services: [HR_SERVICE_UUID] }]
                });
                this.server = await this.device.gatt.connect();
                this.service = await this.server.getPrimaryService(HR_SERVICE_UUID);
                this.char = await this.service.getCharacteristic(HR_MEASUREMENT_UUID);
                await this.char.startNotifications();
                this.char.addEventListener('characteristicvaluechanged', this.handleData.bind(this));
            } catch (e) {
                console.error('[Bridge] HR Connection failed:', e);
                throw e;
            }
        }

        disconnect() {
            if (this.device && this.device.gatt.connected) {
                this.device.gatt.disconnect();
            }
        }

        onData(callback) {
            this.dataCallback = callback;
        }

        handleData(event) {
            const data = event.target.value;
            const flags = data.getUint8(0);
            const bpm = (flags & 0x01) ? data.getUint16(1, true) : data.getUint8(1);

            if (this.dataCallback) {
                this.dataCallback(bpm);
            }
        }
    }

    window.spokes.trainerService = new TrainerService();
    window.spokes.heartRateService = new HeartRateService();

})();
