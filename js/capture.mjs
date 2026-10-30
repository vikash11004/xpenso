import { parseQuickText, validDay, MAX_AMOUNT } from "./domain.mjs";
export async function parseText(text, store, caps, today) {
  const fallback = parseQuickText(text, caps, today);
  if (store instanceof Object && store.functions) {
    try {
      const { data } = await store.functions.httpsCallable("parseSpend", {
        timeout: 45000,
      })({
        text,
        today,
        timezone: store.data.profile.timezone || "Asia/Kolkata",
      });
      return { ...validateParsed(data, caps, today), source: "text" };
    } catch (error) {
      if (
        error.code === "functions/invalid-argument" ||
        error.code === "functions/failed-precondition"
      )
        throw new Error(error.message);
      return {
        ...fallback,
        note: "AI parsing is unavailable. Check this quick suggestion before saving.",
      };
    }
  }
  return {
    ...fallback,
    note: "Review the suggested details, then save.",
  };
}
export function validateParsed(data, caps, today) {
  if (
    !data ||
    data.direction !== "outflow" ||
    data.paymentStatus !== "completed"
  )
    throw new Error(
      "This doesn’t look like completed spending. Please check the payment or enter an amount manually.",
    );
  const amountMinor =
    Number.isInteger(data.amountMinor) &&
    data.amountMinor > 0 &&
    data.amountMinor <= MAX_AMOUNT
      ? data.amountMinor
      : null;
  const capId = caps.some((c) => c.id === data.capId) ? data.capId : "";
  const occurredOn =
    validDay(data.occurredOn) && data.occurredOn <= today
      ? data.occurredOn
      : today;
  return {
    amountMinor,
    merchant: String(data.merchant || "").slice(0, 120),
    capId,
    occurredOn,
    needsReview:
      data.needsReview !== false ||
      !amountMinor ||
      !capId ||
      occurredOn !== data.occurredOn,
    receiptHash: data.receiptHash || "",
  };
}
export async function prepareImage(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Choose a JPG, PNG, or WebP image. Convert HEIC or PDF files to an image first.",
    );
  if (file.size > 12 * 1024 * 1024)
    throw new Error("Choose an image smaller than 12 MB.");
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const receiptHash = [...new Uint8Array(hashBuffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataURL = canvas.toDataURL("image/jpeg", 0.88);
  if (dataURL.length > 5 * 1024 * 1024)
    throw new Error(
      "This image is too large to read. Crop it to the payment details.",
    );
  return { dataURL, image: dataURL.split(",")[1], receiptHash };
}
export async function parseReceipt(prepared, store, caps, today) {
  if (!store.functions)
    throw new Error(
      "Receipt parsing needs a signed-in account. Enter the amount manually while reconnecting.",
    );
  try {
    const { data } = await store.functions.httpsCallable("parseSpend", {
      timeout: 60000,
    })({
      image: prepared.image,
      today,
      timezone: store.data.profile.timezone || "Asia/Kolkata",
    });
    return {
      ...validateParsed(data, caps, today),
      receiptHash: prepared.receiptHash,
      source: "receipt",
    };
  } catch (error) {
    throw new Error(
      error.code === "functions/invalid-argument" ||
      error.code === "functions/failed-precondition"
        ? error.message
        : "Couldn’t read this receipt. Try a clearer photo or enter the amount below.",
    );
  }
}
