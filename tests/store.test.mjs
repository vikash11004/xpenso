import test from "node:test";
import assert from "node:assert/strict";
globalThis.localStorage = {
  getItem() {
    return null;
  },
  setItem() {},
};
const { DemoStore } = await import("../js/store.mjs");
test("caps can be added, retired and restored without losing their period", async () => {
  const store = new DemoStore(true);
  const cap = { id: "coffee", limitMinor: 100000, active: true },
    period = {
      id: "2026-10_coffee",
      capId: "coffee",
      monthKey: "2026-10",
      originalLimitMinor: 100000,
      effectiveLimitMinor: 100000,
    };
  await store.updateCap(cap, period);
  await store.updateCap({ ...cap, active: false }, period);
  await store.updateCap(
    { ...cap, active: true, limitMinor: 150000 },
    { ...period, effectiveLimitMinor: 150000 },
  );
  assert.equal(store.data.caps.length, 1);
  assert.equal(store.data.caps[0].active, true);
  assert.equal(store.data.periods.length, 1);
  assert.equal(store.data.periods[0].originalLimitMinor, 100000);
});
test("retrying the same receipt creates only one active expense", async () => {
  const store = new DemoStore(true);
  assert.equal(
    await store.createExpense("receipt_abc", {
      amountMinor: 45000,
      deleted: false,
    }),
    true,
  );
  assert.equal(
    await store.createExpense("receipt_abc", {
      amountMinor: 45000,
      deleted: false,
    }),
    false,
  );
  assert.equal(store.data.expenses.length, 1);
  await store.deleteExpense("receipt_abc");
  assert.equal(
    await store.createExpense("receipt_abc", {
      amountMinor: 45000,
      deleted: false,
    }),
    true,
  );
  assert.equal(store.data.expenses.length, 1);
});
test("month initialization is repeatable; flex undo refuses to overwrite a newer edit", async () => {
  const store = new DemoStore(true);
  await store.setup([{ id: "coffee", limitMinor: 100000 }]);
  await store.ensurePeriods("2026-10");
  await store.ensurePeriods("2026-10");
  assert.equal(store.data.periods.length, 1);
  const first = await store.flexCap("coffee", "2026-10");
  await store.flexCap("coffee", "2026-10");
  await assert.rejects(() => store.undoFlex(first.before, first.after));
  assert.equal(store.data.periods[0].originalLimitMinor, 100000);
  assert.equal(store.data.periods[0].effectiveLimitMinor, 200000);
  assert.equal(store.data.caps[0].limitMinor, 100000);
});
