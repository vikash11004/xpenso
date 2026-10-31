import {
  PRESETS,
  money,
  minorUnits,
  localDay,
  capMetrics,
  streakDays,
  validateExpense,
} from "./domain.mjs";
import { connectStore } from "./store.mjs";
import { icon, hydrateIcons, escapeHTML as esc } from "./icons.mjs";
import { parseText, prepareImage, parseReceipt } from "./capture.mjs";
const $ = (selector) => document.querySelector(selector);
let store,
  state = { profile: {}, caps: [], periods: [], expenses: [] },
  limit = 8,
  search = "",
  paceId = "",
  periodKey = "",
  busy = false,
  mandatory = false,
  returnFocus,
  toastTimer,
  routeHandled = false,
  loaded = false;
const held = new Set();
const today = () =>
  localDay(new Date(), state.profile.timezone || "Asia/Kolkata");
const caps = () => state.caps.filter((c) => c.active !== false);
const expenses = () =>
  state.expenses.filter(
    (e) => !e.deleted && e.monthKey === today().slice(0, 7),
  );
const periodFor = (id) =>
  state.periods.find(
    (p) => p.capId === id && p.monthKey === today().slice(0, 7),
  );
const safeIcon = (c) => esc(c?.icon || "◌");
const tone = (c) =>
  ["sage", "peach", "blue", "lavender"].includes(c?.tone) ? c.tone : "sage";
const dateLabel = (day) =>
  day === today()
    ? "Today"
    : new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
      }).format(new Date(day + "T12:00:00Z"));
