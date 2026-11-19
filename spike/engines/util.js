export function waitFor(predicate, ms = 10000, step = 50) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      let value;
      try {
        value = predicate();
      } catch (error) {
        reject(error);
        return;
      }
      if (value) {
        resolve(value);
        return;
      }
      if (performance.now() - start > ms) {
        reject(new Error("timed out"));
        return;
      }
      setTimeout(tick, step);
    };
    tick();
  });
}

export function median(values) {
  const numbers = values.filter((value) => typeof value === "number");
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function fetchBook(path) {
  const response = await fetch(path);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.blob();
}

export function metadataText(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return metadataText(value[0]);
  if (typeof value === "object") return value.en || Object.values(value)[0] || null;
  return String(value);
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function withTimeout(work, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function mark(label) {
  window.__progress = label;
}
