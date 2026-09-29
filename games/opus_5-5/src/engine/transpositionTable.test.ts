import { describe, expect, it } from "vitest";
import { BOUND_EXACT, BOUND_LOWER, TranspositionTable } from "./transpositionTable";

describe("TranspositionTable", () => {
  it("returns what was stored for the same key", () => {
    const table = new TranspositionTable(10);
    table.store(0x1234, 0x5678, 5, BOUND_EXACT, -250, 777);
    const entry = table.probe(0x1234, 0x5678);
    expect(entry).toBeGreaterThanOrEqual(0);
    expect(table.depthAt(entry)).toBe(5);
    expect(table.boundAt(entry)).toBe(BOUND_EXACT);
    expect(table.scoreAt(entry)).toBe(-250);
    expect(table.moveAt(entry)).toBe(777);
  });

  it("misses when the verification half of the key differs", () => {
    const table = new TranspositionTable(10);
    table.store(0x1234, 0x5678, 5, BOUND_EXACT, 10, 1);
    expect(table.probe(0x1234, 0x9999)).toBe(-1);
  });

  it("misses on an empty table, including for a zero key", () => {
    expect(new TranspositionTable(10).probe(0, 0)).toBe(-1);
  });

  it("keeps a deeper entry for the same position over a shallower bound", () => {
    const table = new TranspositionTable(10);
    table.store(1, 2, 8, BOUND_EXACT, 40, 5);
    table.store(1, 2, 3, BOUND_LOWER, 90, 6);
    expect(table.depthAt(table.probe(1, 2))).toBe(8);
  });

  it("forgets everything after clear", () => {
    const table = new TranspositionTable(10);
    table.store(1, 2, 8, BOUND_EXACT, 40, 5);
    table.clear();
    expect(table.probe(1, 2)).toBe(-1);
  });
});
