/**
 * LocalStorageProvider.ts
 *
 * Implements IStorageProvider using the browser's localStorage API.
 * Wraps synchronous calls in Promises for compatibility with the interface.
 */

import { IStorageProvider } from './IStorageProvider';

export class LocalStorageProvider implements IStorageProvider {
  async getItem(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      console.warn('[LocalStorageProvider] getItem failed:', err);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn('[LocalStorageProvider] setItem failed:', err);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn('[LocalStorageProvider] removeItem failed:', err);
    }
  }
}
