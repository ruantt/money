const { listTransactions, deleteTransaction, statsThisMonth } = require("../../utils/store");

const RECORD_STATUS = {
  IDLE: "idle",
  RECORDING: "recording",
  PAUSED: "paused",
  DONE: "done",
};

const RECORD_STATUS_TEXT = {
  [RECORD_STATUS.IDLE]: "未录音",
  [RECORD_STATUS.RECORDING]: "录音中",
  [RECORD_STATUS.PAUSED]: "已暂停",
  [RECORD_STATUS.DONE]: "已完成",
};

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
    recordStatus: RECORD_STATUS.IDLE,
    recordStatusText: RECORD_STATUS_TEXT[RECORD_STATUS.IDLE],
    supportsPauseResume: true,
    pauseResumeTip: "",
    recordSeconds: 0,
    tempFilePath: "",
    recordError: "",
    cloudTestLoading: false,
    cloudTestStatus: "",
    cloudTestResult: "",
  },

  onLoad() {
    this.initRecorder();
  },

  onShow() {
    this.reload();
  },

  onUnload() {
    this.clearRecordTimer();
    if (
      this.recorderManager &&
      (this.data.recordStatus === RECORD_STATUS.RECORDING || this.data.recordStatus === RECORD_STATUS.PAUSED)
    ) {
      this.recorderManager.stop();
    }
  },

  onPullDownRefresh() {
    this.reload(() => {
      wx.stopPullDownRefresh();
    });
  },

  setRecordState(status, extraData) {
    this.setData({
      recordStatus: status,
      recordStatusText: RECORD_STATUS_TEXT[status],
      ...(extraData || {}),
    });
  },

  initRecorder() {
    this.recorderManager = wx.getRecorderManager();
    const supportsPauseResume = typeof this.recorderManager.pause === "function"
      && typeof this.recorderManager.resume === "function";

    this.setData({
      supportsPauseResume,
      pauseResumeTip: supportsPauseResume ? "" : "当前基础库不支持暂停/继续录音，请升级微信或基础库后再试。",
    });

    if (this._recorderEventsBound) {
      return;
    }

    this._recorderEventsBound = true;

    this.recorderManager.onStart(() => {
      console.log("recorder start");
      this.resetRecordProgress();
      this.startRecordTimer();
      this.setRecordState(RECORD_STATUS.RECORDING, {
        recordSeconds: 0,
        tempFilePath: "",
        recordError: "",
      });
    });

    this.recorderManager.onPause(() => {
      console.log("recorder pause");
      this.pauseRecordTimer();
      this.setRecordState(RECORD_STATUS.PAUSED, {
        recordError: "",
      });
    });

    this.recorderManager.onResume(() => {
      console.log("recorder resume");
      this.startRecordTimer();
      this.setRecordState(RECORD_STATUS.RECORDING, {
        recordError: "",
      });
    });

    this.recorderManager.onStop((res) => {
      console.log("recorder stop:", res);

      if (this.data.recordStatus === RECORD_STATUS.RECORDING) {
        this.pauseRecordTimer();
      } else {
        this.clearRecordTimer();
      }

      const durationSeconds = typeof res.duration === "number"
        ? Math.max(0, Math.round(res.duration / 1000))
        : this.data.recordSeconds;

      this.setRecordState(RECORD_STATUS.DONE, {
        recordSeconds: durationSeconds,
        tempFilePath: res.tempFilePath || "",
        recordError: "",
      });
    });

    this.recorderManager.onError((error) => {
      console.error("recorder error:", error);
      this.clearRecordTimer();
      this.resetRecordProgress();

      this.setRecordState(RECORD_STATUS.IDLE, {
        recordSeconds: 0,
        tempFilePath: "",
        recordError: error && error.errMsg
          ? error.errMsg
          : "录音失败，请检查录音权限和设备状态。",
      });
    });
  },

  resetRecordProgress() {
    this.recordElapsedMs = 0;
    this.recordTickStartedAt = 0;
  },

  getCurrentRecordSeconds() {
    let elapsedMs = this.recordElapsedMs || 0;

    if (this.recordTickStartedAt) {
      elapsedMs += Date.now() - this.recordTickStartedAt;
    }

    return Math.floor(elapsedMs / 1000);
  },

  startRecordTimer() {
    this.clearRecordTimer();
    this.recordTickStartedAt = Date.now();

    this.recordTimer = setInterval(() => {
      const nextSeconds = this.getCurrentRecordSeconds();
      if (nextSeconds !== this.data.recordSeconds) {
        this.setData({
          recordSeconds: nextSeconds,
        });
      }
    }, 500);
  },

  pauseRecordTimer() {
    if (this.recordTickStartedAt) {
      this.recordElapsedMs = (this.recordElapsedMs || 0) + (Date.now() - this.recordTickStartedAt);
      this.recordTickStartedAt = 0;
    }

    this.clearRecordTimer();

    const nextSeconds = this.getCurrentRecordSeconds();
    if (nextSeconds !== this.data.recordSeconds) {
      this.setData({
        recordSeconds: nextSeconds,
      });
    }
  },

  clearRecordTimer() {
    if (this.recordTimer) {
      clearInterval(this.recordTimer);
      this.recordTimer = null;
    }
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

  onStartRecordTap() {
    if (this.data.recordStatus === RECORD_STATUS.RECORDING || this.data.recordStatus === RECORD_STATUS.PAUSED) {
      return;
    }

    wx.authorize({
      scope: "scope.record",
      success: () => {
        this.clearRecordTimer();
        this.resetRecordProgress();
        this.setRecordState(RECORD_STATUS.IDLE, {
          recordSeconds: 0,
          tempFilePath: "",
          recordError: "",
        });

        this.recorderManager.start({
          duration: 60000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 96000,
          format: "mp3",
        });
      },
      fail: (error) => {
        console.error("record authorize failed:", error);

        this.clearRecordTimer();
        this.resetRecordProgress();
        this.setRecordState(RECORD_STATUS.IDLE, {
          recordSeconds: 0,
          tempFilePath: "",
          recordError: error && error.errMsg
            ? error.errMsg
            : "录音权限获取失败，请允许使用麦克风。",
        });

        wx.showModal({
          title: "需要录音权限",
          content: "请在设置中允许小程序使用麦克风后再试。",
          confirmText: "去设置",
          success: (res) => {
            if (res.confirm) {
              wx.openSetting();
            }
          },
        });
      },
    });
  },

  onPauseRecordTap() {
    if (!this.recorderManager || !this.data.supportsPauseResume || this.data.recordStatus !== RECORD_STATUS.RECORDING) {
      return;
    }

    this.recorderManager.pause();
  },

  onResumeRecordTap() {
    if (!this.recorderManager || !this.data.supportsPauseResume || this.data.recordStatus !== RECORD_STATUS.PAUSED) {
      return;
    }

    this.recorderManager.resume();
  },

  onStopRecordTap() {
    if (
      !this.recorderManager ||
      (this.data.recordStatus !== RECORD_STATUS.RECORDING && this.data.recordStatus !== RECORD_STATUS.PAUSED)
    ) {
      return;
    }

    this.recorderManager.stop();
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
