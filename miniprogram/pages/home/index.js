const { listTransactions, deleteTransaction, statsThisMonth } = require("../../utils/store");

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

Page({
  data: {
    summary: {
      month: "",
      total_expense: "0.00",
      total_income: "0.00",
      balance: "0.00",
    },
    transactions: [],
    cloudTestLoading: false,
    cloudTestStatus: "",
    cloudTestResult: "",
  },

  onShow() {
    this.reload();
  },

  onPullDownRefresh() {
    this.reload(() => {
      wx.stopPullDownRefresh();
    });
  },

  reload(done) {
    const summaryRaw = statsThisMonth();
    const summary = {
      month: summaryRaw.month,
      total_expense: formatMoney(summaryRaw.total_expense),
      total_income: formatMoney(summaryRaw.total_income),
      balance: formatMoney(summaryRaw.balance),
    };

    const transactions = listTransactions().map((item) => {
      return {
        ...item,
        amount_text: formatMoney(item.amount),
        type_text: item.type === "income" ? "收入" : "支出",
      };
    });

    this.setData({
      summary,
      transactions,
    }, () => {
      if (typeof done === "function") {
        done();
      }
    });
  },

  onDeleteTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) {
      return;
    }

    wx.showModal({
      title: "确认删除",
      content: "确定删除这条账单吗？",
      success: (res) => {
        if (!res.confirm) {
          return;
        }

        deleteTransaction(id);
        wx.showToast({
          title: "已删除",
          icon: "none",
        });
        this.reload();
      },
    });
  },

  onTestCloudFunction() {
    if (!wx.cloud) {
      const message = "当前基础库不支持云开发，请先确认基础库版本。";
      console.error(message);
      this.setData({
        cloudTestLoading: false,
        cloudTestStatus: "error",
        cloudTestResult: message,
      });
      return;
    }

    this.setData({
      cloudTestLoading: true,
      cloudTestStatus: "",
      cloudTestResult: "调用中...",
    });

    wx.cloud.callFunction({
      name: "asrTranscribe",
      data: {
        test: "hello",
      },
    }).then((res) => {
      console.log("asrTranscribe call success:", res);

      this.setData({
        cloudTestLoading: false,
        cloudTestStatus: "success",
        cloudTestResult: JSON.stringify(res.result, null, 2),
      });
    }).catch((error) => {
      console.error("asrTranscribe call failed:", error);

      this.setData({
        cloudTestLoading: false,
        cloudTestStatus: "error",
        cloudTestResult: error && error.errMsg
          ? error.errMsg
          : "调用失败，请检查云环境和云函数部署状态。",
      });
    });
  },
});
