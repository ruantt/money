const store = require("../../utils/store");
const { ALL_CATEGORIES, getDefaultCategoryByType } = require("../../utils/constants");

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

const PLAY_STATUS = {
  IDLE: "idle",
  PLAYING: "playing",
  ENDED: "ended",
  ERROR: "error",
};

const PLAY_STATUS_TEXT = {
  [PLAY_STATUS.IDLE]: "未播放",
  [PLAY_STATUS.PLAYING]: "播放中",
  [PLAY_STATUS.ENDED]: "播放结束",
  [PLAY_STATUS.ERROR]: "播放失败",
};

const UPLOAD_STATUS = {
  IDLE: "idle",
  UPLOADING: "uploading",
  SUCCESS: "success",
  ERROR: "error",
};

const UPLOAD_STATUS_TEXT = {
  [UPLOAD_STATUS.IDLE]: "未上传",
  [UPLOAD_STATUS.UPLOADING]: "上传中",
  [UPLOAD_STATUS.SUCCESS]: "上传成功",
  [UPLOAD_STATUS.ERROR]: "上传失败",
};

const PROCESS_STATUS = {
  IDLE: "idle",
  PROCESSING: "processing",
  SUCCESS: "success",
  ERROR: "error",
};

const PROCESS_STATUS_TEXT = {
  [PROCESS_STATUS.IDLE]: "未处理",
  [PROCESS_STATUS.PROCESSING]: "处理中",
  [PROCESS_STATUS.SUCCESS]: "处理成功",
  [PROCESS_STATUS.ERROR]: "处理失败",
};

function today() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function buildRecordDateFolder(date) {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1);
  const day = padNumber(date.getDate());
  return `${year}-${month}-${day}`;
}

function getFileExtension(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return "mp3";
  }

  const matched = filePath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (matched && matched[1]) {
    return matched[1].toLowerCase();
  }

  return "mp3";
}