hydrateIcons();
function updateTheme() {
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
    const dark = document.documentElement.dataset.theme === "dark";
    b.innerHTML = icon(dark ? "sun" : "moon");
    b.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} theme`);
  });
}
updateTheme();
$("[data-theme-toggle]").addEventListener("click", () => {
  toggleTheme();
  updateTheme();
});
function toast(message, action, label = "Undo") {
  clearTimeout(toastTimer);
  $("#toast-text").textContent = message;
  $("#toast").hidden = false;
  const btn = $("#toast-action");
  btn.hidden = !action;
  btn.textContent = label;
  btn.disabled = false;
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      await action();
      $("#toast").hidden = true;
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false;
    }
  };
  toastTimer = setTimeout(
    () => ($("#toast").hidden = true),
    action ? 15000 : 6500,
  );
}
$("#toast-close").onclick = () => ($("#toast").hidden = true);
function openSheet(title, eyebrow, html, required = false) {
  const sheet = $("#sheet");
  mandatory = required;
  $("#sheet-title").textContent = title;
  $("#sheet-eyebrow").textContent = eyebrow;
  $("#sheet-body").innerHTML = html;
  $("#sheet-close").hidden = required;
  if (!sheet.open) {
    returnFocus = document.activeElement;
    sheet.showModal();
  }
}
function closeSheet() {
  if (mandatory || busy) return;
  $("#sheet").close();
}
$("#sheet-close").onclick = closeSheet;
$("#sheet").addEventListener("cancel", (e) => {
  if (mandatory || busy) e.preventDefault();
});
$("#sheet").addEventListener("click", (e) => {
  if (e.target === $("#sheet")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeSheet();
  }
});
$("#sheet").addEventListener("close", () => returnFocus?.focus?.());
function setBusy(value, message = "Working on it…") {
  busy = value;
  $("#sheet-body").inert = value;
  $("#workspace").inert = value;
  $("#sheet-close").disabled = value;
  $("#profile-button").disabled = value;
  $("#magic-input").disabled = value;
  $("#capture-dock").classList.toggle("is-busy", value);
  $("#capture-hint").textContent = value
    ? message
    : "Type it. Snap it. Get on with your day.";
  $("#magic-submit").disabled = value;
  $("#capture-button").disabled = value;
  $("#manual-button").disabled = value;
}
function render() {
  const active = caps(),
    records = expenses();
  $("#connection-state").hidden = true;
  $("#workspace").hidden = false;
  $("#capture-dock").hidden = false;
  $("#profile-button").textContent = (state.profile.displayName || "You")
    .slice(0, 1)
    .toUpperCase();
  $("#month-label").textContent = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: state.profile.timezone || "Asia/Kolkata",
  }).format(new Date());
  const metrics = active.map((c) =>
    capMetrics(c, records, periodFor(c.id), today()),
  );
  const remaining = metrics.reduce((n, m) => n + m.remaining, 0),
    spent = records.reduce((n, e) => n + e.amountMinor, 0);
  $("#overview-copy").innerHTML = active.length
    ? `<strong>${esc(money(Math.abs(remaining)))}</strong> ${remaining < 0 ? "over" : "left across"} your caps <span aria-hidden="true">·</span> ${esc(money(spent))} logged this month`
    : "A few small guardrails for the things you love.";
  $("#migration-note").hidden = !state.profile.migrationSkipped;
  $("#migration-note").textContent =
    `${state.profile.migrationSkipped || 0} older records couldn’t be imported because their amount or date was missing. Your original records are preserved.`;
  const streak = streakDays(active, records, state.periods, today());
  const nearEnd = Number(today().slice(-2)) >= 25;
  $("#streak").hidden = streak < 3;
  $("#streak").textContent = `✳ ${streak} days within caps`;
  $("#streak").title =
    "Based on logged spending and your original caps this month.";
  const rewardKey = `shield-reward-${store.user?.uid}-${today().slice(0, 7)}`;
  if (nearEnd && streak >= 7 && !sessionStorage.getItem(rewardKey)) {
    sessionStorage.setItem(rewardKey, "1");
    $("#streak").classList.add("streak-celebrate");
  }
  $("#caps-grid").innerHTML =
    active
      .map((cap, i) => {
        const m = metrics[i],
          isHeld = held.has(today().slice(0, 7) + cap.id);
        return `<article class="cap-card" data-state="${m.state}"><div class="cap-top"><span class="category-icon tone-${tone(cap)}" aria-hidden="true">${safeIcon(cap)}</span><button class="icon-button cap-edit" data-edit-cap="${esc(cap.id)}" aria-label="Edit ${esc(cap.name)} cap">${icon("sliders")}</button></div><h3 class="cap-name">${esc(cap.name)}</h3><p class="cap-amount">${esc(money(m.spent))} <small>of ${esc(money(m.limit))}</small></p><div class="cap-track" role="progressbar" aria-label="${esc(cap.name)} spending" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(m.percent, 100)}" aria-valuetext="${m.percent}% used, ${esc(money(m.spent))} of ${esc(money(m.limit))}"><span style="width:${Math.min(100, m.percent)}%"></span></div><div class="cap-bottom"><strong>${m.remaining < 0 ? `${esc(money(-m.remaining))} over` : m.remaining === 0 ? "Cap reached" : `${esc(money(m.remaining))} left`}</strong><span>${m.state === "near" ? "Getting close" : `${m.percent}% used`}</span></div>${m.state === "over" && !isHeld ? `<div class="cap-flex"><p>A little more room this month?</p><div class="cap-flex-actions"><button data-flex="${esc(cap.id)}">Add ₹500</button><button data-hold="${esc(cap.id)}">Hold the line</button></div></div>` : ""}</article>`;
      })
      .join("") ||
    `<div class="empty-state"><h3>Start with one small cap.</h3><p>Choose an everyday category you’d like to keep an eye on.</p><button class="button button-primary" id="empty-setup">Set up my caps</button></div>`;
  $("#empty-setup")?.addEventListener("click", () => setup());
  $("#caps-grid")
    .querySelectorAll("[data-edit-cap]")
    .forEach((b) => (b.onclick = () => editCap(b.dataset.editCap)));
  $("#caps-grid")
    .querySelectorAll("[data-flex]")
    .forEach((b) => (b.onclick = () => flexCap(b.dataset.flex, b)));
  $("#caps-grid")
    .querySelectorAll("[data-hold]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          held.add(today().slice(0, 7) + b.dataset.hold);
          render();
          toast(
            "Holding the line. You can still log spending and edit this cap.",
          );
        }),
    );
  renderFeed();
  renderPace();
  if (state.profile.onboardingVersion !== 2 && !$("#sheet").open) setup(true);
  if (!routeHandled && state.profile.onboardingVersion === 2) {
    routeHandled = true;
    if (location.hash === "#caps") setup();
    if (location.hash === "#account") accountSheet();
  }
  const key =
    today().slice(0, 7) +
    "|" +
    active
      .map((c) => c.id)
      .sort()
      .join(",");
  if (key !== periodKey && active.length) {
    periodKey = key;
    store.ensurePeriods(today().slice(0, 7)).catch((e) => {
      periodKey = "";
      toast("Couldn’t prepare this month’s caps. " + e.message);
    });
  }
}
function renderFeed() {
  const filtered = expenses()
    .filter((e) =>
      `${e.merchant} ${state.caps.find((c) => c.id === e.capId)?.name || "Uncapped"}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        b.occurredOn.localeCompare(a.occurredOn) ||
        (b.createdAt || 0) - (a.createdAt || 0),
    );
  $("#spend-count").textContent = filtered.length;
  if (!filtered.length) {
    $("#spend-feed").innerHTML =
      `<div class="empty-state"><div class="empty-symbol">${icon("receipt")}</div><h3>${search ? "Nothing here just yet." : "Your fresh start looks good."}</h3><p>${search ? "Try another merchant or category." : "A coffee, a cab, a little treat. Log your first expense and make yourself at home."}</p>${search ? "" : '<button class="button" id="first-spend">Log my first spend</button>'}</div>`;
    $("#first-spend")?.addEventListener("click", () => expenseSheet());
  } else {
    let previous = "";
    $("#spend-feed").innerHTML = filtered
      .slice(0, limit)
      .map((e) => {
        const c = state.caps.find((c) => c.id === e.capId),
          day =
            e.occurredOn !== previous
              ? `<p class="day-label">${esc(dateLabel(e.occurredOn).toUpperCase())}</p>`
              : "";
        previous = e.occurredOn;
        return `${day}<div class="spend-row"><span class="merchant-icon" aria-hidden="true">${esc(e.merchant.slice(0, 2).toUpperCase())}</span><div class="spend-info"><strong>${esc(e.merchant)}</strong><p>${safeIcon(c)} ${esc(c?.name || "Uncapped")}${e.source === "receipt" ? " · Receipt" : ""}</p></div><span class="spend-amount">${esc(money(e.amountMinor))}</span><button class="icon-button" data-edit-expense="${esc(e.id)}" aria-label="Edit ${esc(e.merchant)} expense">${icon("edit")}</button></div>`;
      })
      .join("");
    $("#spend-feed")
      .querySelectorAll("[data-edit-expense]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            expenseSheet(
              state.expenses.find((e) => e.id === b.dataset.editExpense),
              true,
            )),
      );
  }
  $("#show-more").hidden = filtered.length <= limit;
}
$("#show-more").onclick = () => {
  limit += 10;
  renderFeed();
};
$("#search-toggle").onclick = () => {
  const input = $("#spend-search");
  input.hidden = !input.hidden;
  if (!input.hidden) input.focus();
  else {
    input.value = "";
    search = "";
    renderFeed();
  }
};
$("#spend-search").oninput = (e) => {
  search = e.target.value;
  limit = 8;
  renderFeed();
};
function renderPace() {
  const active = caps();
  if (!active.some((c) => c.id === paceId)) paceId = active[0]?.id || "";
  $("#pace-cap").innerHTML = active
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
    .join("");
  $("#pace-cap").value = paceId;
  const cap = active.find((c) => c.id === paceId);
  if (!cap) {
    $("#pace-message").textContent = "A little clarity starts here.";
    $("#pace-detail").textContent = "Choose your caps to find your rhythm.";
    $("#spending-chart").innerHTML = "";
    return;
  }
  const m = capMetrics(cap, expenses(), periodFor(cap.id), today());
  let headline, detail;
  if (m.remaining <= 0) {
    headline = "Your cap has done its job.";
    detail = `You’ve logged ${money(m.spent)} in ${cap.name.toLowerCase()}. Hold the line, or make a little room.`;
  } else if (m.items.length < 3 || m.observedDays < 3) {
    headline = "Your rhythm is taking shape.";
    detail = `${money(m.remaining)} left for ${cap.name.toLowerCase()}. A few more entries will help us estimate your pace.`;
  } else {
    const units =
      cap.id === "coffee"
        ? ["coffee stop", "coffee stops"]
        : cap.id === "eating-out"
          ? ["meal out", "meals out"]
          : cap.id === "transport"
            ? ["journey", "journeys"]
            : ["purchase", "purchases"];
    headline = `Room for about ${m.visits} more ${units[m.visits === 1 ? 0 : 1]}.`;
    detail = `At your average ${money(Math.round(m.spent / m.items.length))} per spend. ${m.daysLeft} ${m.daysLeft === 1 ? "day" : "days"} left this month${m.runway < m.daysLeft ? `; about ${m.runway} ${m.runway === 1 ? "day" : "days"} of allowance at this pace` : "."}`;
  }
  $("#pace-message").textContent = headline;
  $("#pace-detail").textContent = detail;
  const day = Number(today().slice(-2));
  let running = 0;
  const cumulative = Array.from({ length: day }, (_, i) => {
    running += m.items
      .filter((e) => Number(e.occurredOn.slice(-2)) === i + 1)
      .reduce((n, e) => n + e.amountMinor, 0);
    return running;
  });
  const maximum = Math.max(m.limit, m.spent, 1);
  const capTop = (1 - m.limit / maximum) * 100;
  $("#spending-chart").setAttribute("role", "img");
  $("#spending-chart").setAttribute(
    "aria-label",
    `Cumulative ${cap.name} spending this month: ${money(m.spent)} against a ${money(m.limit)} cap.`,
  );
  $("#spending-chart").innerHTML =
    `<div class="chart-cap-line" style="top:${capTop}%"><span>${esc(money(m.limit))} cap</span></div>` +
    cumulative
      .map(
        (v, i) =>
          `<span class="chart-bar" style="height:${Math.max(2, (v / maximum) * 100)}%" title="Day ${i + 1}: ${esc(money(v))}" aria-hidden="true"></span>`,
      )
      .join("");
}
$("#pace-cap").onchange = (e) => {
  paceId = e.target.value;
  renderPace();
};
function setup(required = false) {
  const existing = caps(),
    options = [
      ...state.caps,
      ...PRESETS.filter((p) => !state.caps.some((c) => c.id === p.id)),
    ];
  const selected = new Set(
    existing.length ? existing.map((c) => c.id) : ["eating-out", "coffee"],
  );
  const values = new Map(
    options.map((c) => [
      c.id,
      (periodFor(c.id)?.effectiveLimitMinor ?? c.limitMinor) / 100,
    ]),
  );
  openSheet(
    required ? "Your money. Your boundaries." : "Make a little room.",
    required ? "A FRESH START · ABOUT 30 SECONDS" : "YOUR MONTHLY GUARDRAILS",
    `<p class="sheet-body-copy">Pick the everyday things you want to keep an eye on. Set a monthly cap that feels right for you.</p><div class="chip-group" id="setup-chips"></div><form id="setup-form"><div class="setup-rows" id="setup-rows"></div><p class="field-error" id="setup-error" role="alert"></p><button class="button button-primary button-full" type="submit">${required ? "Start tracking" : "Save my caps"} ${icon("arrow-right")}</button><p class="sheet-hint">No salary questions. No spreadsheets. Just a little clarity.</p></form>`,
    required,
  );
  const draw = () => {
    $("#setup-chips").innerHTML = options
      .map(
        (c) =>
          `<button type="button" class="chip" data-id="${esc(c.id)}" aria-pressed="${selected.has(c.id)}">${safeIcon(c)} ${esc(c.name)}</button>`,
      )
      .join("");
    $("#setup-rows").innerHTML = options
      .filter((c) => selected.has(c.id))
      .map(
        (c) =>
          `<label class="cap-setup-row"><span>${esc(c.name)} <span class="muted">/ month</span></span><span aria-hidden="true">₹</span><input data-limit="${esc(c.id)}" aria-label="${esc(c.name)} monthly cap in rupees" inputmode="decimal" value="${esc(values.get(c.id))}" required></label>`,
      )
      .join("");
    $("#setup-chips")
      .querySelectorAll("button")
      .forEach(
        (b) =>
          (b.onclick = () => {
            selected.has(b.dataset.id)
              ? selected.delete(b.dataset.id)
              : selected.add(b.dataset.id);
            draw();
          }),
      );
    $("#setup-rows")
      .querySelectorAll("input")
      .forEach(
        (el) => (el.oninput = () => values.set(el.dataset.limit, el.value)),
      );
  };
  draw();
  const custom = document.createElement("details");
  custom.className = "custom-category";
  custom.innerHTML = `<summary>Add a category</summary><form id="custom-category-form"><label class="form-field"><span class="form-label">Category name</span><input class="field-input" id="custom-category-name" placeholder="Groceries, fitness, subscriptions…" maxlength="60" required></label><label class="form-field"><span class="form-label">Monthly cap (₹)</span><input class="field-input" id="custom-category-limit" placeholder="2000" inputmode="decimal" required></label><label class="form-field"><span class="form-label">Icon</span><select class="field-input" id="custom-category-icon" aria-label="Category icon"><option>🏷️</option><option>🛒</option><option>💪</option><option>🏠</option><option>🎮</option><option>📚</option><option>💊</option><option>🎬</option><option>🐾</option></select></label><p class="field-error" id="custom-category-error" role="alert"></p><button class="button" type="submit">Add to my caps</button></form>`;
  $("#setup-chips").after(custom);
  custom.insertAdjacentHTML(
    "afterend",
    '<p id="custom-category-status" class="sheet-hint" role="status"></p>',
  );
  $("#custom-category-form").onsubmit = (event) => {
    event.preventDefault();
    try {
      const name = $("#custom-category-name").value.trim().replace(/\s+/g, " ");
      if (!name) throw new Error("Give your category a name.");
      if (
        options.some(
          (c) => c.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      )
        throw new Error("That category already exists. Select its chip above.");
      const limitMinor = minorUnits($("#custom-category-limit").value);
      const category = {
        id: "custom_" + crypto.randomUUID(),
        name,
        icon: $("#custom-category-icon").value,
        limitMinor,
        tone: "sage",
      };
      options.push(category);
      selected.add(category.id);
      values.set(category.id, limitMinor / 100);
      draw();
      event.target.reset();
      $("#custom-category-error").textContent = "";
      custom.open = false;
      $("#custom-category-status").textContent =
        "Category added. Save your caps to keep it.";
      $("#setup-rows").querySelector(`[data-limit="${category.id}"]`).focus();
    } catch (error) {
      $("#custom-category-error").textContent = error.message;
    }
  };
  $("#setup-form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    setBusy(true, "Saving your changes…");
    try {
      if (!selected.size)
        throw new Error("Choose at least one cap to get started.");
      const chosen = options
        .filter((c) => selected.has(c.id))
        .map((c) => ({
          ...c,
          limitMinor: minorUnits(values.get(c.id)),
          active: true,
          startedOn: c.active === false ? today() : c.startedOn || today(),
        }));
      if (required || !existing.length) await store.setup(chosen);
      else {
        for (const next of chosen) {
          const old = state.caps.find((c) => c.id === next.id) || next;
          await store.updateCap(next, makePeriod(old, next.limitMinor));
        }
        for (const old of existing.filter((c) => !selected.has(c.id)))
          await store.updateCap(
            { ...old, active: false },
            makePeriod(
              old,
              periodFor(old.id)?.effectiveLimitMinor ?? old.limitMinor,
            ),
          );
      }
      mandatory = false;
      $("#sheet").close();
      toast(
        required
          ? "Your caps are ready. Here’s to a little more clarity."
          : "Caps updated. New limits also apply next month.",
      );
    } catch (error) {
      $("#setup-error").textContent = error.message;
    } finally {
      button.disabled = false;
      setBusy(false);
    }
  };
}
$("#manage-caps").onclick = () => setup();
function makePeriod(cap, limitMinor) {
  const old = periodFor(cap.id);
  return {
    id: today().slice(0, 7) + "_" + cap.id,
    capId: cap.id,
    monthKey: today().slice(0, 7),
    originalLimitMinor: old?.originalLimitMinor ?? cap.limitMinor,
    effectiveLimitMinor: limitMinor,
    flexed:
      old?.flexed || limitMinor > (old?.originalLimitMinor ?? cap.limitMinor),
  };
}
function editCap(id) {
  const cap = state.caps.find((c) => c.id === id),
    m = capMetrics(cap, expenses(), periodFor(id), today());
  openSheet(
    cap.name,
    "A LITTLE FLEXIBILITY",
    `<p class="sheet-body-copy">Give this month a little breathing room. Your original cap stays on record.</p><form id="edit-cap-form"><label class="form-label" for="cap-limit">Monthly cap</label><div class="amount-entry"><span>₹</span><input id="cap-limit" inputmode="decimal" value="${m.limit / 100}" required></div><label class="form-label"><input id="cap-default" type="checkbox"> Use this limit for future months too</label><p class="field-error" id="cap-error" role="alert"></p><button class="button button-primary button-full">Save cap</button></form>`,
  );
  $("#edit-cap-form").onsubmit = async (e) => {
    e.preventDefault();
    e.submitter.disabled = true;
    setBusy(true, "Saving your changes…");
    try {
      const value = minorUnits($("#cap-limit").value);
      await store.updateCap(
        {
          ...cap,
          limitMinor: $("#cap-default").checked ? value : cap.limitMinor,
        },
        makePeriod(cap, value),
      );
      $("#sheet").close();
      toast("Cap updated. A little room, on your terms.");
    } catch (error) {
      $("#cap-error").textContent = error.message;
    } finally {
      e.submitter.disabled = false;
      setBusy(false);
    }
  };
}
async function flexCap(id, button) {
  button.disabled = true;
  try {
    const { before, after } = await store.flexCap(id, today().slice(0, 7));
    toast("₹500 more room, just for this month.", () =>
      store.undoFlex(before, after),
    );
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}
function expenseSheet(draft = {}, editing = false) {
  const id = editing
    ? draft.id
    : draft.receiptHash
      ? "receipt_" + draft.receiptHash
      : crypto.randomUUID();
  let selected = draft.capId || "";
  const image = draft.preview;
  openSheet(
    editing
      ? "A quick little edit."
      : draft.source === "receipt"
        ? "Check your receipt."
        : "One little spend.",
    editing
      ? "YOUR SPENDING, YOUR CALL"
      : draft.note
        ? "QUICK REVIEW"
        : "LOG IT & LET IT GO",
    `${image ? '<img id="receipt-preview" class="receipt-preview" alt="Your uploaded receipt">' : ""}${draft.note ? `<p class="sheet-body-copy">${esc(draft.note)}</p>` : ""}<form id="expense-form"><label class="form-label" for="expense-amount">Amount spent</label><div class="amount-entry"><span>₹</span><input id="expense-amount" placeholder="0" value="${draft.amountMinor ? draft.amountMinor / 100 : ""}" inputmode="decimal" autocomplete="off" required></div><p class="form-label">Put it toward a cap</p><div class="chip-group" id="expense-chips"></div><label class="form-field"><span class="form-label">Where was it? <span class="muted">(optional)</span></span><input id="expense-merchant" class="field-input" maxlength="120" placeholder="Coffee, a cab, a little treat…" value="${esc(draft.merchant || "")}"></label><label class="form-field"><span class="form-label">When</span><input id="expense-date" class="field-input" type="date" min="2000-01-01" max="${today()}" value="${esc(draft.occurredOn || today())}" required></label><p class="field-error" id="expense-error" role="alert"></p><button class="button button-primary button-full" type="submit">${editing ? "Save changes" : "Log spending"} ${icon("check")}</button>${editing ? '<button class="button button-danger button-full" type="button" id="delete-expense" style="margin-top:10px">Remove this expense</button>' : ""}</form>`,
  );
  if (image) $("#receipt-preview").src = image;
  const drawChips = () => {
    $("#expense-chips").innerHTML = [
      ...caps(),
      { id: "", name: "Uncapped", icon: "◌" },
    ]
      .map(
        (c) =>
          `<button type="button" class="chip" data-cap="${esc(c.id)}" aria-pressed="${selected === c.id}">${safeIcon(c)} ${esc(c.name)}</button>`,
      )
      .join("");
    $("#expense-chips")
      .querySelectorAll("button")
      .forEach(
        (b) =>
          (b.onclick = () => {
            selected = b.dataset.cap;
            drawChips();
          }),
      );
  };
  drawChips();
  $("#expense-form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    setBusy(true, "Saving your changes…");
    try {
      const value = validateExpense(
        {
          amountMinor: minorUnits($("#expense-amount").value),
          merchant: $("#expense-merchant").value,
          capId: selected,
          occurredOn: $("#expense-date").value,
          source: draft.source || "manual",
          receiptHash: draft.receiptHash || "",
        },
        today(),
      );
      if (editing) await store.saveExpense(id, value);
      else if (!(await store.createExpense(id, value)))
        throw new Error(
          "This receipt is already logged. Edit the existing expense in your spending stream.",
        );
      $("#sheet").close();
      $("#magic-input").value = "";
      const moved = value.monthKey !== today().slice(0, 7);
      toast(
        `${editing ? "Updated" : "Logged"} ${money(value.amountMinor)}${moved ? " in " + value.monthKey : ""}.`,
        editing
          ? () => store.saveExpense(id, draft)
          : () => store.deleteExpense(id),
      );
    } catch (error) {
      $("#expense-error").textContent = error.message;
    } finally {
      button.disabled = false;
      setBusy(false);
    }
  };
  $("#delete-expense")?.addEventListener("click", async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    setBusy(true, "Removing this expense…");
    try {
      await store.deleteExpense(id);
      $("#sheet").close();
      toast("Expense removed.", () =>
        store.saveExpense(id, { ...draft, deleted: false }),
      );
    } catch (error) {
      $("#expense-error").textContent = error.message;
    } finally {
      button.disabled = false;
      setBusy(false);
    }
  });
  if (!draft.amountMinor) setTimeout(() => $("#expense-amount")?.focus(), 100);
}
$("#manual-button").onclick = () => expenseSheet();
async function acceptParsed(draft) {
  const possible = expenses().find(
    (e) =>
      e.amountMinor === draft.amountMinor &&
      e.occurredOn === draft.occurredOn &&
      e.merchant.toLowerCase() === draft.merchant.toLowerCase(),
  );
  if (draft.needsReview || possible) {
    expenseSheet({
      ...draft,
      note: possible
        ? "A similar expense is already logged. Save only if this is a different purchase."
        : draft.note,
    });
    return;
  }
  const value = validateExpense(draft, today()),
    id = draft.receiptHash
      ? "receipt_" + draft.receiptHash
      : crypto.randomUUID();
  if (!(await store.createExpense(id, value)))
    throw new Error(
      "This receipt is already logged. Edit the existing expense in your spending stream.",
    );
  $("#magic-input").value = "";
  if ($("#sheet").open) $("#sheet").close();
  toast(`${money(value.amountMinor)} at ${value.merchant}. Logged.`, () =>
    store.deleteExpense(id),
  );
}
$("#magic-form").onsubmit = async (e) => {
  e.preventDefault();
  if (busy || !store) return;
  const text = $("#magic-input").value.trim();
  if (!text) return;
  setBusy(true, "Finding the little details…");
  try {
    const parsed = await parseText(text, store, caps(), today());
    await acceptParsed(parsed);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
  }
};
function captureSheet() {
  openSheet(
    "Snap it. Then forget it.",
    "RECEIPTS, BILLS & UPI SCREENSHOTS",
    `<div class="upload-zone" id="upload-zone">${icon("receipt")}<h3>Drop the little details here.</h3><p>A clear photo of the total and merchant is all we need.</p><div class="upload-buttons"><button class="button button-primary" id="take-photo">${icon("camera")} Take a photo</button><button class="button" id="choose-file">${icon("upload")} Upload</button></div><input id="receipt-camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden><input id="receipt-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></div><p class="sheet-hint">JPG, PNG or WebP · up to 12 MB. We don’t save images to your account.</p><p class="field-error" id="receipt-error" role="alert"></p><button class="text-button button-full" id="receipt-manual">Or just enter an amount</button>`,
  );
  $("#take-photo").onclick = () => $("#receipt-camera").click();
  $("#choose-file").onclick = () => $("#receipt-file").click();
  $("#receipt-manual").onclick = () => expenseSheet();
  for (const selector of ["#receipt-camera", "#receipt-file"])
    $(selector).onchange = (e) => {
      if (e.target.files[0]) readReceipt(e.target.files[0]);
    };
  const zone = $("#upload-zone");
  zone.ondragover = (e) => {
    e.preventDefault();
    zone.classList.add("is-dragging");
  };
  zone.ondragleave = () => zone.classList.remove("is-dragging");
  zone.ondrop = (e) => {
    e.preventDefault();
    zone.classList.remove("is-dragging");
    if (e.dataTransfer.files[0]) readReceipt(e.dataTransfer.files[0]);
  };
}
async function readReceipt(file) {
  if (busy) return;
  setBusy(true, "Reading your receipt…");
  $("#receipt-error").textContent = "Reading your receipt…";
  $("#take-photo").disabled = true;
  $("#choose-file").disabled = true;
  let prepared;
  try {
    prepared = await prepareImage(file);
    if (
      state.expenses.some(
        (e) => !e.deleted && e.receiptHash === prepared.receiptHash,
      )
    )
      throw new Error(
        "This receipt is already logged. You can edit it in your recent spending.",
      );
    const result = await parseReceipt(prepared, store, caps(), today());
    await acceptParsed({ ...result, preview: prepared.dataURL });
  } catch (error) {
    if (prepared && !error.message.includes("already logged"))
      expenseSheet({
        source: "receipt",
        preview: prepared.dataURL,
        receiptHash: prepared.receiptHash,
        note: error.message,
      });
    else $("#receipt-error").textContent = error.message;
  } finally {
    setBusy(false);
    if ($("#take-photo")) $("#take-photo").disabled = false;
    if ($("#choose-file")) $("#choose-file").disabled = false;
  }
}
$("#capture-button").onclick = captureSheet;
function accountSheet() {
  openSheet(
    "Make yourself at home.",
    "YOUR SPACE",
    `<p class="account-email">${esc(store.user?.email || "")}</p><form id="profile-form"><label class="form-field"><span class="form-label">Your name</span><input id="profile-name" class="field-input" maxlength="60" value="${esc(state.profile.displayName || "")}"></label><p class="field-error" id="profile-error" role="alert"></p><button class="button button-full">Save name</button></form><div class="account-actions" style="margin-top:20px"><button class="button" id="account-caps">Manage spending caps</button><button class="button button-danger" id="signout">Sign out</button></div><p class="sheet-hint">INR · India Standard Time. Your caps reset each calendar month.</p>`,
  );
  $("#account-caps").onclick = () => setup();
  $("#signout")?.addEventListener("click", async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    setBusy(true, "Signing out…");
    try {
      await store.signOut();
    } catch (error) {
      $("#profile-error").textContent = error.message;
    } finally {
      button.disabled = false;
      setBusy(false);
    }
  });
  $("#profile-form").onsubmit = async (e) => {
    e.preventDefault();
    e.submitter.disabled = true;
    setBusy(true, "Saving your changes…");
    try {
      await store.updateProfile({
        displayName: $("#profile-name").value.trim(),
      });
      $("#sheet").close();
      toast("A little more you. Name saved.");
    } catch (error) {
      $("#profile-error").textContent = error.message;
    } finally {
      e.submitter.disabled = false;
      setBusy(false);
    }
  };
}
$("#profile-button").onclick = () => store && accountSheet();
async function boot() {
  try {
    store = await connectStore();
    if (!store) return;
    await store.start(
      (data) => {
        state = data;
        loaded = true;
        render();
      },
      (error) => {
        if ($("#workspace").hidden) connectionError(error);
        else toast("Couldn’t sync your spending. " + error.message);
      },
    );
    store.auth.onAuthStateChanged((user) => {
      if (!user) {
        store.stop();
        location.replace("signin.html");
      }
    });
    setInterval(() => {
      if (loaded) render();
    }, 60000);
  } catch (error) {
    connectionError(error);
  }
}
function connectionError(error) {
  $("#connection-state").hidden = false;
  $("#connection-state").innerHTML =
    `${icon("info")}<h2>Your space is taking a moment.</h2><p>${esc(error.message)}</p><div class="sheet-actions"><a class="button button-primary" href="signin.html">Sign in</a><button class="button" id="retry">Try again</button></div>`;
  $("#retry").onclick = () => location.reload();
}
window.addEventListener("offline", () =>
  toast("You’re offline. Reconnect before saving or parsing a spend."),
);
window.addEventListener("online", () =>
  toast("Back online. Your space is reconnecting."),
);
window.addEventListener("beforeunload", () => store?.stop());
boot();
