const { ALL_CATEGORIES, getCategoryDisplay, getDefaultCategoryByType } = require("../../utils/constants");
const {
  BILLS_COLLECTION,
  buildBillUpdateRecord,
  formatDateTime,
  getBillCategory,
  getBillDate,
  getBillType,
  getSourceText,
} = require("../../utils/bills");

const EDIT_MODE = {
  BILL: "bill",
  DRAFT: "draft",
};

function today() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && todayFromDate(date) === value;
}

function todayFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function findCategoryIndex(categoryOptions, category) {
  const index = categoryOptions.indexOf(category);
  return index >= 0 ? index : 0;
}

function buildCategorySelectionData(categoryOptions, categoryIndex) {
  const safeIndex = Number.isInteger(categoryIndex)
    && categoryIndex >= 0
    && categoryIndex < categoryOptions.length
    ? categoryIndex
    : 0;
  const categoryDisplay = getCategoryDisplay(categoryOptions[safeIndex]);

  return {
    categoryIndex: safeIndex,
    selectedCategoryText: categoryDisplay.name,
    selectedCategoryIcon: categoryDisplay.icon,
  };
}

function formatAmountInputValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "";
  }

  return String(Number(amount.toFixed(2)));
}

function buildEditableFormState(categoryOptions, payload) {
  const type = payload && payload.type === "income" ? "income" : "expense";
  const category = typeof (payload && payload.category) === "string" && categoryOptions.includes(payload.category)
    ? payload.category
    : getDefaultCategoryByType(type);

  return Object.assign({
    type,
    amount: formatAmountInputValue(payload && payload.amount),
    date: isValidDateString(payload && payload.date) ? payload.date : today(),
    note: typeof (payload && payload.note) === "string" ? payload.note : "",
  }, buildCategorySelectionData(
    categoryOptions,
    findCategoryIndex(categoryOptions, category)
  ));
}

function parseDraftIndex(value) {
  const draftIndex = Number(value);
  return Number.isInteger(draftIndex) && draftIndex >= 0 ? draftIndex : -1;
}

function parseDraftPayload(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(value));
  } catch (error) {
    console.error("parse draft payload failed:", error);
    return null;
  }
}

Page({
  data: {
    mode: EDIT_MODE.BILL,
    billId: "",
    draftIndex: -1,
    categoryOptions: ALL_CATEGORIES,
    type: "expense",
    amount: "",
    categoryIndex: 0,
    selectedCategoryText: getCategoryDisplay(ALL_CATEGORIES[0]).name,
    selectedCategoryIcon: getCategoryDisplay(ALL_CATEGORIES[0]).icon,
    date: today(),
    note: "",
    sourceText: "",
    createdAtText: "",
    loading: true,
    saving: false,
    loadError: "",
  },

  onLoad(options) {
    this.loadOptions = options || {};

    if (options && options.mode === EDIT_MODE.DRAFT) {
      this.loadDraft(options);
      return;
    }

    const billId = options && options.id ? options.id : "";

    if (!billId) {
      this.setData({
        loading: false,
        loadError: "缺少账单 ID，无法编辑。",
      });
      return;
    }

    this.setData({
      mode: EDIT_MODE.BILL,
      billId,
    });
    this.loadBill();
  },

  onRetryLoadTap() {
    if (this.data.mode === EDIT_MODE.DRAFT) {
      this.loadDraft(this.loadOptions || {});
      return;
    }

    this.loadBill();
  },

  loadDraft(options) {
    const draft = parseDraftPayload(options && options.draft);

    if (!draft) {
      this.setData({
        mode: EDIT_MODE.DRAFT,
        loading: false,
        loadError: "草稿读取失败，请返回重试。",
      });
      return;
    }

    this.setData(Object.assign({
      mode: EDIT_MODE.DRAFT,
      billId: "",
      draftIndex: parseDraftIndex(options && options.draftIndex),
      sourceText: "语音草稿",
      createdAtText: "",
      loading: false,
      loadError: "",
    }, buildEditableFormState(this.data.categoryOptions, draft)));
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

      this.setData(Object.assign({
        sourceText: getSourceText(bill.source),
        createdAtText: formatDateTime(bill.createdAt || bill.created_at || bill._createTime),
        loading: false,
        loadError: "",
      }, buildEditableFormState(this.data.categoryOptions, {
          type: getBillType(bill),
          amount: bill.amount,
          category: getBillCategory(bill),
          date: getBillDate(bill) || today(),
          note: typeof bill.note === "string" ? bill.note : "",
        })));
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

    this.setData(Object.assign({
      type,
    }, buildCategorySelectionData(
      this.data.categoryOptions,
      findCategoryIndex(this.data.categoryOptions, defaultCategory)
    )));
  },

  onAmountInput(e) {
    this.setData({
      amount: e.detail.value,
    });
  },

  onCategoryChange(e) {
    this.setData(buildCategorySelectionData(this.data.categoryOptions, Number(e.detail.value)));
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

  buildDraftPayload() {
    const amountNumber = Number(this.data.amount);
    const category = this.data.categoryOptions[this.data.categoryIndex] || getDefaultCategoryByType(this.data.type);

    return {
      amount: Number(amountNumber.toFixed(2)),
      type: this.data.type,
      category,
      date: this.data.date,
      note: typeof this.data.note === "string" ? this.data.note.trim() : "",
    };
  },

  navigateBackByMode() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.switchTab({
          url: this.data.mode === EDIT_MODE.DRAFT
            ? "/pages/add/index"
            : "/pages/home/index",
        });
      },
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

    if (this.data.mode === EDIT_MODE.DRAFT) {
      this.setData({
        saving: true,
      });
      wx.showLoading({
        title: "保存中",
        mask: true,
      });

      try {
        const eventChannel = this.getOpenerEventChannel();
        if (!eventChannel || typeof eventChannel.emit !== "function") {
          throw new Error("draft return channel unavailable");
        }

        eventChannel.emit("draftSaved", {
          draftIndex: this.data.draftIndex,
          draft: this.buildDraftPayload(),
        });

        wx.showToast({
          title: "已保存修改",
          icon: "success",
        });

        setTimeout(() => {
          this.navigateBackByMode();
        }, 250);
      } catch (error) {
        console.error("save draft failed:", error);
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
        this.navigateBackByMode();
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
    this.navigateBackByMode();
  },
});
