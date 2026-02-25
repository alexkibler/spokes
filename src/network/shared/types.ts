import type { RunModifiers, ModifierLogEntry } from '../../core/roguelike/RunManager';

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type CursorDirection = 'up' | 'down' | 'left' | 'right';

export interface PauseStateData {
  inventory: string[];
  equipped: Record<string, string>;
  modifiers: RunModifiers;
  modifierLog: ModifierLogEntry[];
  ftpW: number;
  gold: number;
  isRoguelike: boolean;
}

// ─── Socket Event Payloads ────────────────────────────────────────────────────

export interface CreateRoomResponse {
  roomCode?: string;
  error?: string;
}

export interface JoinRoomPayload {
  roomCode: string;
}

export interface JoinRoomResponse {
  success: boolean;
  error?: string;
}

export interface ClientConnectedPayload {
  clientId: string;
}

// ─── Input Payloads ───────────────────────────────────────────────────────────

export type ClientInputType = 'dpad' | 'action' | 'item';

export interface BaseInputPayload {
  type: ClientInputType;
  clientId?: string; // Added by server relay
}

export interface DpadInputPayload extends BaseInputPayload {
  type: 'dpad';
  direction: CursorDirection;
}

export interface ActionInputPayload extends BaseInputPayload {
  type: 'action';
  action: 'select' | 'pause' | 'resume' | 'backToMap' | 'saveQuit';
}

export interface ItemInputPayload extends BaseInputPayload {
  type: 'item';
  itemId: string;
}

export type ClientInputPayload = DpadInputPayload | ActionInputPayload | ItemInputPayload;

// ─── Host State Payloads ──────────────────────────────────────────────────────

export interface HostStateUpdatePayload {
  instantaneousPower: number;
  speedMs: number;
  distanceM: number;
  heartRateBpm: number;
  currentGrade: number;
  units: 'imperial' | 'metric';
}

export interface HostPauseStatePayload extends PauseStateData {}

export interface HostResumeStatePayload {}
