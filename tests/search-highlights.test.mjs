import test from "node:test";
import assert from "node:assert/strict";
import { indexTextLayerMatches } from "../src/search-highlights.js";

function chunks(...values) {
  return values.map((value) => {
    const span = {};
    const node = {};
    return { span, node, value };
  });
}

test("search text layer maps case-insensitive Turkish matches back to DOM positions", () => {
  const spans = chunks("BULGU", "diğer bulgu", "Bulgular");
  const matches = indexTextLayerMatches(spans, "bulgu");
  assert.equal(matches.length, 3);
  assert.deepEqual(matches.map(({ first, last }) => [first.node, first.offset, last.node, last.offset]), [
    [spans[0].node, 0, spans[0].node, 4],
    [spans[1].node, 6, spans[1].node, 10],
    [spans[2].node, 0, spans[2].node, 4],
  ]);
  assert.equal(indexTextLayerMatches(chunks("İSTANBUL İstanbul"), "istanbul").length, 2);
});

test("cross-span phrases and PDF whitespace retain selectable start/end offsets", () => {
  const spans = chunks("fizik   ", " bilgili  ", "model");
  const [match] = indexTextLayerMatches(spans, "fizik bilgili model");
  assert.ok(match);
  assert.equal(match.first.node, spans[0].node);
  assert.equal(match.first.offset, 0);
  assert.equal(match.last.node, spans[2].node);
  assert.equal(match.last.offset, 4);
});

test("empty searches, no matches and per-page bounds do not create highlight work", () => {
  const spans = chunks("test test test test");
  assert.deepEqual(indexTextLayerMatches(spans, ""), []);
  assert.deepEqual(indexTextLayerMatches(spans, "unrelated"), []);
  assert.equal(indexTextLayerMatches(spans, "test", 2).length, 2);
  assert.equal(indexTextLayerMatches(chunks("  test  "), "test").length, 1);
});
