const { STORAGE_KEY_TRANSACTIONS } = require("../../utils/constants");

Page({
  data: {
    storageKey: STORAGE_KEY_TRANSACTIONS,
  },

  onExportData() {
    const current = wx.getStorageSync(STORAGE_KEY_TRANSACTIONS);
    const json = JSON.stringify(Array.isArray(current) ? current : [], null, 2);

    wx.setClipboardData({
      data: json,
      success: () => {
        wx.showToast({
          title: "已复制JSON",
          icon: "none",
        });
      },
    });
  },

  onClearData() {
    wx.showModal({
      title: "确认清空",
      content: "确定清空所有本地账单数据吗？",
      success: (res) => {
        if (!res.confirm) {
          return;
        }

        wx.removeStorageSync(STORAGE_KEY_TRANSACTIONS);
        wx.showToast({
          title: "已清空",
          icon: "none",
        });
      },
    });
  },
});
