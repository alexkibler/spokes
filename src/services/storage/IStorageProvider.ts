/**
 * IStorageProvider.ts
 *
 * Defines a simple asynchronous interface for storage backends.
 * Allows swapping between LocalStorage, IndexedDB, or other persistence layers.
 */

export interface IStorageProvider {
  /**
   * Retrieves the value associated with the given key.
   * Returns null if the key does not exist.
   */
  getItem(key: string): Promise<string | null>;

  /**
   * Sets the value for the given key.
   */
  setItem(key: string, value: string): Promise<void>;

  /**
   * Removes the value associated with the given key.
   */
  removeItem(key: string): Promise<void>;
}
