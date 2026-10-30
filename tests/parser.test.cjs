const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateInput,
  validateExtraction,
} = require("../functions/parser-core.cjs");
const result = {
  merchant: "Zomato",
  amountMinor: 45000,
  currency: "INR",
  capId: "food",
  occurredOn: "2026-10-30",
  direction: "outflow",
  paymentStatus: "completed",
  amountEvidence: "450",
  dateEvidence: null,
  needsReview: false,
};
const context = {
  text: "Spent 450 on Zomato",
  caps: [{ id: "food" }],
  today: "2026-10-30",
};
test("clear text extraction can save immediately", () => {
  assert.equal(validateExtraction(result, context).needsReview, false);
});
test("dates must be supported by the source before auto-saving", () => {
  assert.equal(
    validateExtraction({ ...result, occurredOn: "2026-09-01" }, context)
      .needsReview,
    true,
  );
  const receipt = {
    ...context,
    text: "Zomato\n30/10/2026\nTotal 450",
    receipt: true,
  };
  assert.equal(
    validateExtraction(
      { ...result, amountEvidence: "Total 450", dateEvidence: "30/10/2026" },
      receipt,
    ).needsReview,
    false,
  );
  assert.equal(
    validateExtraction(
      {
        ...result,
        occurredOn: "2026-10-20",
        amountEvidence: "Total 450",
        dateEvidence: "30/10/2026",
      },
      receipt,
    ).needsReview,
    true,
  );
  assert.equal(
    validateExtraction(
      { ...result, occurredOn: "2026-10-29", dateEvidence: "yesterday" },
      { ...context, text: "Spent 450 on Zomato yesterday" },
    ).needsReview,
    false,
  );
  assert.throws(() =>
    validateExtraction(result, { ...context, text: "Spent -450 on Zomato" }),
  );
});
test("unsupported amount cannot auto-save even if model claims certainty", () => {
  assert.equal(
    validateExtraction({ ...result, amountMinor: 90000 }, context).needsReview,
    true,
  );
});
test("unknown categories and fabricated merchants require correction", () => {
  assert.equal(
    validateExtraction({ ...result, capId: "invented" }, context).capId,
    "",
  );
  assert.equal(
    validateExtraction({ ...result, merchant: "Amazon" }, context).needsReview,
    true,
  );
});
test("incoming and unsuccessful payments are rejected", () => {
  for (const bad of [
    { direction: "inflow" },
    { paymentStatus: "pending" },
    { paymentStatus: "failed" },
    { currency: "USD" },
  ])
    assert.throws(() => validateExtraction({ ...result, ...bad }, context));
});
test("receipt ambiguity cannot be hidden by model confidence", () => {
  const r = {
    ...result,
    amountEvidence: "Total 450",
    dateEvidence: "2026-10-30",
  };
  assert.equal(
    validateExtraction(r, {
      ...context,
      text: "Zomato\n2026-10-30\nTotal 450",
      receipt: true,
    }).needsReview,
    false,
  );
  assert.equal(
    validateExtraction(r, {
      ...context,
      text: "Zomato\n2026-10-30\nTotal 450\nPaid 500",
      receipt: true,
    }).needsReview,
    true,
  );
  assert.equal(
    validateExtraction(
      { ...r, dateEvidence: null },
      { ...context, text: "Zomato Total 450", receipt: true },
    ).needsReview,
    true,
  );
});
test("input rejects mixed payloads, oversized text and disguised files", () => {
  assert.throws(() => validateInput({ text: "hello", image: "anything" }));
  assert.throws(() => validateInput({ text: "x".repeat(501) }));
  assert.throws(() =>
    validateInput({
      image: Buffer.from("<script>alert(1)</script>").toString("base64"),
    }),
  );
  assert.equal(
    validateInput({ text: "Spent 100 on coffee" }).text,
    "Spent 100 on coffee",
  );
});
