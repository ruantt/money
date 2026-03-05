const {
  STORAGE_KEY_TRANSACTIONS,
  ALL_CATEGORIES,
  FALLBACK_CATEGORY,
  getDefaultCategoryByType,
} = require("./constants");

function formatDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDate(dateValue) {
  if (typeof dateValue !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throw new Error("date-invalid");
  }

  const dateObj = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(dateObj.getTime())) {
    throw new Error("date-invalid");
  }

  if (formatDate(dateObj) !== dateValue) {
    throw new Error("date-invalid");
  }

  return dateValue;
}

function normalizeAmount(amountValue) {
  const amount = Number(amountValue);
  if (!Number.isFinite(amount)) {
    throw new Error("amount-invalid");
  }
  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (cents <= 0) {
    throw new Error("amount-invalid");
  }
  return Number((cents / 100).toFixed(2));
}

function normalizeType(typeValue) {
  return typeValue === "income" ? "income" : "expense";
}

function normalizeCategory(categoryValue, type) {
  if (typeof categoryValue === "string" && ALL_CATEGORIES.includes(categoryValue)) {
    return categoryValue;
  }
  return getDefaultCategoryByType(type);
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readRawList() {
  const stored = wx.getStorageSync(STORAGE_KEY_TRANSACTIONS);
  return Array.isArray(stored) ? stored : [];
}

function saveRawList(list) {
  wx.setStorageSync(STORAGE_KEY_TRANSACTIONS, list);
}

function sortTransactions(list) {
  return list.slice().sort((a, b) => {
    if (a.date === b.date) {
      return (b.created_at || 0) - (a.created_at || 0);
    }
    if (a.date > b.date) {
      return -1;
    }
    return 1;
  });
}

function listTransactions() {
  return sortTransactions(readRawList());
}

function addTransaction(txPartial) {
  const now = Date.now();
  const type = normalizeType(txPartial && txPartial.type);
  const amount = normalizeAmount(txPartial && txPartial.amount);
  const date = normalizeDate((txPartial && txPartial.date) || formatDate(new Date()));
  const category = normalizeCategory(txPartial && txPartial.category, type);
  const note = typeof (txPartial && txPartial.note) === "string" ? txPartial.note.trim() : "";

  const newTx = {
    id: makeId(),
    type,
    amount,
    category,
    date,
    note,
    created_at: now,
  };

  const current = readRawList();
  current.push(newTx);
  saveRawList(current);

  return newTx;
}

function deleteTransaction(id) {
  if (!id) {
    return;
  }
  const current = readRawList();
  const filtered = current.filter((item) => item.id !== id);
  saveRawList(filtered);
}

function toCents(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

function statsThisMonth() {
  const month = formatDate(new Date()).slice(0, 7);
  const monthTransactions = listTransactions().filter((item) => {
    return item && typeof item.date === "string" && item.date.slice(0, 7) === month;
  });

  let totalExpenseCents = 0;
  let totalIncomeCents = 0;
  const expenseByCategory = {};

  monthTransactions.forEach((item) => {
    const cents = toCents(item.amount);
    if (cents <= 0) {
      return;
    }

    if (item.type === "income") {
      totalIncomeCents += cents;
      return;
    }

    totalExpenseCents += cents;
    const category = ALL_CATEGORIES.includes(item.category) ? item.category : FALLBACK_CATEGORY;
    expenseByCategory[category] = (expenseByCategory[category] || 0) + cents;
  });

  const topCategories = Object.keys(expenseByCategory)
    .map((category) => {
      const cents = expenseByCategory[category];
      return {
        category,
        amount: fromCents(cents),
        ratio: totalExpenseCents > 0 ? Number((cents / totalExpenseCents).toFixed(4)) : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const total_expense = fromCents(totalExpenseCents);
  const total_income = fromCents(totalIncomeCents);

  return {
    month,
    total_expense,
    total_income,
    balance: fromCents(totalIncomeCents - totalExpenseCents),
    top_categories: topCategories,
  };
}

module.exports = {
  listTransactions,
  addTransaction,
  deleteTransaction,
  statsThisMonth,
};
