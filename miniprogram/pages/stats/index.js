const { getCategoryDisplay } = require("../../utils/constants");
const { fetchBills, formatMoney, getBillCategory, getBillDate, getBillType } = require("../../utils/bills");

const FILTER_MODE = {
  ALL: "all",
  CURRENT_MONTH: "currentMonth",
  CUSTOM_MONTH: "customMonth",
};

function buildCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildRangeLabel(filterMode, selectedMonth) {
  if (filterMode === FILTER_MODE.CURRENT_MONTH) {
    return `本月（${buildCurrentMonthKey()}）`;
  }

  if (filterMode === FILTER_MODE.CUSTOM_MONTH) {
    return `指定月份（${selectedMonth}）`;
  }

  return "全部时间";
}

function filterBillsByMode(rawBills, filterMode, selectedMonth) {
  if (filterMode === FILTER_MODE.ALL) {
    return rawBills;
  }

  const targetMonth = filterMode === FILTER_MODE.CURRENT_MONTH
    ? buildCurrentMonthKey()
    : selectedMonth;

  return rawBills.filter((item) => {
    const billDate = getBillDate(item);
    return billDate && billDate.slice(0, 7) === targetMonth;
  });
}

function buildCategoryRows(categoryMap, totalAmount) {
  return Object.keys(categoryMap)
    .map((category) => {
      const amountValue = categoryMap[category];
      const categoryDisplay = getCategoryDisplay(category);
      return {
        category: categoryDisplay.name,
        categoryIcon: categoryDisplay.icon,
        amount_value: amountValue,
        amount_text: formatMoney(amountValue),
        ratio_text: totalAmount > 0 ? `${((amountValue / totalAmount) * 100).toFixed(1)}%` : "0.0%",
      };
    })
    .sort((a, b) => b.amount_value - a.amount_value);
}

function buildStatsData(rawBills, filterMode, selectedMonth) {
  const filteredBills = filterBillsByMode(rawBills, filterMode, selectedMonth);
  let totalExpense = 0;
  let totalIncome = 0;
  const expenseByCategory = {};
  const incomeByCategory = {};

  filteredBills.forEach((item) => {
    const amount = Number(item && item.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const type = getBillType(item);
    const category = getBillCategory(item);

    if (type === "income") {
      totalIncome += amount;
      incomeByCategory[category] = (incomeByCategory[category] || 0) + amount;
      return;
    }

    totalExpense += amount;
    expenseByCategory[category] = (expenseByCategory[category] || 0) + amount;
  });

  return {
    rangeLabel: buildRangeLabel(filterMode, selectedMonth),
    billCount: filteredBills.length,
    totalExpense: formatMoney(totalExpense),
    totalIncome: formatMoney(totalIncome),
    balance: formatMoney(totalIncome - totalExpense),
    hasBills: filteredBills.length > 0,
    hasExpense: totalExpense > 0,
    hasIncome: totalIncome > 0,
    expenseCategories: buildCategoryRows(expenseByCategory, totalExpense),
    incomeCategories: buildCategoryRows(incomeByCategory, totalIncome),
  };
}

Page({
  data: {
    filterMode: FILTER_MODE.ALL,
    selectedMonth: buildCurrentMonthKey(),
    rangeLabel: "全部时间",
    billCount: 0,
    totalExpense: "0.00",
    totalIncome: "0.00",
    balance: "0.00",
    hasBills: false,
    hasExpense: false,
    hasIncome: false,
    expenseCategories: [],
    incomeCategories: [],
    loading: false,
    loadError: "",
  },

  onLoad() {
    this.rawBills = [];
  },

  onShow() {
    this.reload();
  },

  onPullDownRefresh() {
    this.reload(() => {
      wx.stopPullDownRefresh();
    });
  },

  onFilterModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.filterMode) {
      return;
    }

    this.setData({
      filterMode: mode,
    }, () => {
      this.applyStats();
    });
  },

  onMonthChange(e) {
    const nextMonth = e.detail && e.detail.value ? e.detail.value : buildCurrentMonthKey();
    this.setData({
      selectedMonth: nextMonth,
      filterMode: FILTER_MODE.CUSTOM_MONTH,
    }, () => {
      this.applyStats();
    });
  },

  applyStats(done) {
    const nextData = buildStatsData(
      this.rawBills || [],
      this.data.filterMode,
      this.data.selectedMonth
    );

    this.setData({
      ...nextData,
      loading: false,
      loadError: "",
    }, () => {
      if (typeof done === "function") {
        done();
      }
    });
  },

  async reload(done) {
    if (!wx.cloud || typeof wx.cloud.database !== "function") {
      const message = "当前基础库不支持云开发，请检查云环境配置。";
      console.error(message);
      this.setData({
        loading: false,
        loadError: message,
      }, () => {
        if (typeof done === "function") {
          done();
        }
      });
      wx.showToast({
        title: "加载失败",
        icon: "none",
      });
      return;
    }

    this.setData({
      loading: true,
      loadError: "",
    });

    try {
      const db = wx.cloud.database();
      this.rawBills = await fetchBills(db, {
        orderByField: "createdAt",
        orderByDirection: "desc",
      });
      this.applyStats(done);
    } catch (error) {
      console.error("load bill stats failed:", error);
      this.setData({
        loading: false,
        loadError: "统计加载失败，请稍后下拉重试。",
      }, () => {
        if (typeof done === "function") {
          done();
        }
      });
      wx.showToast({
        title: "加载失败",
        icon: "none",
      });
    }
  },
});
