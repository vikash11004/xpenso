"use strict";
const crypto = require("node:crypto");
const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    merchant: { type: ["string", "null"] },
    amountMinor: { type: ["integer", "null"] },
    currency: { type: ["string", "null"] },
    capId: { type: ["string", "null"] },
    occurredOn: { type: ["string", "null"] },
    direction: { type: "string", enum: ["outflow", "inflow", "unknown"] },
    paymentStatus: {
      type: "string",
      enum: ["completed", "pending", "failed", "unknown"],
    },
    amountEvidence: { type: ["string", "null"] },
    dateEvidence: { type: ["string", "null"] },
    needsReview: { type: "boolean" },
  },
  required: [
    "merchant",
    "amountMinor",
    "currency",
    "capId",
    "occurredOn",
    "direction",
    "paymentStatus",
    "amountEvidence",
    "dateEvidence",
    "needsReview",
  ],
};
function validateInput(input) {
  if (!input || typeof input !== "object")
    throw new Error("Provide a spending description or receipt.");
  const hasText =
    typeof input.text === "string" && input.text.trim().length > 0;
  const hasImage = typeof input.image === "string" && input.image.length > 0;
  if (hasText === hasImage)
    throw new Error("Send one description or one receipt at a time.");
  if (hasText && input.text.length > 500)
    throw new Error("Keep the spending description under 500 characters.");
  if (hasImage) {
    if (
      input.image.length > 5 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(input.image)
    )
      throw new Error("Use a smaller, valid receipt image.");
    const bytes = Buffer.from(input.image, "base64");
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp =
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP";
    if (!jpeg && !png && !webp)
      throw new Error("Choose a JPG, PNG or WebP image.");
  }
  return {
    text: hasText ? input.text.trim() : null,
    image: hasImage ? Buffer.from(input.image, "base64") : null,
  };
}
function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
function numbers(text) {
  return [...text.matchAll(/\d[\d,]*(?:\.\d{1,2})?/g)].map((m) =>
    Math.round(Number(m[0].replace(/,/g, "")) * 100),
  );
}
function sourceDate(evidence, today) {
  if (!evidence) return null;
  if (/\byesterday\b/i.test(evidence))
    return new Date(Date.parse(today + "T12:00:00Z") - 86400000)
      .toISOString()
      .slice(0, 10);
  if (/\btoday\b/i.test(evidence)) return today;
  const iso = evidence.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const indian = evidence.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/);
  if (indian)
    return `${indian[3]}-${indian[2].padStart(2, "0")}-${indian[1].padStart(2, "0")}`;
  const named = evidence.match(
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i,
  );
  if (named) {
    const month =
      [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ].indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    return `${named[3]}-${String(month).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }
  return null;
}
function validateExtraction(result, { text, caps, today, receipt = false }) {
  if (!result || typeof result !== "object")
    throw new Error("No spending details found. Try entering the amount.");
  if (result.direction !== "outflow" || result.paymentStatus !== "completed")
    throw new Error(
      "Only completed outgoing spending can be logged. Check whether this payment was received, failed or is still pending.",
    );
  if (result.currency && result.currency !== "INR")
    throw new Error(
      "This space tracks INR. Enter the amount you actually paid in rupees.",
    );
  if (!receipt && /(?:^|\s)-\s*(?:₹|rs\.?\s*|inr\s*)?\d/i.test(text))
    throw new Error(
      "Enter a positive spending amount. Refunds are not new spending.",
    );
  if (
    /\b(payment failed|transaction failed|payment pending|amount received|money received|salary credited)\b/i.test(
      text,
    )
  )
    throw new Error(
      "This appears to be an incoming, failed or pending payment. It hasn’t been logged.",
    );
  const amountMinor =
    Number.isInteger(result.amountMinor) &&
    result.amountMinor > 0 &&
    result.amountMinor <= 100000000
      ? result.amountMinor
      : null;
  const merchant =
    typeof result.merchant === "string"
      ? result.merchant.trim().slice(0, 120)
      : "";
  const capId = caps.some((c) => c.id === result.capId) ? result.capId : "";
  const correctDate =
    validDate(result.occurredOn) &&
    result.occurredOn >= "2000-01-01" &&
    result.occurredOn <= today;
  const occurredOn = correctDate ? result.occurredOn : today;
  const evidence =
    typeof result.amountEvidence === "string" ? result.amountEvidence : "";
  const supported =
    evidence.length > 0 &&
    text.includes(evidence) &&
    numbers(evidence).includes(amountMinor);
  const merchantSupported =
    merchant.length > 0 && text.toLowerCase().includes(merchant.toLowerCase());
  const totalLine =
    !receipt ||
    (/\b(total|paid|debited|sent)\b/i.test(evidence) &&
      !/^\s*sub\s*total/i.test(evidence));
  const dateEvidence =
    typeof result.dateEvidence === "string" ? result.dateEvidence : "";
  const dateSupported = dateEvidence
    ? text.includes(dateEvidence) &&
      sourceDate(dateEvidence, today) === occurredOn
    : !receipt && occurredOn === today && !/\byesterday\b/i.test(text);
  const normalizedTotals = receipt
    ? new Set(
        text
          .split(/\r?\n/)
          .filter(
            (line) =>
              /\b(total|paid|debited|sent)\b/i.test(line) &&
              !/^\s*sub\s*total/i.test(line),
          )
          .flatMap(numbers),
      )
    : new Set(numbers(text));
  const unambiguous =
    normalizedTotals.size === 1 && normalizedTotals.has(amountMinor);
  return {
    merchant,
    amountMinor,
    capId,
    occurredOn,
    currency: "INR",
    direction: "outflow",
    paymentStatus: "completed",
    needsReview:
      result.needsReview !== false ||
      !amountMinor ||
      !capId ||
      !correctDate ||
      !supported ||
      !merchantSupported ||
      !totalLine ||
      !dateSupported ||
      !unambiguous,
  };
}
const fingerprint = (image) =>
  crypto.createHash("sha256").update(image).digest("hex");
module.exports = { schema, validateInput, validateExtraction, fingerprint };
