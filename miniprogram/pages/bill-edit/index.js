const { ALL_CATEGORIES, getDefaultCategoryByType } = require("../../utils/constants");
const {
  BILLS_COLLECTION,
  buildBillUpdateRecord,
  formatDateTime,
  getBillCategory,
  getBillDate,
  getBillType,
  getSourceText,
} = require("../../utils/bills");

function today() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function findCategoryIndex(categoryOptions, category) {
  const index = categoryOptions.indexOf(category);
  return index >= 0 ? index : 0;
}

function formatAmountInputValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "";
  }

  return String(Number(amount.toFixed(2)));
}

Page({
  data: {
    billId: "",
    categoryOptions: ALL_CATEGORIES,
    type: "expense",
    amount: "",
    categoryIndex: 0,
    date: today(),
    note: "",
    sourceText: "",
    createdAtText: "",
    loading: true,
    saving: false,
    loadError: "",
  },

  onLoad(options) {
    const billId = options && options.id ? options.id : "";

    if (!billId) {
      this.setData({
        loading: false,
        loadError: "缺少账单 ID，无法编辑。",
      });
      return;
    }

    this.setData({
      billId,
    });
    this.loadBill();
  },

  async loadBill() {
    if (!wx.cloud || typeof wx.cloud.database !== "function") {
      this.setData({
        loading: false,
        loadError: "当前基础库不支持云开发，请检查云环境配置。",
      });
      return;
    }

    this.setData({
      loading: true,
      loadError: "",
    });

    try {
      const db = wx.cloud.database();
      const res = await db.collection(BILLS_COLLECTION).doc(this.data.billId).get();
      const bill = res && res.data ? res.data : {};
      const type = getBillType(bill);
      const category = getBillCategory(bill);

      this.setData({
        type,
        amount: formatAmountInputValue(bill.amount),
        categoryIndex: findCategoryIndex(this.data.categoryOptions, category),
        date: getBillDate(bill) || today(),
        note: typeof bill.note === "string" ? bill.note : "",
        sourceText: getSourceText(bill.source),
        createdAtText: formatDateTime(bill.createdAt || bill.created_at || bill._createTime),
        loading: false,
        loadError: "",
      });
    } catch (error) {
      console.error("load bill for edit failed:", error);
      this.setData({
        loading: false,
        loadError: "账单读取失败，请稍后重试。",
      });
    }
  },

  onTypeChange(e) {
    const type = e.detail.value;
    const defaultCategory = getDefaultCategoryByType(type);

    this.setData({
      type,
      categoryIndex: findCategoryIndex(this.data.categoryOptions, defaultCategory),
    });
  },

  onAmountInput(e) {
    this.setData({
      amount: e.detail.value,
    });
  },

  onCategoryChange(e) {
    this.setData({
      categoryIndex: Number(e.detail.value),
    });
  },

  onDateChange(e) {
    this.setData({
      date: e.detail.value,
    });
  },

  onNoteInput(e) {
    this.setData({
      note: e.detail.value,
    });
  },

  async onSaveTap() {
    if (this.data.saving) {
      return;
    }

    const amountNumber = Number(this.data.amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      wx.showToast({
        title: "请输入正确金额",
        icon: "none",
      });
      return;
    }

    if (!wx.cloud || typeof wx.cloud.database !== "function") {
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
      return;
    }

    const db = wx.cloud.database();
    const category = this.data.categoryOptions[this.data.categoryIndex] || getDefaultCategoryByType(this.data.type);
    let updateData;

    try {
      updateData = buildBillUpdateRecord(db, {
        type: this.data.type,
        amount: this.data.amount,
        category,
        date: this.data.date,
        note: this.data.note,
      });
    } catch (error) {
      console.error("build update payload failed:", error);
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
      return;
    }

    this.setData({
      saving: true,
    });
    wx.showLoading({
      title: "保存中",
      mask: true,
    });

    try {
      await db.collection(BILLS_COLLECTION).doc(this.data.billId).update({
        data: updateData,
      });

      wx.showToast({
        title: "已更新",
        icon: "success",
      });

      setTimeout(() => {
        wx.navigateBack({
          delta: 1,
          fail: () => {
            wx.switchTab({
              url: "/pages/home/index",
            });
          },
        });
      }, 350);
    } catch (error) {
      console.error("update bill failed:", error);
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
    } finally {
      this.setData({
        saving: false,
      });
      wx.hideLoading();
    }
  },

  onCancelTap() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.switchTab({
          url: "/pages/home/index",
        });
      },
    });
  },
});
