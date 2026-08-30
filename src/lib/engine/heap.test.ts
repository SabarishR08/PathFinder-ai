import { describe, it, expect } from "vitest";
import { MinHeap } from "@/lib/engine/heap";

describe("MinHeap", () => {
  it("starts empty", () => {
    const heap = new MinHeap<string>();
    expect(heap.size).toBe(0);
    expect(heap.pop()).toBeUndefined();
  });

  it("pushes and pops a single item", () => {
    const heap = new MinHeap<string>();
    heap.push("a", 5);
    expect(heap.size).toBe(1);
    expect(heap.pop()).toBe("a");
    expect(heap.size).toBe(0);
  });

  it("pops items in ascending priority order", () => {
    const heap = new MinHeap<string>();
    heap.push("high", 10);
    heap.push("low", 1);
    heap.push("mid", 5);

    expect(heap.pop()).toBe("low");
    expect(heap.pop()).toBe("mid");
    expect(heap.pop()).toBe("high");
  });

  it("handles items with equal priority", () => {
    const heap = new MinHeap<string>();
    heap.push("a", 3);
    heap.push("b", 3);
    heap.push("c", 3);

    const results = [heap.pop(), heap.pop(), heap.pop()];
    expect(results).toContain("a");
    expect(results).toContain("b");
    expect(results).toContain("c");
    expect(heap.size).toBe(0);
  });

  it("handles interleaved push and pop", () => {
    const heap = new MinHeap<string>();
    heap.push("a", 5);
    heap.push("b", 3);
    expect(heap.pop()).toBe("b");
    heap.push("c", 1);
    heap.push("d", 4);
    expect(heap.pop()).toBe("c");
    // After popping c(1), heap has a(5) and d(4) → d pops first
    expect(heap.pop()).toBe("d");
    expect(heap.pop()).toBe("a");
  });

  it("handles large number of items", () => {
    const heap = new MinHeap<number>();
    const values = [50, 25, 75, 10, 40, 60, 90, 5, 15, 35, 45, 55, 65, 80, 95];
    for (const v of values) heap.push(v, v);

    const sorted: number[] = [];
    while (heap.size) sorted.push(heap.pop()!);
    expect(sorted).toEqual([5, 10, 15, 25, 35, 40, 45, 50, 55, 60, 65, 75, 80, 90, 95]);
  });

  it("handles push after all items popped", () => {
    const heap = new MinHeap<string>();
    heap.push("a", 1);
    heap.pop();
    expect(heap.size).toBe(0);
    heap.push("b", 2);
    expect(heap.pop()).toBe("b");
  });

  it("handles negative priorities", () => {
    const heap = new MinHeap<string>();
    heap.push("negative", -5);
    heap.push("zero", 0);
    heap.push("positive", 5);

    expect(heap.pop()).toBe("negative");
    expect(heap.pop()).toBe("zero");
    expect(heap.pop()).toBe("positive");
  });
});
