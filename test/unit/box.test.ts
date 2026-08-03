import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fullBox, emptyBox, extend, area, margin, enlargedArea,
  intersectionArea, contains, intersects,
  type Box,
} from '../../src/index/box.ts';

const NO_AXES: Box = [];

test('area over zero axes is the empty product', () => {
  assert.equal(area(NO_AXES), 1);                               // DEC-18
});

test('margin over zero axes is the empty sum', () => {
  assert.equal(margin(NO_AXES), 0);                             // DEC-18
});

test('containment over zero axes is vacuously true', () => {
  assert.equal(contains(NO_AXES, NO_AXES), true);               // DEC-16
});

test('intersection over zero axes is vacuously true', () => {
  assert.equal(intersects(NO_AXES, NO_AXES), true);
});

test('area and margin on one and two axes', () => {
  assert.equal(area([[0, 4]]), 4);
  assert.equal(area([[0, 4], [0, 3]]), 12);
  assert.equal(margin([[0, 4]]), 4);
  assert.equal(margin([[0, 4], [0, 3]]), 7);
});

test('containment is strict about every axis', () => {
  const outer: Box = [[0, 10], [0, 10]];
  assert.equal(contains(outer, [[1, 2], [1, 2]]), true);
  assert.equal(contains(outer, [[1, 2], [9, 11]]), false, 'exceeds on axis 1');
  assert.equal(contains(outer, [[-1, 2], [1, 2]]), false, 'exceeds on axis 0');
});

test('containment holds on the boundary', () => {
  assert.equal(contains([[0, 10]], [[0, 10]]), true);
  assert.equal(contains([[0, 10]], [[0, 0]]), true);
});

test('a full box contains everything on every axis', () => {
  const full = fullBox(3);
  assert.equal(full.length, 3);
  assert.equal(contains(full, [[-1e9, 1e9], [0, 0], [5, 7]]), true);
});

test('a full box over zero axes is empty and still contains', () => {
  assert.deepEqual(fullBox(0), []);
  assert.equal(contains(fullBox(0), NO_AXES), true);
});

test('extend grows to cover, and an empty box is its identity', () => {
  const b = emptyBox(2);
  extend(b, [[1, 2], [5, 6]]);
  assert.deepEqual(b, [[1, 2], [5, 6]]);
  extend(b, [[0, 1], [7, 8]]);
  assert.deepEqual(b, [[0, 2], [5, 8]]);
});

test('enlargedArea is the area after covering both', () => {
  assert.equal(enlargedArea([[0, 2]], [[4, 6]]), 6);
  assert.equal(enlargedArea([[0, 2], [0, 2]], [[0, 2], [0, 2]]), 4);
});

test('intersectionArea is zero when disjoint on any axis', () => {
  assert.equal(intersectionArea([[0, 2], [0, 2]], [[1, 3], [1, 3]]), 1);
  assert.equal(intersectionArea([[0, 2], [0, 2]], [[5, 7], [1, 3]]), 0);
});

test('intersects distinguishes touching from disjoint', () => {
  assert.equal(intersects([[0, 2]], [[2, 4]]), true, 'touching counts');
  assert.equal(intersects([[0, 2]], [[3, 4]]), false);
});
