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
  "运动健身",
];

const INCOME_CATEGORY = "收入";
const FALLBACK_CATEGORY = "其他";
const ALL_CATEGORIES = EXPENSE_CATEGORIES.concat([INCOME_CATEGORY, FALLBACK_CATEGORY]);
const CATEGORY_ICON_ROOT = "/assets/icons";
const CATEGORY_COMPAT_MAP = {
  旅行出行: "娱乐休闲",
};
const CATEGORY_ICON_MAP = ALL_CATEGORIES.reduce((result, category) => {
  result[category] = `${CATEGORY_ICON_ROOT}/${category}.png`;
  return result;
}, {});

function getDefaultCategoryByType(type) {
  return type === "income" ? INCOME_CATEGORY : EXPENSE_CATEGORIES[0];
}

function normalizeCategoryName(category) {
  if (typeof category !== "string") {
    return FALLBACK_CATEGORY;
  }

  const text = category.trim();
  if (!text) {
    return FALLBACK_CATEGORY;
  }

  const compatibleCategory = CATEGORY_COMPAT_MAP[text] || text;
  return CATEGORY_ICON_MAP[compatibleCategory]
    ? compatibleCategory
    : FALLBACK_CATEGORY;
}

function normalizeCategoryForStorage(category, type) {
  if (typeof category !== "string" || !category.trim()) {
    return getDefaultCategoryByType(type);
  }

  return normalizeCategoryName(category);
}

function getCategoryIcon(category) {
  const normalizedCategory = normalizeCategoryName(category);
  return CATEGORY_ICON_MAP[normalizedCategory] || CATEGORY_ICON_MAP[FALLBACK_CATEGORY];
}

function getCategoryDisplay(category) {
  const name = normalizeCategoryName(category);
  return {
    name,
    icon: getCategoryIcon(name),
  };
}

module.exports = {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORY,
  FALLBACK_CATEGORY,
  ALL_CATEGORIES,
  CATEGORY_COMPAT_MAP,
  CATEGORY_ICON_MAP,
  getDefaultCategoryByType,
  normalizeCategoryName,
  normalizeCategoryForStorage,
  getCategoryIcon,
  getCategoryDisplay,
};
