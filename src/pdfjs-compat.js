/**
 * PDF.js 6.4.x uses the proposed Map upsert methods during canvas rendering.
 * Chromium 141 and some other supported browsers do not implement them yet.
 * Define only missing methods; do not replace native implementations.
 */
export function ensurePdfJsMapCompatibility(mapPrototype = Map.prototype) {
  if (typeof mapPrototype.getOrInsert !== "function") {
    Object.defineProperty(mapPrototype, "getOrInsert", {
      configurable: true, writable: true,
      value: function getOrInsert(key, defaultValue) {
        if (this.has(key)) return this.get(key);
        this.set(key, defaultValue);
        return defaultValue;
      },
    });
  }
  if (typeof mapPrototype.getOrInsertComputed !== "function") {
    Object.defineProperty(mapPrototype, "getOrInsertComputed", {
      configurable: true, writable: true,
      value: function getOrInsertComputed(key, callback) {
        if (this.has(key)) return this.get(key);
        if (typeof callback !== "function") throw new TypeError("callback must be a function");
        const value = callback(key);
        this.set(key, value);
        return value;
      },
    });
  }
}

ensurePdfJsMapCompatibility();
