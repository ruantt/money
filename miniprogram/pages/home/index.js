const {
  BILLS_COLLECTION,
  fetchBills,
  formatMoney,
  getBillMonthKey,
  normalizeBillListItem,
} = require("../../utils/bills");

const PAGE_SIZE = 20;
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function buildCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return "当前月份";
  }

  const [year, month] = monthKey.split("-");
  return `${year}年${month}月`;
}

function formatDayLabel(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return "日期未知";
  }

  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  const month = dateKey.slice(5, 7);
  const day = dateKey.slice(8, 10);
  const weekday = WEEKDAY_LABELS[date.getDay()] || "";
  return `${month}月${day}日 ${weekday}`;
}

function buildMonthSummary(rawBills) {
  let totalExpense = 0;
  let totalIncome = 0;

  rawBills.forEach((item) => {
    const amount = Number(item && item.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    if (item && item.type === "income") {
      totalIncome += amount;
      return;
    }

    totalExpense += amount;
  });

  const balanceValue = totalIncome - totalExpense;
  return {
    billCount: rawBills.length,
    totalExpense: formatMoney(totalExpense),
    totalIncome: formatMoney(totalIncome),
    balance: formatMoney(balanceValue),
    balanceClass: balanceValue >= 0 ? "amount-income" : "amount-expense",
  };
}

function buildDayGroups(rawBills) {
  const groups = [];
  const groupMap = {};

  rawBills.forEach((item, index) => {
    const bill = normalizeBillListItem(item, index);
    const dateKey = bill.date_text;

    if (!groupMap[dateKey]) {
      groupMap[dateKey] = {
        dateKey,
        dateLabel: formatDayLabel(dateKey),
        billCount: 0,
        expenseTotalValue: 0,
        incomeTotalValue: 0,
        items: [],
      };
      groups.push(groupMap[dateKey]);
    }

    const group = groupMap[dateKey];
    group.billCount += 1;

    if (bill.type_value === "income") {
      group.incomeTotalValue += bill.amount_value;
    } else {
      group.expenseTotalValue += bill.amount_value;
    }

    group.items.push({
      ...bill,
      showNote: bill.note_text !== "无",
      metaText: bill.time_text === "时间未知"
        ? bill.source_text
        : `${bill.source_text} · ${bill.time_text}`,
    });
  });

  return groups.map((group) => {
    return {
      ...group,
      expenseTotalText: formatMoney(group.expenseTotalValue),
      incomeTotalText: formatMoney(group.incomeTotalValue),
    };
  });
}

function buildGroupPages(groups) {
  if (!groups.length) {
    return [];
  }

  const pages = [];
  let currentPage = [];
  let currentCount = 0;

  groups.forEach((group) => {
    const nextCount = currentCount + group.items.length;

    if (currentPage.length && nextCount > PAGE_SIZE) {
      pages.push(currentPage);
      currentPage = [];
      currentCount = 0;
    }

    currentPage.push(group);
    currentCount += group.items.length;

    if (currentCount >= PAGE_SIZE) {
      pages.push(currentPage);
      currentPage = [];
      currentCount = 0;
    }
  });

  if (currentPage.length) {
    pages.push(currentPage);
  }

  return pages;
}

function flattenGroupPages(pages, visiblePageCount) {
  return pages
    .slice(0, visiblePageCount)
    .reduce((result, page) => result.concat(page), []);
}

Page({
  data: {
    currentMonth: buildCurrentMonthKey(),
    selectedMonth: buildCurrentMonthKey(),
    selectedMonthLabel: formatMonthLabel(buildCurrentMonthKey()),
    monthSummary: {
      billCount: 0,
      totalExpense: "0.00",
      totalIncome: "0.00",
      balance: "0.00",
      balanceClass: "amount-income",
    },
    dateGroups: [],
    loading: false,
    loadingMore: false,
    loadError: "",
    hasMore: false,
    removingId: "",
  },

  onLoad() {
    this.rawBills = [];
    this.groupPages = [];
    this.visiblePageCount = 1;
  },

  onShow() {
    this.reload();
  },

  onPullDownRefresh() {
    this.reload(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    this.loadMore();
  },

  onMonthChange(e) {
    const nextMonth = e.detail && e.detail.value ? e.detail.value : buildCurrentMonthKey();
    if (nextMonth === this.data.selectedMonth) {
      return;
    }

    this.visiblePageCount = 1;
    this.setData({
      selectedMonth: nextMonth,
      selectedMonthLabel: formatMonthLabel(nextMonth),
      loadingMore: false,
    }, () => {
      this.applyMonthView();
    });
  },

  onResetMonthTap() {
    const currentMonth = buildCurrentMonthKey();
    if (this.data.selectedMonth === currentMonth) {
      return;
    }

    this.visiblePageCount = 1;
    this.setData({
      currentMonth,
      selectedMonth: currentMonth,
      selectedMonthLabel: formatMonthLabel(currentMonth),
      loadingMore: false,
    }, () => {
      this.applyMonthView();
    });
  },

  onGoAddTap() {
    wx.switchTab({
      url: "/pages/add/index",
    });
  },

  applyMonthView(done) {
    const selectedMonth = this.data.selectedMonth || buildCurrentMonthKey();
    const monthBills = (this.rawBills || []).filter((item) => {
      return getBillMonthKey(item) === selectedMonth;
    });
    const dayGroups = buildDayGroups(monthBills);

    this.groupPages = buildGroupPages(dayGroups);
    if (!this.groupPages.length) {
      this.visiblePageCount = 1;
    } else if (this.visiblePageCount > this.groupPages.length) {
      this.visiblePageCount = this.groupPages.length;
    }

    this.setData({
      selectedMonthLabel: formatMonthLabel(selectedMonth),
      monthSummary: buildMonthSummary(monthBills),
      dateGroups: flattenGroupPages(this.groupPages, this.visiblePageCount),
      loading: false,
      loadingMore: false,
      loadError: "",
      hasMore: this.visiblePageCount < this.groupPages.length,
      removingId: "",
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
        loadingMore: false,
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

    this.visiblePageCount = 1;
    this.setData({
      loading: true,
      loadingMore: false,
      loadError: "",
      removingId: "",
    });

    try {
      const db = wx.cloud.database();
      this.rawBills = await fetchBills(db, {
        orderByField: "createdAt",
        orderByDirection: "desc",
      });

      const currentMonth = buildCurrentMonthKey();
      const selectedMonth = this.data.selectedMonth || currentMonth;
      this.setData({
        currentMonth,
        selectedMonth,
      }, () => {
        this.applyMonthView(done);
      });
    } catch (error) {
      console.error("load bills failed:", error);
      this.setData({
        loading: false,
        loadingMore: false,
        loadError: "账单加载失败，请稍后下拉重试。",
        removingId: "",
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

  loadMore() {
    if (
      this.data.loading ||
      this.data.loadingMore ||
      this.data.loadError ||
      !this.data.hasMore
    ) {
      return;
    }

    this.setData({
      loadingMore: true,
    });

    this.visiblePageCount += 1;
    this.applyMonthView();
  },

  onBillActionTap(e) {
    const billId = e.currentTarget.dataset.id;
    this.openBillActions(billId);
  },

  onBillLongPress(e) {
    const billId = e.currentTarget.dataset.id;
    this.openBillActions(billId);
  },

  openBillActions(billId) {
    if (!billId || this.data.removingId) {
      return;
    }

    wx.showActionSheet({
      itemList: ["编辑账单", "删除账单"],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.openEditPage(billId);
          return;
        }

        if (res.tapIndex === 1) {
          this.confirmDeleteBill(billId);
        }
      },
      fail: (error) => {
        if (error && typeof error.errMsg === "string" && error.errMsg.includes("cancel")) {
          return;
        }
        console.error("open bill action sheet failed:", error);
      },
    });
  },

  openEditPage(billId) {
    if (!billId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/bill-edit/index?id=${billId}`,
    });
  },

  confirmDeleteBill(billId) {
    wx.showModal({
      title: "删除账单",
      content: "删除后不可恢复，确定继续吗？",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        await this.removeBill(billId);
      },
    });
  },

  async removeBill(billId) {
    if (!wx.cloud || typeof wx.cloud.database !== "function") {
      wx.showToast({
        title: "删除失败",
        icon: "none",
      });
      return;
    }

    this.setData({
      removingId: billId,
    });

    try {
      const db = wx.cloud.database();
      await db.collection(BILLS_COLLECTION).doc(billId).remove();

      this.rawBills = (this.rawBills || []).filter((item) => item && item._id !== billId);
      this.applyMonthView();

      wx.showToast({
        title: "已删除",
        icon: "success",
      });
    } catch (error) {
      console.error("remove bill failed:", error);
      this.setData({
        removingId: "",
      });
      wx.showToast({
        title: "删除失败",
        icon: "none",
      });
    }
  },
});
