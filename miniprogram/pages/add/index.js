const store = require("../../utils/store");
const { ALL_CATEGORIES, getDefaultCategoryByType } = require("../../utils/constants");

function today() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

Page({
  data: {
    type: "expense",
    amount: "",
    categoryOptions: ALL_CATEGORIES,
    categoryIndex: 0,
    date: today(),
    note: "",
  },

  onLoad() {
    // 诊断结论：
    // 1) 事件名需与 WXML 完全一致（onSave / onFillExample）
    // 2) store 模块使用 CommonJS 导出，页面需使用 require 引用
    console.log("[diagnosis] add page loaded, store.addTransaction type:", typeof store.addTransaction);
  },

  onTypeChange(e) {
    const type = e.detail.value;
    const defaultCategory = getDefaultCategoryByType(type);
    const categoryIndex = this.data.categoryOptions.indexOf(defaultCategory);

    this.setData({
      type,
      categoryIndex: categoryIndex >= 0 ? categoryIndex : 0,
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

  onFillExample() {
    console.log("onFillExample tap");
    const categoryIndex = this.data.categoryOptions.indexOf("餐饮");
    this.setData({
      type: "expense",
      categoryIndex: categoryIndex >= 0 ? categoryIndex : 0,
      amount: "28",
      date: today(),
      note: "打车",
    });

    wx.showToast({
      title: "已填充",
      icon: "success",
      duration: 1000,
    });
  },

  onSave() {
    console.log("onSave tap");
    wx.showToast({
      title: "保存中...",
      icon: "loading",
      duration: 800,
    });

    const amountNumber = Number(this.data.amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      wx.showToast({
        title: "请输入正确金额",
        icon: "none",
      });
      return;
    }

    const category = this.data.categoryOptions[this.data.categoryIndex] || "其他";

    try {
      store.addTransaction({
        type: this.data.type,
        amount: this.data.amount,
        category,
        date: this.data.date,
        note: this.data.note,
      });
    } catch (err) {
      console.error(err);
      wx.showToast({
        title: (err && err.message) || "失败",
        icon: "none",
      });
      return;
    }

    wx.showToast({
      title: "已保存",
      icon: "success",
    });

    setTimeout(() => {
      wx.switchTab({
        url: "/pages/home/index",
      });
    }, 350);
  },
});
