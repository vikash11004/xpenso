import test from "node:test";
import assert from "node:assert/strict";
import {
  minorUnits,
  localDay,
  validateExpense,
  capMetrics,
  streakDays,
  parseQuickText,
  migrateTransaction,
} from "../js/domain.mjs";
const cap = {
  id: "coffee",
  name: "Coffee",
  limitMinor: 100000,
  startedOn: "2026-10-01",
};
const entry = (amountMinor, day = "2026-10-25") => ({
  id: Math.random().toString(),
  amountMinor,
  capId: "coffee",
  occurredOn: day,
  monthKey: day.slice(0, 7),
  deleted: false,
});
test("currency stays exact in integer paise", () => {
  assert.equal(minorUnits("1,234.56"), 123456);
  assert.equal(minorUnits("0.01"), 1);
  for (const value of ["0", "-10", "12.345", "Infinity", "1e3", "1000001"])
    assert.throws(() => minorUnits(value));
});
test("India month boundary is independent of host timezone", () => {
  assert.equal(
    localDay(new Date("2026-10-31T19:00:00Z"), "Asia/Kolkata"),
    "2026-11-01",
  );
});
test("expense validates dates and rejects future/invalid dates", () => {
  const draft = {
    amountMinor: 45000,
    merchant: "Zomato",
    capId: "coffee",
    occurredOn: "2026-10-30",
  };
  assert.equal(validateExpense(draft, "2026-10-30").monthKey, "2026-10");
  for (const occurredOn of ["2026-02-30", "2026-11-01", "xxx"])
    assert.throws(() =>
      validateExpense({ ...draft, occurredOn }, "2026-10-30"),
    );
});
test("caps turn amber at exactly 80%, and reached at exactly 100%", () => {
  for (const [amount, state] of [
    [79999, "safe"],
    [80000, "near"],
    [100000, "over"],
    [120000, "over"],
  ])
    assert.equal(
      capMetrics(cap, [entry(amount)], null, "2026-10-30").state,
      state,
    );
});
test("only current-month nondeleted outflows reduce cap allowance", () => {
  const records = [
    entry(25000),
    entry(50000, "2026-09-30"),
    { ...entry(20000), deleted: true },
  ];
  assert.equal(capMetrics(cap, records, null, "2026-10-30").remaining, 75000);
});
test("flex affects the current period and never rewrites original cap", () => {
  const period = { originalLimitMinor: 100000, effectiveLimitMinor: 150000 };
  const metrics = capMetrics(cap, [entry(120000)], period, "2026-10-30");
  assert.equal(metrics.remaining, 30000);
  assert.equal(
    streakDays(
      [cap],
      [entry(120000)],
      [{ capId: "coffee", ...period }],
      "2026-10-30",
    ),
    0,
  );
  assert.equal(capMetrics(cap, [], null, "2026-11-01").limit, 100000);
});
test("runway and visits require useful history", () => {
  assert.equal(
    capMetrics(cap, [entry(10000)], null, "2026-10-30").visits,
    null,
  );
  const m = capMetrics(
    cap,
    [entry(20000), entry(20000), entry(20000)],
    null,
    "2026-10-30",
  );
  assert.equal(m.visits, 2);
  assert.equal(m.daysLeft, 1);
});
test("new caps cannot earn a retrospective streak", () => {
  assert.equal(
    streakDays(
      [{ ...cap, startedOn: "2026-10-30" }],
      [entry(1000)],
      [],
      "2026-10-30",
    ),
    0,
  );
});
test("offline text fallback is always reviewable and does not guess multiple amounts", () => {
  const r = parseQuickText("Spent 450 at a coffee shop", [cap], "2026-10-30");
  assert.equal(r.amountMinor, 45000);
  assert.equal(r.capId, "coffee");
  assert.equal(r.needsReview, true);
  assert.equal(
    parseQuickText("coffee 100 and cake 250", [cap]).amountMinor,
    null,
  );
  assert.equal(
    parseQuickText("Coffee 200 yesterday", [cap], "2026-11-01").occurredOn,
    "2026-10-31",
  );
  assert.throws(() => parseQuickText("received salary 10000", [cap]));
});
test("legacy migration excludes income and uses purchase date over entry date", () => {
  const old = {
    type: "expense",
    amount: 12.5,
    description: "Coffee",
    category: "Coffee",
    date: "2026-09-20",
    createdAt: { toDate: () => new Date("2026-10-01") },
  };
  const result = migrateTransaction("abc", old, [cap], "Asia/Kolkata");
  assert.equal(result.id, "legacy_abc");
  assert.equal(result.amountMinor, 1250);
  assert.equal(result.monthKey, "2026-09");
  assert.equal(result.capId, "coffee");
  assert.equal(
    migrateTransaction(
      "abc",
      { ...old, type: "income" },
      [cap],
      "Asia/Kolkata",
    ),
    null,
  );
  assert.equal(
    migrateTransaction("bad", { amount: "nope" }, [], "Asia/Kolkata"),
    null,
  );
});
