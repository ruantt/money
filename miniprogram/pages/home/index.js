const { fetchBillPage, formatMoney, normalizeBillListItem } = require("../../utils/bills");

const PAGE_SIZE = 20;

function buildSummary(transactions) {
  const safeList = Array.isArray(transactions) ? transactions : [];
  let totalExpense = 0;
  let totalIncome = 0;

  safeList.forEach((item) => {
    const amount = Number(item && item.amount_value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    if (item && item.type_value === "income") {
      totalIncome += amount;
      return;
    }

    totalExpense += amount;
  });

  return {
    visibleCount: safeList.length,
    totalExpense: formatMoney(totalExpense),
    totalIncome: formatMoney(totalIncome),
  };
}

Page({
  data: {
    summary: {
      visibleCount: 0,
      totalExpense: "0.00",
      totalIncome: "0.00",
    },
    transactions: [],
    loading: false,
    loadingMore: false,
    loadError: "",
    hasMore: true,
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

    this.setData({
      loading: true,
      loadingMore: false,
      loadError: "",
      hasMore: true,
    });

    try {
      const db = wx.cloud.database();
      const page = await fetchBillPage(db, {
        limit: PAGE_SIZE,
        skip: 0,
        orderByField: "createdAt",
        orderByDirection: "desc",
      });

      const transactions = page.list.map((item, index) => {
        return normalizeBillListItem(item, index);
      });

      this.setData({
        summary: buildSummary(transactions),
        transactions,
        loading: false,
        loadingMore: false,
        loadError: "",
        hasMore: page.hasMore,
      }, () => {
        if (typeof done === "function") {
          done();
        }
      });
    } catch (error) {
      console.error("load bills failed:", error);
      this.setData({
        loading: false,
        loadingMore: false,
        loadError: "账单加载失败，请稍后下拉重试。",
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

  async loadMore() {
    if (
      this.data.loading ||
      this.data.loadingMore ||
      this.data.loadError ||
      !this.data.hasMore
    ) {
      return;
    }

    try {
      this.setData({
        loadingMore: true,
      });

      const db = wx.cloud.database();
      const page = await fetchBillPage(db, {
        limit: PAGE_SIZE,
        skip: this.data.transactions.length,
        orderByField: "createdAt",
        orderByDirection: "desc",
      });

      const nextTransactions = page.list.map((item, index) => {
        return normalizeBillListItem(item, this.data.transactions.length + index);
      });
      const transactions = this.data.transactions.concat(nextTransactions);

      this.setData({
        summary: buildSummary(transactions),
        transactions,
        loadingMore: false,
        hasMore: page.hasMore,
      });
    } catch (error) {
      console.error("load more bills failed:", error);
      this.setData({
        loadingMore: false,
      });
      wx.showToast({
        title: "加载失败",
        icon: "none",
      });
    }
  },
});
