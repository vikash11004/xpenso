export const PRESETS = [
  {
    id: "eating-out",
    name: "Eating Out",
    icon: "🍔",
    limitMinor: 500000,
    tone: "peach",
  },
  {
    id: "shopping",
    name: "Shopping",
    icon: "🛍️",
    limitMinor: 400000,
    tone: "lavender",
  },
  {
    id: "transport",
    name: "Transport",
    icon: "🚕",
    limitMinor: 250000,
    tone: "blue",
  },
  {
    id: "coffee",
    name: "Coffee",
    icon: "☕",
    limitMinor: 150000,
    tone: "sage",
  },
];
export const MAX_AMOUNT = 100000000;
export const money = (minor, decimals = false) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: decimals || minor % 100 ? 2 : 0,
  }).format(minor / 100);
export function minorUnits(value) {
  const str = String(value).trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(str))
    throw new Error("Enter an amount with at most two decimal places.");
  const [whole, fraction = ""] = str.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > MAX_AMOUNT)
    throw new Error("Enter an amount between ₹0.01 and ₹10,00,000.");
  return minor;
}
export function localDay(date = new Date(), timezone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type).value)
    .join("-");
}
export function validDay(day) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    !Number.isNaN(Date.parse(day)) &&
    new Date(day + "T12:00:00Z").toISOString().slice(0, 10) === day
  );
}
export function validateExpense(input, today = localDay()) {
  if (
    !Number.isInteger(input.amountMinor) ||
    input.amountMinor < 1 ||
    input.amountMinor > MAX_AMOUNT
  )
    throw new Error("Please enter a valid amount.");
  if (
    !validDay(input.occurredOn) ||
    input.occurredOn > today ||
    input.occurredOn < "2000-01-01"
  )
    throw new Error("Choose a valid spending date, today or earlier.");
  const merchant = String(input.merchant || "Everyday spend")
    .trim()
    .slice(0, 120);
  if (!/^[a-zA-Z0-9_-]{0,100}$/.test(input.capId || ""))
    throw new Error("Choose a valid cap.");
  return {
    amountMinor: input.amountMinor,
    merchant,
    capId: input.capId || "",
    occurredOn: input.occurredOn,
    monthKey: input.occurredOn.slice(0, 7),
    currency: "INR",
    source: ["manual", "text", "receipt", "migration"].includes(input.source)
      ? input.source
      : "manual",
    receiptHash: input.receiptHash || "",
    deleted: false,
    schemaVersion: 2,
  };
}
export function capMetrics(cap, expenses, period, today = localDay()) {
  const items = expenses.filter(
    (e) => !e.deleted && e.capId === cap.id && e.monthKey === today.slice(0, 7),
  );
  const spent = items.reduce((n, e) => n + e.amountMinor, 0);
  const limit = period?.effectiveLimitMinor ?? cap.limitMinor;
  const original = period?.originalLimitMinor ?? cap.limitMinor;
  const remaining = limit - spent;
  const day = Number(today.slice(-2));
  const daysInMonth = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0),
  ).getUTCDate();
  const activeSince =
    cap.startedOn?.slice(0, 7) === today.slice(0, 7)
      ? Number(cap.startedOn.slice(-2))
      : 1;
  const observedDays = Math.max(1, day - activeSince + 1);
  const pace = spent / observedDays;
  const visits =
    items.length >= 3
      ? Math.max(0, Math.floor(remaining / (spent / items.length)))
      : null;
  return {
    items,
    spent,
    limit,
    original,
    remaining,
    percent: Math.round((spent / limit) * 100),
    daysLeft: daysInMonth - day,
    pace,
    runway: pace > 0 ? Math.max(0, Math.floor(remaining / pace)) : null,
    visits,
    observedDays,
    state: spent >= limit ? "over" : spent >= limit * 0.8 ? "near" : "safe",
  };
}
export function streakDays(caps, expenses, periods, today = localDay()) {
  if (!caps.length) return 0;
  const metrics = caps.map((c) =>
    capMetrics(
      c,
      expenses,
      periods.find((p) => p.capId === c.id),
      today,
    ),
  );
  if (
    metrics.some((m) => m.spent > m.original) ||
    !expenses.some((e) => !e.deleted && e.monthKey === today.slice(0, 7))
  )
    return 0;
  return Math.max(0, Math.min(...metrics.map((m) => m.observedDays)) - 1);
}
// Conservative offline fallback. Ambiguous input always opens the review sheet.
export function parseQuickText(text, caps, today = localDay()) {
  if (/(?:^|\s)-\s*(?:₹|rs\.?\s*|inr\s*)?\d/i.test(text))
    throw new Error(
      "Enter the positive amount you spent. Refunds aren’t new spending.",
    );
  if (/\b(received|salary|income|refund|credited|failed|pending)\b/i.test(text))
    throw new Error(
      "Log completed spending only. Received or pending payments aren’t expenses.",
    );
  const hits = [
    ...text.matchAll(/(?:₹|rs\.?\s*|inr\s*)?(\d[\d,]*(?:\.\d{1,2})?)/gi),
  ];
  const amountMinor = hits.length === 1 ? minorUnits(hits[0][1]) : null;
  let merchant = text
    .replace(/(?:₹|rs\.?\s*|inr\s*)?\d[\d,]*(?:\.\d{1,2})?/gi, "")
    .replace(/\b(spent|paid|on|at|for|yesterday|today)\b/gi, "")
    .trim();
  merchant = merchant.charAt(0).toUpperCase() + merchant.slice(1);
  const patterns = {
    coffee: /coffee|cafe|café|starbucks|cappuccino|latte/i,
    "eating-out":
      /zomato|swiggy|restaurant|dinner|lunch|breakfast|meal|pizza|burger/i,
    transport: /uber|ola|taxi|metro|bus|auto|petrol|fuel/i,
    shopping: /amazon|myntra|shopping|clothes|shoes|flipkart/i,
  };
  const matching = caps.find(
    (c) =>
      patterns[c.id]?.test(text) ||
      text.toLowerCase().includes(c.name.toLowerCase()),
  );
  let occurredOn = today;
  if (/yesterday/i.test(text)) {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    occurredOn = d.toISOString().slice(0, 10);
  }
  return {
    amountMinor,
    merchant: merchant || "",
    capId: matching?.id || "",
    occurredOn,
    source: "text",
    needsReview: true,
  };
}
export function migrateTransaction(id, data, caps, timezone) {
  if (data.type === "income") return null;
  const rawDate =
    data.date?.toDate?.() || data.date || data.createdAt?.toDate?.();
  const date = rawDate && new Date(rawDate);
  if (!date || Number.isNaN(date.valueOf())) return null;
  let amountMinor;
  try {
    amountMinor = minorUnits(Number(data.amount).toFixed(2));
  } catch {
    return null;
  }
  const cap = caps.find(
    (c) => c.name.toLowerCase() === String(data.category || "").toLowerCase(),
  );
  return {
    id: "legacy_" + id,
    ...validateExpense(
      {
        amountMinor,
        merchant: data.description,
        capId: cap?.id || "",
        occurredOn: localDay(date, timezone),
        source: "migration",
      },
      "9999-12-31",
    ),
    legacyId: id,
    legacyCategory: String(data.category || "").slice(0, 100),
  };
}
