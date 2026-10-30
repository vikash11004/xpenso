import { PRESETS, localDay, migrateTransaction } from "./domain.mjs";
import { getFirebase, ensureProfile } from "./firebase.mjs";
const DEMO_KEY = "xpenso-shield-demo-v2";
function expenseFields(value) {
  const keys = [
    "amountMinor",
    "merchant",
    "capId",
    "occurredOn",
    "monthKey",
    "currency",
    "source",
    "receiptHash",
    "deleted",
    "schemaVersion",
    "createdAt",
    "legacyId",
    "legacyCategory",
  ];
  return Object.fromEntries(
    keys.filter((k) => value[k] !== undefined).map((k) => [k, value[k]]),
  );
}
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
export class FirebaseStore {
  constructor(services, user) {
    Object.assign(this, services);
    this.user = user;
    this.root = this.db.collection("users").doc(user.uid);
    this.unsub = [];
    this.data = { profile: {}, caps: [], expenses: [], periods: [] };
  }
  async migrate(profile) {
    if (profile.schemaVersion === 2) return;
    const [categories, transactions] = await Promise.all([
      this.root.collection("budgetCategories").get(),
      this.root.collection("transactions").get(),
    ]);
    const caps = categories.docs
      .filter((d) => Number(d.data().budget) > 0)
      .map((d) => ({
        id: "legacy_" + d.id,
        name: String(d.data().name || "Everyday").slice(0, 60),
        icon: "◌",
        limitMinor: Math.min(
          100000000,
          Math.round(Number(d.data().budget) * 100),
        ),
        tone: "sage",
        active: true,
        startedOn: localDay(),
      }));
    for (const cap of caps)
      await this.db.runTransaction(async (tx) => {
        const ref = this.root.collection("caps").doc(cap.id);
        if (!(await tx.get(ref)).exists) tx.set(ref, cap);
      });
    let skipped = 0;
    for (const doc of transactions.docs) {
      const expense = migrateTransaction(
        doc.id,
        doc.data(),
        caps,
        profile.timezone || "Asia/Kolkata",
      );
      if (!expense) {
        if (doc.data().type !== "income") skipped++;
        continue;
      }
      const { id, ...value } = expense;
      await this.db.runTransaction(async (tx) => {
        const ref = this.root.collection("expenses").doc(id);
        if (!(await tx.get(ref)).exists)
          tx.set(ref, { ...value, createdAt: Date.now() });
      });
    }
    // Old documents remain intact; all imported IDs are deterministic and safe to retry.
    await this.root.set(
      {
        schemaVersion: 2,
        migrationSkipped: skipped,
        ...(caps.length ? { onboardingVersion: 2 } : {}),
      },
      { merge: true },
    );
  }
  async start(onChange, onError) {
    const profile = await ensureProfile(this.user, this.db);
    await this.migrate(profile);
    this.data.profile = (await this.root.get()).data();
    let ready = new Set();
    const emit = (key) => {
      ready.add(key);
      if (ready.size === 4) onChange(structuredClone(this.data));
    };
    this.unsub.push(
      this.root.onSnapshot((s) => {
        this.data.profile = s.data();
        emit("profile");
      }, onError),
    );
    this.unsub.push(
      this.root.collection("caps").onSnapshot((s) => {
        this.data.caps = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        emit("caps");
      }, onError),
    );
    this.month = localDay(
      new Date(),
      this.data.profile.timezone || "Asia/Kolkata",
    ).slice(0, 7);
    const watchMonth = () => {
      this.monthStops?.forEach((fn) => fn());
      ready.delete("expenses");
      ready.delete("periods");
      this.monthStops = ["expenses", "capMonths"].map((collection, i) =>
        this.root
          .collection(collection)
          .where("monthKey", "==", this.month)
          .onSnapshot((s) => {
            const key = i ? "periods" : "expenses";
            this.data[key] = s.docs.map((d) => ({ id: d.id, ...d.data() }));
            emit(key);
          }, onError),
      );
    };
    watchMonth();
    this.timer = setInterval(() => {
      const current = localDay(
        new Date(),
        this.data.profile.timezone || "Asia/Kolkata",
      ).slice(0, 7);
      if (current !== this.month) {
        this.month = current;
        watchMonth();
      }
    }, 30000);
  }
  async setup(caps) {
    this.online();
    const batch = this.db.batch();
    caps.forEach((c) => batch.set(this.root.collection("caps").doc(c.id), c));
    batch.set(this.root, { onboardingVersion: 2 }, { merge: true });
    await batch.commit();
  }
  online() {
    if (!navigator.onLine)
      throw new Error("Reconnect before saving. Your entry is still here.");
  }
  async saveExpense(id, value) {
    this.online();
    await this.root
      .collection("expenses")
      .doc(id)
      .set({ ...expenseFields(value), updatedAt: Date.now() }, { merge: true });
  }
  async createExpense(id, value) {
    this.online();
    const ref = this.root.collection("expenses").doc(id);
    return this.db.runTransaction(async (tx) => {
      const old = await tx.get(ref);
      if (old.exists && !old.data().deleted) return false;
      tx.set(ref, { ...expenseFields(value), createdAt: Date.now() });
      return true;
    });
  }
  async deleteExpense(id) {
    this.online();
    await this.root
      .collection("expenses")
      .doc(id)
      .update({ deleted: true, updatedAt: Date.now() });
  }
  async ensurePeriods(month) {
    for (const c of this.data.caps.filter((c) => c.active !== false)) {
      const ref = this.root.collection("capMonths").doc(month + "_" + c.id);
      await this.db.runTransaction(async (tx) => {
        if (!(await tx.get(ref)).exists)
          tx.set(ref, {
            capId: c.id,
            monthKey: month,
            originalLimitMinor: c.limitMinor,
            effectiveLimitMinor: c.limitMinor,
            flexed: false,
          });
      });
    }
  }
  async updateCap(cap, period) {
    this.online();
    const batch = this.db.batch();
    batch.set(this.root.collection("caps").doc(cap.id), cap);
    const { id, ...values } = period;
    batch.set(this.root.collection("capMonths").doc(id), values);
    await batch.commit();
  }
  async flexCap(capId, month) {
    this.online();
    const id = month + "_" + capId,
      ref = this.root.collection("capMonths").doc(id);
    return this.db.runTransaction(async (tx) => {
      const [saved, cap] = await Promise.all([
        tx.get(ref),
        tx.get(this.root.collection("caps").doc(capId)),
      ]);
      if (!cap.exists) throw new Error("This cap no longer exists.");
      const before = {
        id,
        ...(saved.exists
          ? saved.data()
          : {
              capId,
              monthKey: month,
              originalLimitMinor: cap.data().limitMinor,
              effectiveLimitMinor: cap.data().limitMinor,
              flexed: false,
            }),
      };
      const after = {
        ...before,
        effectiveLimitMinor: before.effectiveLimitMinor + 50000,
        flexed: true,
      };
      if (after.effectiveLimitMinor > 100000000)
        throw new Error("This cap has reached the maximum supported amount.");
      const { id: _, ...data } = after;
      tx.set(ref, data);
      return { before, after };
    });
  }
  async undoFlex(before, after) {
    this.online();
    const ref = this.root.collection("capMonths").doc(after.id);
    await this.db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.data()?.effectiveLimitMinor !== after.effectiveLimitMinor)
        throw new Error("This cap changed again. Edit the cap to adjust it.");
      const { id, ...value } = before;
      tx.set(ref, value);
    });
  }
  async updateProfile(values) {
    this.online();
    await this.root.set(values, { merge: true });
  }
  async signOut() {
    this.stop();
    await this.auth.signOut();
    location.href = "signin.html";
  }
  stop() {
    this.unsub.forEach((fn) => fn());
    this.monthStops?.forEach((fn) => fn());
    clearInterval(this.timer);
  }
}
export async function connectStore(demo, fresh) {
  if (demo) return new DemoStore(fresh);
  const services = await getFirebase();
  const user = await new Promise((resolve) => {
    const unsub = services.auth.onAuthStateChanged((u) => {
      unsub();
      resolve(u);
    });
  });
  if (!user) {
    location.replace("signin.html");
    return null;
  }
  return new FirebaseStore(services, user);
}
