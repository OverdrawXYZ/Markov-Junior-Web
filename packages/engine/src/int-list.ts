/** Growable Int32Array-backed list. Avoids per-push allocations on hot paths. */
export class IntList {
  data: Int32Array;
  length = 0;

  constructor(capacity = 64) {
    this.data = new Int32Array(capacity);
  }

  push(value: number): void {
    if (this.length === this.data.length) this.grow(this.length + 1);
    this.data[this.length++] = value;
  }

  /** Ensure capacity for at least `n` elements (contents preserved). */
  grow(n: number): void {
    if (n <= this.data.length) return;
    let cap = this.data.length || 1;
    while (cap < n) cap *= 2;
    const next = new Int32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }

  clear(): void {
    this.length = 0;
  }
}
