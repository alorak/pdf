/**
 * pdfjs-dist v6 uses Map.getOrInsertComputed() while Chromium versions shipped
 * by some browser test runners (and older production browsers) do not yet
 * implement the ECMAScript upsert collection methods.
 *
 * Install only missing methods. Keep method descriptors non-enumerable and do
 * not override native implementations.
 */
export function installMapUpsertPolyfills({
  mapPrototype = Map.prototype,
  weakMapPrototype = WeakMap.prototype,
} = {}) {
  for (const prototype of [mapPrototype, weakMapPrototype]) {
    if (typeof prototype.getOrInsert !== "function") {
      Object.defineProperty(prototype, "getOrInsert", {
        configurable: true, writable: true,
        value: function getOrInsert(key, defaultValue) {
          if (this.has(key)) return this.get(key);
          this.set(key, defaultValue);
          return defaultValue;
        },
      });
    }
    if (typeof prototype.getOrInsertComputed !== "function") {
      Object.defineProperty(prototype, "getOrInsertComputed", {
        configurable: true, writable: true,
        value: function getOrInsertComputed(key, callback) {
          if (this.has(key)) return this.get(key);
          const value = callback(key);
          this.set(key, value);
          return value;
        },
      });
    }
  }
}
