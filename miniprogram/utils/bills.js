const { FALLBACK_CATEGORY, getDefaultCategoryByType } = require("./constants");

const BILLS_COLLECTION = "bills";
const BILLS_BATCH_SIZE = 20;

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function formatDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = padNumber(dateObj.getMonth() + 1);
  const day = padNumber(dateObj.getDate());
  return `${year}-${month}-${day}`;
}

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && formatDate(date) === value;
}

function toDateObject(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      try {
        return toDateObject(value.toDate());
      } catch (error) {
        return null;
      }
    }

    if (typeof value.$date !== "undefined") {
      return toDateObject(value.$date);
    }

    if (typeof value.seconds === "number") {
      return toDateObject(value.seconds * 1000);
    }
  }

  return null;
}

function formatDateTime(value) {
  const date = toDateObject(value);
  if (!date) {
    return "时间未知";
  }

  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1);
  const day = padNumber(date.getDate());
  const hour = padNumber(date.getHours());
  const minute = padNumber(date.getMinutes());

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function normalizeText(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim();
  return text || fallback;
}

function getBillCreatedAtValue(item) {
  return item && (item.createdAt || item.created_at || item._createTime);
}

function getBillType(item) {
  return item && item.type === "income" ? "income" : "expense";
}

function getBillCategory(item) {
  const type = getBillType(item);
  const fallbackCategory = type === "income" ? getDefaultCategoryByType(type) : FALLBACK_CATEGORY;
  return normalizeText(item && item.category, fallbackCategory);
}

function getBillDate(item) {
  if (item && isValidDateString(item.date)) {
    return item.date;
  }

  const createdAt = toDateObject(getBillCreatedAtValue(item));
  return createdAt ? formatDate(createdAt) : "";
}

function getSourceText(value) {
  if (value === "voice") {
    return "语音";
  }

  if (value === "manual") {
    return "手动";
  }

  return normalizeText(value, "未知");
}

function normalizeBillListItem(item, index) {
  const amountValue = Number(item && item.amount);
  const safeAmountValue = Number.isFinite(amountValue) ? amountValue : 0;
  const type = getBillType(item);

  return {
    id: item && item._id ? item._id : `bill_${index}`,
    amount_value: safeAmountValue,
    amount_text: formatMoney(safeAmountValue),
    amount_prefix: type === "income" ? "+" : "-",
    amount_class: type === "income" ? "amount-income" : "amount-expense",
    type_value: type,
    type_text: type === "income" ? "收入" : "支出",
    category_text: getBillCategory(item),
    note_text: normalizeText(item && item.note, "无"),
    source_text: getSourceText(item && item.source),
    date_text: getBillDate(item) || "日期未知",
    created_at_text: formatDateTime(getBillCreatedAtValue(item)),
  };
}

function buildManualBillRecord(db, payload) {
  const amount = Number(payload && payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount-invalid");
  }

  const type = payload && payload.type === "income" ? "income" : "expense";
  const category = normalizeText(
    payload && payload.category,
    getDefaultCategoryByType(type)
  );
  const note = typeof (payload && payload.note) === "string" ? payload.note.trim() : "";
  const date = isValidDateString(payload && payload.date)
    ? payload.date
    : formatDate(new Date());

  return {
    amount: Number(amount.toFixed(2)),
    category,
    note,
    source: "manual",
    createdAt: typeof db.serverDate === "function" ? db.serverDate() : new Date(),
    updatedAt: typeof db.serverDate === "function" ? db.serverDate() : new Date(),
    type,
    date,
  };
}

function buildVoiceBillRecord(db, payload) {
  const amount = Number(payload && payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const category = normalizeText(payload && payload.category, FALLBACK_CATEGORY);
  const note = typeof (payload && payload.note) === "string" ? payload.note.trim() : "";
  const transcript = typeof (payload && payload.transcript) === "string" ? payload.transcript.trim() : "";
  const date = isValidDateString(payload && payload.date)
    ? payload.date
    : formatDate(new Date());

  return {
    amount: Number(amount.toFixed(2)),
    category,
    note,
    source: "voice",
    transcript,
    createdAt: typeof db.serverDate === "function" ? db.serverDate() : new Date(),
    updatedAt: typeof db.serverDate === "function" ? db.serverDate() : new Date(),
    type: "expense",
    date,
  };
}

async function fetchBills(db, options) {
  const limitOption = options && typeof options.limit === "number" && options.limit > 0
    ? options.limit
    : null;
  const orderByField = options && options.orderByField ? options.orderByField : "createdAt";
  const orderByDirection = options && options.orderByDirection ? options.orderByDirection : "desc";

  const list = [];
  let skip = 0;
  let remaining = limitOption;

  while (true) {
    const currentLimit = remaining === null
      ? BILLS_BATCH_SIZE
      : Math.min(BILLS_BATCH_SIZE, remaining);

    if (currentLimit <= 0) {
      break;
    }

    const res = await db.collection(BILLS_COLLECTION)
      .orderBy(orderByField, orderByDirection)
      .skip(skip)
      .limit(currentLimit)
      .get();

    const batch = Array.isArray(res.data) ? res.data : [];
    list.push(...batch);
    skip += batch.length;

    if (remaining !== null) {
      remaining -= batch.length;
    }

    if (batch.length < currentLimit || remaining === 0) {
      break;
    }
  }

  return list;
}

async function fetchBillPage(db, options) {
  const limit = options && typeof options.limit === "number" && options.limit > 0
    ? options.limit
    : BILLS_BATCH_SIZE;
  const skip = options && typeof options.skip === "number" && options.skip >= 0
    ? options.skip
    : 0;
  const orderByField = options && options.orderByField ? options.orderByField : "createdAt";
  const orderByDirection = options && options.orderByDirection ? options.orderByDirection : "desc";

  const res = await db.collection(BILLS_COLLECTION)
    .orderBy(orderByField, orderByDirection)
    .skip(skip)
    .limit(limit)
    .get();

  const list = Array.isArray(res.data) ? res.data : [];
  return {
    list,
    hasMore: list.length === limit,
  };
}

module.exports = {
  BILLS_COLLECTION,
  formatMoney,
  formatDate,
  formatDateTime,
  normalizeText,
  getBillType,
  getBillCategory,
  getBillDate,
  normalizeBillListItem,
  buildManualBillRecord,
  buildVoiceBillRecord,
  fetchBills,
  fetchBillPage,
};
