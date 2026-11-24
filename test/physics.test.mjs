import assert from "node:assert/strict";
import { test } from "node:test";
import { animateSpring, springStep } from "../src/physics.ts";

const config = { stiffness: 800, damping: 60, mass: 1, restThreshold: 0.5 };

function mockFrames(t) {
  const pending = new Map();
  let id = 0;
  globalThis.requestAnimationFrame = (callback) => {
    pending.set(++id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => pending.delete(id);
  t.after(() => {
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  });

  return {
    get pending() { return pending.size; },
    run(time) {
      for (const [id, callback] of [...pending]) {
        if (pending.delete(id)) callback(time);
      }
    },
  };
}

for (const [name, gaps] of [
  ["30 fps", [1000 / 30]],
  ["sustained 64 ms gaps", [64]],
  ["irregular gaps including a paused tab", [8, 27, 50, 16, 1000, 64, 33]],
]) {
  test(`spring settles at ${name}`, (t) => {
    const frames = mockFrames(t);
    const updates = [];
    const from = 480;
    const target = 0;
    let completed = 0;
    let now = 100;
    animateSpring(from, target, 0, config, (value) => updates.push(value), () => {
      assert.equal(updates.at(-1), target);
      completed++;
    });

    frames.run(now);
    assert.equal(updates.length, 0);
    for (let i = 0; i < 240 && frames.pending; i++) {
      const previousCount = updates.length;
      frames.run(now += gaps[i % gaps.length]);
      assert.equal(updates.length - previousCount, completed ? 2 : 1);
    }

    assert.equal(completed, 1);
    assert.equal(frames.pending, 0);
    assert.ok(updates.every((value) => Number.isFinite(value) && Math.abs(value) <= from));
    assert.ok(Math.abs(updates.at(-2) - target) < config.restThreshold);
    frames.run(now + 64);
    assert.equal(completed, 1);
  });
}

test("spring divides a capped frame into equal steps and updates once", (t) => {
  const frames = mockFrames(t);
  const updates = [];
  animateSpring(480, 0, 0, config, (value) => updates.push(value), () => {
    assert.fail("The spring must not complete on the first step.");
  });
  frames.run(100);
  frames.run(1100);

  let state = { position: 480, velocity: 0 };
  for (let i = 0; i < 4; i++) {
    state = springStep(state.position, 0, state.velocity, 0.016, config);
  }
  assert.deepEqual(updates, [state.position]);
});

test("cancellation prevents further updates and completion", (t) => {
  const frames = mockFrames(t);
  const update = t.mock.fn();
  const complete = t.mock.fn();
  const cancel = animateSpring(480, 0, 0, config, update, complete);
  frames.run(100);
  frames.run(133);
  cancel();
  frames.run(166);

  assert.equal(frames.pending, 0);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(complete.mock.callCount(), 0);
});
