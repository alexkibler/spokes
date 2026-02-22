/**
 * MockTrainerService.test.ts
 *
 * Unit tests for the in-memory mock trainer implementation.
 * No Bluetooth, no timers running for long periods — uses vi.useFakeTimers()
 * so interval-based emission is tested synchronously.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockTrainerService } from '../MockTrainerService';
import type { TrainerData } from '../ITrainerService';

// ─── Construction / defaults ──────────────────────────────────────────────────

describe('MockTrainerService – construction', () => {
  it('uses default power of 200 W', async () => {
    const svc = new MockTrainerService();
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    svc.disconnect();
    expect(frames[0].instantaneousPower).toBe(200);
  });

  it('uses default speed of 30 km/h', async () => {
    const svc = new MockTrainerService();
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    svc.disconnect();
    expect(frames[0].instantaneousSpeed).toBe(30);
  });

  it('uses default cadence of 90 rpm', async () => {
    const svc = new MockTrainerService();
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    svc.disconnect();
    expect(frames[0].instantaneousCadence).toBe(90);
  });

  it('accepts custom power', async () => {
    const svc = new MockTrainerService({ power: 350 });
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    svc.disconnect();
    expect(frames[0].instantaneousPower).toBe(350);
  });

  it('accepts custom speed', async () => {
    const svc = new MockTrainerService({ speed: 25 });
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    svc.disconnect();
    expect(frames[0].instantaneousSpeed).toBe(25);
  });

  it('accepts custom cadence', async () => {
    const svc = new MockTrainerService({ cadence: 75 });
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    svc.disconnect();
    expect(frames[0].instantaneousCadence).toBe(75);
  });
});

// ─── connect / disconnect / isConnected ──────────────────────────────────────

describe('MockTrainerService – connect / disconnect / isConnected', () => {
  let svc: MockTrainerService;

  beforeEach(() => {
    vi.useFakeTimers();
    svc = new MockTrainerService({ intervalMs: 100 });
  });

  afterEach(() => {
    svc.disconnect();
    vi.useRealTimers();
  });

  it('is not connected before connect()', () => {
    expect(svc.isConnected()).toBe(false);
  });

  it('is connected after connect()', async () => {
    await svc.connect();
    expect(svc.isConnected()).toBe(true);
  });

  it('is disconnected after disconnect()', async () => {
    await svc.connect();
    svc.disconnect();
    expect(svc.isConnected()).toBe(false);
  });

  it('second connect() call is a no-op (does not start another interval)', async () => {
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    await svc.connect(); // should be ignored
    // Should still have just 1 immediate frame, not 2
    expect(frames).toHaveLength(1);
  });

  it('emits one frame immediately on connect', async () => {
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    expect(frames).toHaveLength(1);
  });

  it('emits additional frames on each interval tick', async () => {
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    expect(frames).toHaveLength(1); // immediate
    vi.advanceTimersByTime(100);
    expect(frames).toHaveLength(2); // after one interval
    vi.advanceTimersByTime(100);
    expect(frames).toHaveLength(3); // after two intervals
  });

  it('stops emitting after disconnect', async () => {
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    svc.disconnect();
    const countAfterDisconnect = frames.length;
    vi.advanceTimersByTime(500);
    expect(frames.length).toBe(countAfterDisconnect); // no new frames
  });
});

// ─── onData ───────────────────────────────────────────────────────────────────

describe('MockTrainerService – onData', () => {
  it('each frame includes a timestamp', async () => {
    const svc = new MockTrainerService();
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    svc.disconnect();
    expect(typeof frames[0].timestamp).toBe('number');
    expect(frames[0].timestamp).toBeGreaterThan(0);
  });

  it('does not crash if no data callback is registered', async () => {
    const svc = new MockTrainerService();
    // No onData call — connect should still work
    await expect(svc.connect()).resolves.toBeUndefined();
    svc.disconnect();
  });

  it('only the most recently registered callback receives data', async () => {
    const svc = new MockTrainerService();
    const firstFrames: Partial<TrainerData>[] = [];
    const secondFrames: Partial<TrainerData>[] = [];
    svc.onData(f => firstFrames.push(f));
    svc.onData(f => secondFrames.push(f));
    await svc.connect();
    svc.disconnect();
    expect(secondFrames.length).toBeGreaterThan(0);
    expect(firstFrames.length).toBe(0); // overwritten
  });
});

// ─── setPower / setSpeed / setCadence ────────────────────────────────────────

describe('MockTrainerService – live mutators', () => {
  let svc: MockTrainerService;

  beforeEach(() => {
    vi.useFakeTimers();
    svc = new MockTrainerService({ intervalMs: 100 });
  });

  afterEach(() => {
    svc.disconnect();
    vi.useRealTimers();
  });

  it('setPower updates power emitted in subsequent frames', async () => {
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    expect(frames[0].instantaneousPower).toBe(200); // default
    svc.setPower(400);
    vi.advanceTimersByTime(100);
    expect(frames[1].instantaneousPower).toBe(400);
  });

  it('setSpeed updates speed emitted in subsequent frames', async () => {
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    svc.setSpeed(40);
    vi.advanceTimersByTime(100);
    expect(frames[1].instantaneousSpeed).toBe(40);
  });

  it('setCadence updates cadence emitted in subsequent frames', async () => {
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    svc.setCadence(100);
    vi.advanceTimersByTime(100);
    expect(frames[1].instantaneousCadence).toBe(100);
  });

  it('setPower to 0 emits 0 W', async () => {
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.connect();
    svc.setPower(0);
    vi.advanceTimersByTime(100);
    expect(frames[1].instantaneousPower).toBe(0);
  });
});

// ─── setSimulationParams ──────────────────────────────────────────────────────

describe('MockTrainerService – setSimulationParams', () => {
  it('resolves without throwing (no-op)', async () => {
    const svc = new MockTrainerService();
    await expect(svc.setSimulationParams(0.05, 0.005, 0.3)).resolves.toBeUndefined();
  });

  it('does not affect emitted data', async () => {
    const svc = new MockTrainerService({ power: 200 });
    const frames: Partial<TrainerData>[] = [];
    svc.onData(f => frames.push(f));
    await svc.setSimulationParams(0.10, 0.008, 0.4);
    await svc.connect();
    svc.disconnect();
    expect(frames[0].instantaneousPower).toBe(200);
  });
});