Page({
  data: {
    type: "expense",
    amount: "",
    categoryOptions: ALL_CATEGORIES,
    categoryIndex: 0,
    date: today(),
    note: "",
    recordStatus: RECORD_STATUS.IDLE,
    recordStatusText: RECORD_STATUS_TEXT[RECORD_STATUS.IDLE],
    supportsPauseResume: true,
    pauseResumeTip: "",
    recordSeconds: 0,
    tempFilePath: "",
    recordError: "",
    playStatus: PLAY_STATUS.IDLE,
    playStatusText: PLAY_STATUS_TEXT[PLAY_STATUS.IDLE],
    playError: "",
    uploadStatus: UPLOAD_STATUS.IDLE,
    uploadStatusText: UPLOAD_STATUS_TEXT[UPLOAD_STATUS.IDLE],
    uploadFileID: "",
    uploadError: "",
    processStatus: PROCESS_STATUS.IDLE,
    processStatusText: PROCESS_STATUS_TEXT[PROCESS_STATUS.IDLE],
    processResult: "",
    processError: "",
  },

  onLoad() {
    this.initRecorder();
    this.initPlayer();
  },

  onUnload() {
    this.clearRecordTimer();
    this.stopPlayback(false);

    if (this.innerAudioContext) {
      this.innerAudioContext.destroy();
      this.innerAudioContext = null;
    }

    if (
      this.recorderManager &&
      (this.data.recordStatus === RECORD_STATUS.RECORDING || this.data.recordStatus === RECORD_STATUS.PAUSED)
    ) {
      this.recorderManager.stop();
    }
  },

  setRecordState(status, extraData) {
    this.setData({
      recordStatus: status,
      recordStatusText: RECORD_STATUS_TEXT[status],
      ...(extraData || {}),
    });
  },

  setPlayState(status, extraData) {
    this.setData({
      playStatus: status,
      playStatusText: PLAY_STATUS_TEXT[status],
      ...(extraData || {}),
    });
  },

  setUploadState(status, extraData) {
    this.setData({
      uploadStatus: status,
      uploadStatusText: UPLOAD_STATUS_TEXT[status],
      ...(extraData || {}),
    });
  },

  setProcessState(status, extraData) {
    this.setData({
      processStatus: status,
      processStatusText: PROCESS_STATUS_TEXT[status],
      ...(extraData || {}),
    });
  },

  resetPlayState() {
    this.setPlayState(PLAY_STATUS.IDLE, {
      playError: "",
    });
  },

  resetUploadState() {
    this.setUploadState(UPLOAD_STATUS.IDLE, {
      uploadFileID: "",
      uploadError: "",
    });
  },

  resetProcessState() {
    this.setProcessState(PROCESS_STATUS.IDLE, {
      processResult: "",
      processError: "",
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
      this.stopPlayback();
      this.resetRecordProgress();
      this.startRecordTimer();
      this.resetPlayState();
      this.resetUploadState();
      this.resetProcessState();
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

      this.stopPlayback();
      this.resetPlayState();
      this.resetUploadState();
      this.resetProcessState();

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
      this.stopPlayback();
      this.resetPlayState();
      this.resetUploadState();
      this.resetProcessState();

      this.setRecordState(RECORD_STATUS.IDLE, {
        recordSeconds: 0,
        tempFilePath: "",
        recordError: error && error.errMsg
          ? error.errMsg
          : "录音失败，请检查录音权限和设备状态。",
      });
    });
  },

  initPlayer() {
    this.innerAudioContext = wx.createInnerAudioContext();
    this._manualAudioStop = false;

    if (this._playerEventsBound) {
      return;
    }

    this._playerEventsBound = true;

    this.innerAudioContext.onPlay(() => {
      console.log("audio play");
      this.setPlayState(PLAY_STATUS.PLAYING, {
        playError: "",
      });
    });

    this.innerAudioContext.onEnded(() => {
      console.log("audio ended");
      this.setPlayState(PLAY_STATUS.ENDED, {
        playError: "",
      });
    });

    this.innerAudioContext.onStop(() => {
      console.log("audio stop");
      if (this._manualAudioStop) {
        this._manualAudioStop = false;
        this.setPlayState(PLAY_STATUS.IDLE, {
          playError: "",
        });
      }
    });

    this.innerAudioContext.onError((error) => {
      console.error("audio play failed:", error);
      this._manualAudioStop = false;
      this.setPlayState(PLAY_STATUS.ERROR, {
        playError: error && error.errMsg
          ? error.errMsg
          : "播放失败，请检查录音文件是否有效。",
      });
    });
  },

  stopPlayback(resetState = true) {
    if (this.innerAudioContext && this.data.playStatus === PLAY_STATUS.PLAYING) {
      this._manualAudioStop = true;
      this.innerAudioContext.stop();
      return;
    }

    if (resetState) {
      this.resetPlayState();
    }
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

  buildUploadCloudPath() {
    const now = new Date();
    const dateFolder = buildRecordDateFolder(now);
    const timestamp = now.getTime();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const extension = getFileExtension(this.data.tempFilePath);

    return `recordings/${dateFolder}/${timestamp}-${randomSuffix}.${extension}`;
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
    const categoryIndex = this.data.categoryOptions.indexOf(getDefaultCategoryByType("expense"));
    this.setData({
      type: "expense",
      categoryIndex: categoryIndex >= 0 ? categoryIndex : 0,
      amount: "28",
      date: today(),
      note: "午饭",
    });

    wx.showToast({
      title: "已填充",
      icon: "success",
      duration: 1000,
    });
  },

  onSave() {
    const amountNumber = Number(this.data.amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      wx.showToast({
        title: "请输入正确金额",
        icon: "none",
      });
      return;
    }

    const category = this.data.categoryOptions[this.data.categoryIndex] || getDefaultCategoryByType(this.data.type);

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
        title: (err && err.message) || "保存失败",
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

  onStartRecordTap() {
    if (this.data.recordStatus === RECORD_STATUS.RECORDING || this.data.recordStatus === RECORD_STATUS.PAUSED) {
      return;
    }

    wx.authorize({
      scope: "scope.record",
      success: () => {
        this.clearRecordTimer();
        this.resetRecordProgress();
        this.stopPlayback();
        this.resetPlayState();
        this.resetUploadState();
        this.resetProcessState();
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
        this.stopPlayback();
        this.resetPlayState();
        this.resetUploadState();
        this.resetProcessState();
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

  onPlayRecordTap() {
    if (!this.data.tempFilePath) {
      this.setPlayState(PLAY_STATUS.ERROR, {
        playError: "请先完成录音，再播放录音文件。",
      });
      return;
    }

    if (!this.innerAudioContext) {
      this.initPlayer();
    }

    this._manualAudioStop = false;
    this.innerAudioContext.src = this.data.tempFilePath;
    this.innerAudioContext.play();
  },

  onStopPlayTap() {
    if (!this.innerAudioContext || this.data.playStatus !== PLAY_STATUS.PLAYING) {
      return;
    }

    this.stopPlayback();
  },

  onUploadRecordTap() {
    if (!this.data.tempFilePath) {
      const message = "请先完成录音，再上传录音文件。";
      console.error(message);
      this.setUploadState(UPLOAD_STATUS.ERROR, {
        uploadFileID: "",
        uploadError: message,
      });
      return;
    }

    if (!wx.cloud) {
      const message = "当前基础库不支持云开发，请先确认基础库版本。";
      console.error(message);
      this.setUploadState(UPLOAD_STATUS.ERROR, {
        uploadFileID: "",
        uploadError: message,
      });
      return;
    }

    const cloudPath = this.buildUploadCloudPath();

    this.resetProcessState();
    this.setUploadState(UPLOAD_STATUS.UPLOADING, {
      uploadFileID: "",
      uploadError: "",
    });

    wx.cloud.uploadFile({
      cloudPath,
      filePath: this.data.tempFilePath,
    }).then((res) => {
      console.log("record upload success:", res);

      this.resetProcessState();
      this.setUploadState(UPLOAD_STATUS.SUCCESS, {
        uploadFileID: res.fileID || "",
        uploadError: "",
      });
    }).catch((error) => {
      console.error("record upload failed:", error);

      this.resetProcessState();
      this.setUploadState(UPLOAD_STATUS.ERROR, {
        uploadFileID: "",
        uploadError: error && error.errMsg
          ? error.errMsg
          : "上传失败，请检查云环境、网络和文件路径。",
      });
    });
  },

  onSubmitProcessTap() {
    if (!this.data.uploadFileID) {
      const message = "请先上传录音文件，再提交云端处理。";
      console.error(message);
      this.setProcessState(PROCESS_STATUS.ERROR, {
        processResult: "",
        processError: message,
      });
      return;
    }

    if (!wx.cloud) {
      const message = "当前基础库不支持云开发，请先确认基础库版本。";
      console.error(message);
      this.setProcessState(PROCESS_STATUS.ERROR, {
        processResult: "",
        processError: message,
      });
      return;
    }

    this.setProcessState(PROCESS_STATUS.PROCESSING, {
      processResult: "",
      processError: "",
    });

    wx.cloud.callFunction({
      name: "asrTranscribe",
      data: {
        fileID: this.data.uploadFileID,
        source: "recorder_upload",
        test: false,
      },
    }).then((res) => {
      console.log("asrTranscribe process success:", res);

      const result = res.result || {};
      if (!result.ok) {
        this.setProcessState(PROCESS_STATUS.ERROR, {
          processResult: "",
          processError: result.msg || "云端处理失败。",
        });
        return;
      }

      this.setProcessState(PROCESS_STATUS.SUCCESS, {
        processResult: JSON.stringify(result, null, 2),
        processError: "",
      });
    }).catch((error) => {
      console.error("asrTranscribe process failed:", error);

      this.setProcessState(PROCESS_STATUS.ERROR, {
        processResult: "",
        processError: error && error.errMsg
          ? error.errMsg
          : "云端处理失败，请检查云函数部署和云环境配置。",
      });
    });
  },
});
