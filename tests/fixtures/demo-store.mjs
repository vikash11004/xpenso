import { PRESETS, localDay } from "../../js/domain.mjs";
const DEMO_KEY = "xpenso-shield-demo-v2";
export function demoData() {
  const today = localDay(),
    month = today.slice(0, 7);
  const caps = PRESETS.map((c) => ({
    ...c,
    active: true,
    startedOn: month + "-01",
  }));
  const examples = [
    ["Zomato", 45000, "eating-out", 0],
    ["Blue Tokai", 28000, "coffee", 0],
    ["Uber", 18500, "transport", 1],
    ["Uniqlo", 189000, "shopping", 2],
    ["Third Wave Coffee", 24000, "coffee", 3],
    ["Lunch with friends", 85000, "eating-out", 4],
    ["Swiggy", 62000, "eating-out", 5],
    ["Metro", 8000, "transport", 6],
    ["Blue Tokai", 32000, "coffee", 7],
    ["Dinner at Social", 145000, "eating-out", 8],
    ["Cappuccino", 36000, "coffee", 9],
  ];
  const expenses = examples.map(([merchant, amountMinor, capId, ago], i) => ({
    id: "demo_" + i,
    merchant,
    amountMinor,
    capId,
    occurredOn:
      month +
      "-" +
      String(Math.max(1, Number(today.slice(-2)) - ago)).padStart(2, "0"),
    monthKey: month,
    source: "manual",
    currency: "INR",
    createdAt: Date.now() - ago * 864e5,
    deleted: false,
    schemaVersion: 2,
  }));
  return {
    profile: {
      displayName: "Alex",
      onboardingVersion: 2,
      timezone: "Asia/Kolkata",
    },
    caps,
    expenses,
    periods: [],
  };
}
export class DemoStore {
  constructor(fresh = false) {
    try {
      this.data = JSON.parse(localStorage.getItem(DEMO_KEY));
    } catch {}
    if (fresh)
      this.data = {
        profile: {
          displayName: "Alex",
          onboardingVersion: 0,
          timezone: "Asia/Kolkata",
        },
        caps: [],
        expenses: [],
        periods: [],
      };
    this.data ||= demoData();
    this.listeners = [];
  }
  async start(onChange) {
    this.listeners.push(onChange);
    this.emit();
  }
  emit() {
    localStorage.setItem(DEMO_KEY, JSON.stringify(this.data));
    this.listeners.forEach((cb) => cb(structuredClone(this.data)));
  }
  async setup(caps) {
    this.data.caps = caps;
    this.data.profile.onboardingVersion = 2;
    this.emit();
  }
  async saveExpense(id, value) {
    const i = this.data.expenses.findIndex((e) => e.id === id);
    if (i >= 0)
      this.data.expenses[i] = {
        ...this.data.expenses[i],
        ...value,
        updatedAt: Date.now(),
      };
    else this.data.expenses.push({ id, ...value, createdAt: Date.now() });
    this.emit();
  }
  async createExpense(id, value) {
    if (this.data.expenses.some((e) => e.id === id && !e.deleted)) return false;
    await this.saveExpense(id, value);
    return true;
  }
  async deleteExpense(id) {
    const e = this.data.expenses.find((e) => e.id === id);
    if (e) e.deleted = true;
    this.emit();
  }
  async updateCap(cap, period) {
    const index = this.data.caps.findIndex((c) => c.id === cap.id);
    if (index < 0) this.data.caps.push(cap);
    else this.data.caps[index] = cap;
    this.data.periods = this.data.periods
      .filter((p) => p.id !== period.id)
      .concat(period);
    this.emit();
  }
  async flexCap(capId, month) {
    await this.ensurePeriods(month);
    const period = this.data.periods.find((p) => p.id === month + "_" + capId),
      before = { ...period };
    if (period.effectiveLimitMinor + 50000 > 100000000)
      throw new Error("This cap has reached the maximum supported amount.");
    period.effectiveLimitMinor += 50000;
    period.flexed = true;
    this.emit();
    return { before, after: { ...period } };
  }
  async undoFlex(before, after) {
    const current = this.data.periods.find((p) => p.id === after.id);
    if (current.effectiveLimitMinor !== after.effectiveLimitMinor)
      throw new Error("This cap changed again. Edit the cap to adjust it.");
    Object.assign(current, before);
    this.emit();
  }
  async ensurePeriods(month) {
    for (const c of this.data.caps)
      if (!this.data.periods.some((p) => p.id === month + "_" + c.id))
        this.data.periods.push({
          id: month + "_" + c.id,
          capId: c.id,
          monthKey: month,
          originalLimitMinor: c.limitMinor,
          effectiveLimitMinor: c.limitMinor,
          flexed: false,
        });
    this.emit();
  }
  async updateProfile(values) {
    Object.assign(this.data.profile, values);
    this.emit();
  }
  async signOut() {
    location.href = "index.html";
  }
  stop() {
    this.listeners = [];
  }
}

export async function connectStore() {
  const fresh = new URLSearchParams(location.search).get("fresh") === "1";
  if (fresh) history.replaceState(null, "", "dashboard.html");
  const store = new DemoStore(fresh);
  store.user = { uid: "test" };
  store.auth = { onAuthStateChanged() {} };
  return store;
}
