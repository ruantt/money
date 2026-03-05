const STORAGE_KEY_TRANSACTIONS = "transactions_v1";

const EXPENSE_CATEGORIES = [
  "餐饮",
  "交通",
  "购物",
  "居家日用",
  "住房",
  "通讯网络",
  "医疗健康",
  "教育学习",
  "娱乐休闲",
  "人情往来",
  "旅行出行",
  "运动健身",
];

const INCOME_CATEGORY = "收入";
const FALLBACK_CATEGORY = "其他";

const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, INCOME_CATEGORY, FALLBACK_CATEGORY];

function getDefaultCategoryByType(type) {
  return type === "income" ? INCOME_CATEGORY : EXPENSE_CATEGORIES[0];
}

module.exports = {
  STORAGE_KEY_TRANSACTIONS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORY,
  FALLBACK_CATEGORY,
  ALL_CATEGORIES,
  getDefaultCategoryByType,
};
