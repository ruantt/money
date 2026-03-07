const {
  BILLS_COLLECTION,
  fetchBillPage,
  formatMoney,
  normalizeBillListItem,
} = require("../../utils/bills");

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
    removingId: "",
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
      removingId: "",
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
        removingId: "",
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

  onEditTap(e) {
    const billId = e.currentTarget.dataset.id;
    if (!billId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/bill-edit/index?id=${billId}`,
    });
  },

  onDeleteTap(e) {
    const billId = e.currentTarget.dataset.id;
    if (!billId || this.data.removingId) {
      return;
    }

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

      const transactions = this.data.transactions.filter((item) => item.id !== billId);
      this.setData({
        summary: buildSummary(transactions),
        transactions,
        removingId: "",
      });

      wx.showToast({
        title: "已删除",
        icon: "success",
      });

      if (!transactions.length && this.data.hasMore) {
        this.reload();
      }
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
