import { localDay, migrateTransaction } from "./domain.mjs";
import { getFirebase, ensureProfile } from "./firebase.mjs";
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
export async function connectStore() {
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
