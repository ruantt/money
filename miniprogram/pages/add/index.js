const {
  ALL_CATEGORIES,
  getCategoryDisplay,
  getDefaultCategoryByType,
  normalizeCategoryForStorage,
} = require("../../utils/constants");
const { BILLS_COLLECTION, buildManualBillRecord, buildVoiceBillRecord } = require("../../utils/bills");

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

const PARSE_STATUS = {
  IDLE: "idle",
  PROCESSING: "processing",
  SUCCESS: "success",
  ERROR: "error",
};

const PARSE_STATUS_TEXT = {
  [PARSE_STATUS.IDLE]: "未解析",
  [PARSE_STATUS.PROCESSING]: "解析中",
  [PARSE_STATUS.SUCCESS]: "解析成功",
  [PARSE_STATUS.ERROR]: "解析失败",
};

const VOICE_FLOW_STAGE = {
  IDLE: "idle",
  RECORDING: "recording",
  RECORD_FINISHED: "recordFinished",
  UPLOADING: "uploading",
  UPLOADED: "uploaded",
  TRANSCRIBING: "transcribing",
  TRANSCRIBED: "transcribed",
  PARSING: "parsing",
  PARSED: "parsed",
  ERROR: "error",
};

const VOICE_FLOW_STEP = {
  RECORD: "record",
  UPLOAD: "upload",
  TRANSCRIBE: "transcribe",
  PARSE: "parse",
  DRAFT: "draft",
};

const VOICE_FLOW_STEP_LIST = [
  {
    key: VOICE_FLOW_STEP.RECORD,
    label: "录音完成",
  },
  {
    key: VOICE_FLOW_STEP.UPLOAD,
    label: "上传录音",
  },
  {
    key: VOICE_FLOW_STEP.TRANSCRIBE,
    label: "识别语音",
  },
  {
    key: VOICE_FLOW_STEP.PARSE,
    label: "AI 解析",
  },
  {
    key: VOICE_FLOW_STEP.DRAFT,
    label: "生成草稿",
  },
];

const VOICE_FLOW_STAGE_MESSAGE = {
  [VOICE_FLOW_STAGE.IDLE]: "点击开始录音，说完后点击停止，系统会自动生成账单草稿。",
  [VOICE_FLOW_STAGE.RECORDING]: "正在录音，停止后将自动上传并解析。",
  [VOICE_FLOW_STAGE.RECORD_FINISHED]: "录音完成，正在准备上传。",
  [VOICE_FLOW_STAGE.UPLOADING]: "正在上传录音到云端。",
  [VOICE_FLOW_STAGE.UPLOADED]: "录音上传完成，准备开始识别。",
  [VOICE_FLOW_STAGE.TRANSCRIBING]: "正在识别你说的话。",
  [VOICE_FLOW_STAGE.TRANSCRIBED]: "语音识别完成，准备进行 AI 解析。",
  [VOICE_FLOW_STAGE.PARSING]: "AI 正在整理账单内容。",
  [VOICE_FLOW_STAGE.PARSED]: "已生成账单草稿，请确认添加或修改信息。",
  [VOICE_FLOW_STAGE.ERROR]: "处理失败，请重试。",
};

const VOICE_FLOW_PROGRESS = {
  [VOICE_FLOW_STAGE.IDLE]: {
    completeCount: 0,
    activeStep: "",
  },
  [VOICE_FLOW_STAGE.RECORDING]: {
    completeCount: 0,
    activeStep: VOICE_FLOW_STEP.RECORD,
  },
  [VOICE_FLOW_STAGE.RECORD_FINISHED]: {
    completeCount: 1,
    activeStep: "",
  },
  [VOICE_FLOW_STAGE.UPLOADING]: {
    completeCount: 1,
    activeStep: VOICE_FLOW_STEP.UPLOAD,
  },
  [VOICE_FLOW_STAGE.UPLOADED]: {
    completeCount: 2,
    activeStep: "",
  },
  [VOICE_FLOW_STAGE.TRANSCRIBING]: {
    completeCount: 2,
    activeStep: VOICE_FLOW_STEP.TRANSCRIBE,
  },
  [VOICE_FLOW_STAGE.TRANSCRIBED]: {
    completeCount: 3,
    activeStep: "",
  },
  [VOICE_FLOW_STAGE.PARSING]: {
    completeCount: 3,
    activeStep: VOICE_FLOW_STEP.PARSE,
  },
  [VOICE_FLOW_STAGE.PARSED]: {
    completeCount: 5,
    activeStep: "",
  },
};

function createFlowError(step, message) {
  const error = new Error(message);
  error.step = step;
  return error;
}

function buildVoiceFlowSteps(stage, errorStep) {
  if (stage === VOICE_FLOW_STAGE.ERROR && errorStep) {
    const errorIndex = VOICE_FLOW_STEP_LIST.findIndex((item) => item.key === errorStep);
    return VOICE_FLOW_STEP_LIST.map((item, index) => {
      if (index < errorIndex) {
        return {
          ...item,
          status: "done",
        };
      }

      if (index === errorIndex) {
        return {
          ...item,
          status: "error",
        };
      }

      return {
        ...item,
        status: "wait",
      };
    });
  }

  const progress = VOICE_FLOW_PROGRESS[stage] || VOICE_FLOW_PROGRESS[VOICE_FLOW_STAGE.IDLE];
  return VOICE_FLOW_STEP_LIST.map((item, index) => {
    if (index < progress.completeCount) {
      return {
        ...item,
        status: "done",
      };
    }

    if (item.key === progress.activeStep) {
      return {
        ...item,
        status: "active",
      };
    }

    return {
      ...item,
      status: "wait",
    };
  });
}

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

function getManualFormDefaultData() {
  const defaultCategory = getDefaultCategoryByType("expense");
  const categoryIndex = ALL_CATEGORIES.indexOf(defaultCategory);

  return {
    type: "expense",
    amount: "",
    ...buildCategorySelectionData(ALL_CATEGORIES, categoryIndex),
    date: today(),
    note: "",
  };
}

function getTypeText(type) {
  return type === "income" ? "收入" : "支出";
}

function normalizeVoiceDraft(draft) {
  const type = draft && draft.type === "income" ? "income" : "expense";
  const amountValue = Number(draft && draft.amount);
  const normalizedAmount = Number.isFinite(amountValue) && amountValue > 0
    ? Number(amountValue.toFixed(2))
    : "";
  const category = normalizeCategoryForStorage(draft && draft.category, type);
  const date = isValidDateString(draft && draft.date) ? draft.date : today();
  const note = typeof (draft && draft.note) === "string" ? draft.note.trim() : "";
  const categoryDisplay = getCategoryDisplay(category);

  return {
    amount: normalizedAmount,
    type,
    typeText: getTypeText(type),
    category,
    categoryIcon: categoryDisplay.icon,
    date,
    note,
  };
}

function normalizeDraftsForDisplay(drafts) {
  return (Array.isArray(drafts) ? drafts : []).map((draft) => normalizeVoiceDraft(draft));
}

function buildBillRecord(db, draft, transcript) {
  return buildVoiceBillRecord(db, {
    amount: draft && draft.amount,
    type: draft && draft.type,
    category: draft && draft.category,
    date: draft && draft.date,
    note: draft && draft.note,
    transcript,
  });
}

const DEFAULT_MANUAL_FORM_DATA = getManualFormDefaultData();

Page({
  data: {
    type: DEFAULT_MANUAL_FORM_DATA.type,
    amount: DEFAULT_MANUAL_FORM_DATA.amount,
    categoryOptions: ALL_CATEGORIES,
    categoryIndex: DEFAULT_MANUAL_FORM_DATA.categoryIndex,
    selectedCategoryText: DEFAULT_MANUAL_FORM_DATA.selectedCategoryText,
    selectedCategoryIcon: DEFAULT_MANUAL_FORM_DATA.selectedCategoryIcon,
    date: DEFAULT_MANUAL_FORM_DATA.date,
    note: DEFAULT_MANUAL_FORM_DATA.note,
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
    processTranscript: "",
    processResult: "",
    processError: "",
    parseStatus: PARSE_STATUS.IDLE,
    parseStatusText: PARSE_STATUS_TEXT[PARSE_STATUS.IDLE],
    parseMessage: "",
    parseDrafts: [],
    draftEditMode: false,
    parseMissingFields: [],
    parseMissingFieldsText: "",
    parseError: "",
    confirmSaving: false,
    voiceFlowStage: VOICE_FLOW_STAGE.IDLE,
    voiceFlowMessage: VOICE_FLOW_STAGE_MESSAGE[VOICE_FLOW_STAGE.IDLE],
    voiceFlowError: "",
    voiceFlowErrorStep: "",
    voiceFlowBusy: false,
    voiceFlowSteps: buildVoiceFlowSteps(VOICE_FLOW_STAGE.IDLE, ""),
  },

  onLoad() {
    this.isConfirmSaving = false;
    this.isManualSaving = false;
    this.isAutoVoiceProcessing = false;
    this.autoVoiceFlowId = 0;
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

  setParseState(status, extraData) {
    this.setData({
      parseStatus: status,
      parseStatusText: PARSE_STATUS_TEXT[status],
      ...(extraData || {}),
    });
  },

  setVoiceFlow(stage, extraData) {
    const nextData = extraData || {};
    const errorStep = nextData.errorStep || "";
    const message = nextData.message || VOICE_FLOW_STAGE_MESSAGE[stage] || "";
    const error = nextData.error || "";
    const busy = typeof nextData.busy === "boolean"
      ? nextData.busy
      : [
        VOICE_FLOW_STAGE.UPLOADING,
        VOICE_FLOW_STAGE.TRANSCRIBING,
        VOICE_FLOW_STAGE.PARSING,
      ].includes(stage);

    this.setData({
      voiceFlowStage: stage,
      voiceFlowMessage: message,
      voiceFlowError: error,
      voiceFlowErrorStep: errorStep,
      voiceFlowBusy: busy,
      voiceFlowSteps: buildVoiceFlowSteps(stage, errorStep),
    });
  },

  resetVoiceFlow(message) {
    this.setVoiceFlow(VOICE_FLOW_STAGE.IDLE, {
      message: message || VOICE_FLOW_STAGE_MESSAGE[VOICE_FLOW_STAGE.IDLE],
      error: "",
      errorStep: "",
      busy: false,
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
      processTranscript: "",
      processResult: "",
      processError: "",
    });
  },

  resetParseState() {
    this.setParseState(PARSE_STATUS.IDLE, {
      parseMessage: "",
      parseDrafts: [],
      draftEditMode: false,
      parseMissingFields: [],
      parseMissingFieldsText: "",
      parseError: "",
    });
  },

  resetCurrentVoiceSession(message) {
    this.autoVoiceFlowId += 1;
    this.isAutoVoiceProcessing = false;
    this.isConfirmSaving = false;

    this.clearRecordTimer();
    this.resetRecordProgress();
    this.stopPlayback();
    this.resetPlayState();
    this.resetUploadState();
    this.resetProcessState();
    this.resetParseState();
    this.setData({
      confirmSaving: false,
    });
    this.setRecordState(RECORD_STATUS.IDLE, {
      recordSeconds: 0,
      tempFilePath: "",
      recordError: "",
    });
    this.resetVoiceFlow(message || VOICE_FLOW_STAGE_MESSAGE[VOICE_FLOW_STAGE.IDLE]);
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
      this.autoVoiceFlowId += 1;
      this.isAutoVoiceProcessing = false;
      this.stopPlayback();
      this.resetRecordProgress();
      this.startRecordTimer();
      this.resetPlayState();
      this.resetUploadState();
      this.resetProcessState();
      this.resetParseState();
      this.setData({
        confirmSaving: false,
      });
      this.setVoiceFlow(VOICE_FLOW_STAGE.RECORDING, {
        error: "",
        errorStep: "",
        busy: false,
      });
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
      this.resetParseState();
      this.setData({
        confirmSaving: false,
      });

      const durationSeconds = typeof res.duration === "number"
        ? Math.max(0, Math.round(res.duration / 1000))
        : this.data.recordSeconds;
      const tempFilePath = res.tempFilePath || "";

      this.setRecordState(RECORD_STATUS.DONE, {
        recordSeconds: durationSeconds,
        tempFilePath,
        recordError: "",
      });

      if (!tempFilePath) {
        this.setVoiceFlow(VOICE_FLOW_STAGE.ERROR, {
          errorStep: VOICE_FLOW_STEP.RECORD,
          message: "录音完成后没有生成音频文件，请重试一次。",
          error: "录音完成后没有生成音频文件，请重试一次。",
          busy: false,
        });
        return;
      }

      this.setVoiceFlow(VOICE_FLOW_STAGE.RECORD_FINISHED, {
        busy: false,
      });
      this.startAutoVoiceFlow();
    });

    this.recorderManager.onError((error) => {
      console.error("recorder error:", error);
      this.clearRecordTimer();
      this.resetRecordProgress();
      this.stopPlayback();
      this.resetPlayState();
      this.resetUploadState();
      this.resetProcessState();
      this.resetParseState();
      this.setData({
        confirmSaving: false,
      });
      this.setVoiceFlow(VOICE_FLOW_STAGE.ERROR, {
        errorStep: VOICE_FLOW_STEP.RECORD,
        message: error && error.errMsg
          ? error.errMsg
          : "录音失败，请检查录音权限和设备状态。",
        error: error && error.errMsg
          ? error.errMsg
          : "录音失败，请检查录音权限和设备状态。",
        busy: false,
      });

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
      ...buildCategorySelectionData(this.data.categoryOptions, categoryIndex),
    });
  },

  onAmountInput(e) {
    this.setData({
      amount: e.detail.value,
    });
  },

  onCategoryChange(e) {
    this.setData({
      ...buildCategorySelectionData(this.data.categoryOptions, Number(e.detail.value)),
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
      ...buildCategorySelectionData(this.data.categoryOptions, categoryIndex),
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

  async onSave() {
    if (this.isManualSaving) {
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

    const category = this.data.categoryOptions[this.data.categoryIndex] || getDefaultCategoryByType(this.data.type);

    if (!wx.cloud || typeof wx.cloud.database !== "function") {
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
      return;
    }

    const db = wx.cloud.database();
    let billRecord;

    try {
      billRecord = buildManualBillRecord(db, {
        type: this.data.type,
        amount: this.data.amount,
        category,
        date: this.data.date,
        note: this.data.note,
      });
    } catch (err) {
      console.error(err);
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
      return;
    }

    this.isManualSaving = true;
    wx.showLoading({
      title: "保存中",
      mask: true,
    });

    try {
      await db.collection(BILLS_COLLECTION).add({
        data: billRecord,
      });

      this.setData(getManualFormDefaultData());

      wx.showToast({
        title: "已保存",
        icon: "success",
      });

      setTimeout(() => {
        wx.switchTab({
          url: "/pages/home/index",
        });
      }, 350);
    } catch (error) {
      console.error("manual save failed:", error);
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
    } finally {
      this.isManualSaving = false;
      wx.hideLoading();
    }
  },

  onStartRecordTap() {
    if (this.data.voiceFlowBusy || this.data.confirmSaving) {
      return;
    }

    if (this.data.parseDrafts.length) {
      wx.showToast({
        title: "请先确认或取消当前草稿",
        icon: "none",
      });
      return;
    }

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
        this.resetParseState();
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
        this.resetParseState();
        this.setData({
          confirmSaving: false,
        });
        this.setVoiceFlow(VOICE_FLOW_STAGE.ERROR, {
          errorStep: VOICE_FLOW_STEP.RECORD,
          message: error && error.errMsg
            ? error.errMsg
            : "录音权限获取失败，请允许使用麦克风。",
          error: error && error.errMsg
            ? error.errMsg
            : "录音权限获取失败，请允许使用麦克风。",
          busy: false,
        });
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
    if (this.data.voiceFlowBusy) {
      return;
    }

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

  scrollToDraftResult() {
    setTimeout(() => {
      if (typeof wx.pageScrollTo !== "function") {
        return;
      }

      wx.pageScrollTo({
        selector: "#voice-draft-result",
        duration: 260,
        fail: () => {},
      });
    }, 80);
  },

  async startAutoVoiceFlow() {
    if (this.isAutoVoiceProcessing || !this.data.tempFilePath) {
      return;
    }

    const flowId = this.autoVoiceFlowId;
    this.isAutoVoiceProcessing = true;

    try {
      this.setVoiceFlow(VOICE_FLOW_STAGE.UPLOADING);
      await this.uploadRecordFile();

      if (flowId !== this.autoVoiceFlowId) {
        return;
      }

      this.setVoiceFlow(VOICE_FLOW_STAGE.UPLOADED, {
        busy: false,
      });
      this.setVoiceFlow(VOICE_FLOW_STAGE.TRANSCRIBING);
      await this.submitProcessRequest();

      if (flowId !== this.autoVoiceFlowId) {
        return;
      }

      this.setVoiceFlow(VOICE_FLOW_STAGE.TRANSCRIBED, {
        busy: false,
      });
      this.setVoiceFlow(VOICE_FLOW_STAGE.PARSING);
      const drafts = await this.parseDraftRequest();

      if (flowId !== this.autoVoiceFlowId) {
        return;
      }

      this.setVoiceFlow(VOICE_FLOW_STAGE.PARSED, {
        message: drafts.length
          ? "已生成账单草稿，请确认添加或修改信息。"
          : VOICE_FLOW_STAGE_MESSAGE[VOICE_FLOW_STAGE.PARSED],
        busy: false,
      });
      this.scrollToDraftResult();
    } catch (error) {
      if (flowId !== this.autoVoiceFlowId) {
        return;
      }

      const errorMessage = error && error.message
        ? error.message
        : "语音处理失败，请重试。";
      const errorStep = error && error.step
        ? error.step
        : VOICE_FLOW_STEP.PARSE;

      this.setVoiceFlow(VOICE_FLOW_STAGE.ERROR, {
        errorStep,
        message: errorMessage,
        error: errorMessage,
        busy: false,
      });
    } finally {
      if (flowId === this.autoVoiceFlowId) {
        this.isAutoVoiceProcessing = false;
      }
    }
  },

  async uploadRecordFile() {
    if (!this.data.tempFilePath) {
      const message = "请先完成录音，再上传录音文件。";
      console.error(message);
      this.setUploadState(UPLOAD_STATUS.ERROR, {
        uploadFileID: "",
        uploadError: message,
      });
      throw createFlowError(VOICE_FLOW_STEP.UPLOAD, message);
    }

    if (!wx.cloud) {
      const message = "当前基础库不支持云开发，请先确认基础库版本。";
      console.error(message);
      this.setUploadState(UPLOAD_STATUS.ERROR, {
        uploadFileID: "",
        uploadError: message,
      });
      throw createFlowError(VOICE_FLOW_STEP.UPLOAD, message);
    }

    const cloudPath = this.buildUploadCloudPath();

    this.resetProcessState();
    this.resetParseState();
    this.setData({
      confirmSaving: false,
    });
    this.setUploadState(UPLOAD_STATUS.UPLOADING, {
      uploadFileID: "",
      uploadError: "",
    });

    try {
      const res = await wx.cloud.uploadFile({
        cloudPath,
        filePath: this.data.tempFilePath,
      });

      console.log("record upload success:", res);

      this.resetProcessState();
      this.resetParseState();
      this.setUploadState(UPLOAD_STATUS.SUCCESS, {
        uploadFileID: res.fileID || "",
        uploadError: "",
      });
      return res.fileID || "";
    } catch (error) {
      console.error("record upload failed:", error);

      const message = "录音上传失败，请重试。";
      this.resetProcessState();
      this.resetParseState();
      this.setUploadState(UPLOAD_STATUS.ERROR, {
        uploadFileID: "",
        uploadError: message,
      });
      throw createFlowError(VOICE_FLOW_STEP.UPLOAD, message);
    }
  },

  async submitProcessRequest() {
    if (!this.data.uploadFileID) {
      const message = "请先上传录音文件，再提交云端处理。";
      console.error(message);
      this.setProcessState(PROCESS_STATUS.ERROR, {
        processTranscript: "",
        processResult: "",
        processError: message,
      });
      throw createFlowError(VOICE_FLOW_STEP.TRANSCRIBE, message);
    }

    if (!wx.cloud) {
      const message = "当前基础库不支持云开发，请先确认基础库版本。";
      console.error(message);
      this.setProcessState(PROCESS_STATUS.ERROR, {
        processTranscript: "",
        processResult: "",
        processError: message,
      });
      throw createFlowError(VOICE_FLOW_STEP.TRANSCRIBE, message);
    }

    this.resetParseState();
    this.setProcessState(PROCESS_STATUS.PROCESSING, {
      processTranscript: "",
      processResult: "",
      processError: "",
    });

    try {
      const res = await wx.cloud.callFunction({
        name: "asrTranscribe",
        data: {
          fileID: this.data.uploadFileID,
          source: "recorder_upload",
          test: false,
        },
      });

      console.log("asrTranscribe process success:", res);

      const result = res.result || {};
      if (!result.ok) {
        const message = result.msg || "语音识别失败，请稍后重试。";
        this.setProcessState(PROCESS_STATUS.ERROR, {
          processTranscript: "",
          processResult: "",
          processError: message,
        });
        throw createFlowError(VOICE_FLOW_STEP.TRANSCRIBE, message);
      }

      this.setProcessState(PROCESS_STATUS.SUCCESS, {
        processTranscript: result.transcript || "",
        processResult: JSON.stringify(result, null, 2),
        processError: "",
      });
      return result.transcript || "";
    } catch (error) {
      if (error && error.step === VOICE_FLOW_STEP.TRANSCRIBE) {
        throw error;
      }

      console.error("asrTranscribe process failed:", error);

      const message = "语音识别失败，请稍后重试。";
      this.setProcessState(PROCESS_STATUS.ERROR, {
        processTranscript: "",
        processResult: "",
        processError: message,
      });
      throw createFlowError(VOICE_FLOW_STEP.TRANSCRIBE, message);
    }
  },

  async parseDraftRequest() {
    const transcript = (this.data.processTranscript || "").trim();
    if (!transcript) {
      const message = "请先完成云端处理，拿到 transcript 后再进行 AI 解析。";
      console.error(message);
      this.setParseState(PARSE_STATUS.ERROR, {
        parseMessage: "",
        parseDrafts: [],
        parseMissingFields: [],
        parseMissingFieldsText: "",
        parseError: message,
      });
      throw createFlowError(VOICE_FLOW_STEP.PARSE, message);
    }

    if (!wx.cloud) {
      const message = "当前基础库不支持云开发，请先确认基础库版本。";
      console.error(message);
      this.setParseState(PARSE_STATUS.ERROR, {
        parseMessage: "",
        parseDrafts: [],
        parseMissingFields: [],
        parseMissingFieldsText: "",
        parseError: message,
      });
      throw createFlowError(VOICE_FLOW_STEP.PARSE, message);
    }

    this.setParseState(PARSE_STATUS.PROCESSING, {
      parseMessage: "",
      parseDrafts: [],
      parseMissingFields: [],
      parseMissingFieldsText: "",
      parseError: "",
    });

    try {
      const res = await wx.cloud.callFunction({
        name: "parseBillDraft",
        data: {
          transcript,
        },
      });

      console.log("parseBillDraft success:", res);

      const result = res.result || {};
      if (!result.ok) {
        let message = "AI 解析失败，请重试。";

        if (result.message === "parse timeout") {
          message = "AI 解析超时，请重试一次。";
        } else if (result.message === "no valid drafts parsed") {
          message = "AI 没有识别出有效账单，请换一种说法重试。";
        } else if (result.error) {
          message = result.error;
        } else if (result.message) {
          message = result.message;
        }

        this.setParseState(PARSE_STATUS.ERROR, {
          parseMessage: "",
          parseDrafts: [],
          parseMissingFields: [],
          parseMissingFieldsText: "",
          parseError: message,
        });
        throw createFlowError(VOICE_FLOW_STEP.PARSE, message);
      }

      const drafts = Array.isArray(result.drafts) ? result.drafts : [];
      const missingFields = Array.isArray(result.missingFields) ? result.missingFields : [];

      this.setParseState(PARSE_STATUS.SUCCESS, {
        parseMessage: "已生成账单草稿，请确认添加或修改信息。",
        parseDrafts: normalizeDraftsForDisplay(drafts),
        draftEditMode: false,
        parseMissingFields: missingFields,
        parseMissingFieldsText: missingFields.join("、"),
        parseError: "",
      });
      return drafts;
    } catch (error) {
      if (error && error.step === VOICE_FLOW_STEP.PARSE) {
        throw error;
      }

      console.error("parseBillDraft failed:", error);

      const message = "AI 解析失败，请重试。";
      this.setParseState(PARSE_STATUS.ERROR, {
        parseMessage: "",
        parseDrafts: [],
        parseMissingFields: [],
        parseMissingFieldsText: "",
        parseError: message,
      });
      throw createFlowError(VOICE_FLOW_STEP.PARSE, message);
    }
  },

  async onUploadRecordTap() {
    if (this.data.voiceFlowBusy || this.data.parseDrafts.length) {
      return;
    }

    try {
      this.setVoiceFlow(VOICE_FLOW_STAGE.UPLOADING);
      await this.uploadRecordFile();
      this.setVoiceFlow(VOICE_FLOW_STAGE.UPLOADED, {
        message: "录音上传完成，可继续进行语音识别。",
        busy: false,
      });
    } catch (error) {
      console.error("manual upload failed:", error);
      this.setVoiceFlow(VOICE_FLOW_STAGE.ERROR, {
        errorStep: error && error.step ? error.step : VOICE_FLOW_STEP.UPLOAD,
        message: error && error.message ? error.message : "录音上传失败，请重试。",
        error: error && error.message ? error.message : "录音上传失败，请重试。",
        busy: false,
      });
    }
  },

  async onSubmitProcessTap() {
    if (this.data.voiceFlowBusy || this.data.parseDrafts.length) {
      return;
    }

    try {
      this.setVoiceFlow(VOICE_FLOW_STAGE.TRANSCRIBING);
      await this.submitProcessRequest();
      this.setVoiceFlow(VOICE_FLOW_STAGE.TRANSCRIBED, {
        message: "语音识别完成，可继续进行 AI 解析。",
        busy: false,
      });
    } catch (error) {
      console.error("manual process failed:", error);
      this.setVoiceFlow(VOICE_FLOW_STAGE.ERROR, {
        errorStep: error && error.step ? error.step : VOICE_FLOW_STEP.TRANSCRIBE,
        message: error && error.message ? error.message : "语音识别失败，请稍后重试。",
        error: error && error.message ? error.message : "语音识别失败，请稍后重试。",
        busy: false,
      });
    }
  },

  async onParseBillDraftTap() {
    if (this.data.voiceFlowBusy || this.data.parseDrafts.length) {
      return;
    }

    try {
      this.setVoiceFlow(VOICE_FLOW_STAGE.PARSING);
      const drafts = await this.parseDraftRequest();
      this.setVoiceFlow(VOICE_FLOW_STAGE.PARSED, {
        message: drafts.length
          ? "已生成账单草稿，请确认添加或修改信息。"
          : VOICE_FLOW_STAGE_MESSAGE[VOICE_FLOW_STAGE.PARSED],
        busy: false,
      });
      this.scrollToDraftResult();
    } catch (error) {
      console.error("manual parse failed:", error);
      this.setVoiceFlow(VOICE_FLOW_STAGE.ERROR, {
        errorStep: error && error.step ? error.step : VOICE_FLOW_STEP.PARSE,
        message: error && error.message ? error.message : "AI 解析失败，请重试。",
        error: error && error.message ? error.message : "AI 解析失败，请重试。",
        busy: false,
      });
    }
  },

  onRetryAutoFlowTap() {
    if (this.data.voiceFlowBusy || !this.data.tempFilePath) {
      return;
    }

    this.setVoiceFlow(VOICE_FLOW_STAGE.RECORD_FINISHED, {
      message: "准备重新处理这段录音。",
      busy: false,
    });
    this.startAutoVoiceFlow();
  },

  onRecordAgainTap() {
    if (this.data.voiceFlowBusy || this.data.confirmSaving) {
      return;
    }

    this.resetCurrentVoiceSession("准备好后重新录一段语音。");
  },

  onModifyDraftTap() {
    if (this.data.voiceFlowBusy || this.data.confirmSaving || !this.data.parseDrafts.length) {
      return;
    }

    if (this.data.parseDrafts.length === 1) {
      this.openDraftEditor(0);
      return;
    }

    this.setData({
      draftEditMode: true,
    });
  },

  onBackToDraftTap() {
    if (this.data.voiceFlowBusy || this.data.confirmSaving) {
      return;
    }

    this.setData({
      draftEditMode: false,
    });
  },

  onEditDraftTap(e) {
    const draftIndex = Number(e.currentTarget.dataset.index);
    this.openDraftEditor(draftIndex);
  },

  openDraftEditor(draftIndex) {
    if (
      this.data.voiceFlowBusy
      || this.data.confirmSaving
      || !Number.isInteger(draftIndex)
      || draftIndex < 0
      || draftIndex >= this.data.parseDrafts.length
    ) {
      return;
    }

    const draft = this.data.parseDrafts[draftIndex];
    const draftPayload = encodeURIComponent(JSON.stringify({
      amount: draft.amount,
      type: draft.type,
      category: draft.category,
      date: draft.date,
      note: draft.note,
    }));

    wx.navigateTo({
      url: `/pages/bill-edit/index?mode=draft&draftIndex=${draftIndex}&draft=${draftPayload}`,
      events: {
        draftSaved: (detail) => {
          this.onDraftSaved(detail);
        },
      },
      fail: (error) => {
        console.error("open draft editor failed:", error);
        wx.showToast({
          title: "打开修改页失败",
          icon: "none",
        });
      },
    });
  },

  onDraftSaved(detail) {
    const draftIndex = Number(detail && detail.draftIndex);
    if (
      !Number.isInteger(draftIndex)
      || draftIndex < 0
      || draftIndex >= this.data.parseDrafts.length
      || !detail
      || !detail.draft
    ) {
      return;
    }

    const nextDrafts = this.data.parseDrafts.slice();
    nextDrafts[draftIndex] = normalizeVoiceDraft(detail.draft);

    this.setData({
      parseDrafts: nextDrafts,
      draftEditMode: this.data.draftEditMode && nextDrafts.length > 1,
    });
  },

  async onConfirmDraftTap() {
    if (!this.data.parseDrafts.length) {
      wx.showToast({
        title: "当前没有可确认的草稿",
        icon: "none",
      });
      return;
    }

    if (this.isConfirmSaving) {
      return;
    }

    const transcript = (this.data.processTranscript || "").trim();
    if (!transcript) {
      const message = "当前缺少 transcript，无法保存账单。";
      console.error(message);
      this.setParseState(PARSE_STATUS.ERROR, {
        parseError: message,
      });
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
      return;
    }

    if (!wx.cloud || typeof wx.cloud.database !== "function") {
      const message = "当前基础库不支持云数据库，请先确认云开发配置。";
      console.error(message);
      this.setParseState(PARSE_STATUS.ERROR, {
        parseError: message,
      });
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
      return;
    }

    const db = wx.cloud.database();
    const billsCollection = db.collection(BILLS_COLLECTION);
    const records = this.data.parseDrafts
      .map((draft) => buildBillRecord(db, draft, transcript))
      .filter(Boolean);

    if (!records.length) {
      const message = "当前没有可保存的有效账单。";
      console.error(message);
      this.setParseState(PARSE_STATUS.ERROR, {
        parseError: message,
      });
      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
      return;
    }

    this.isConfirmSaving = true;
    this.setData({
      confirmSaving: true,
    });
    wx.showLoading({
      title: "保存中",
      mask: true,
    });

    try {
      const savedIds = [];

      for (const record of records) {
        const res = await billsCollection.add({
          data: record,
        });
        savedIds.push(res && res._id ? res._id : "");
      }

      console.log("confirm bill drafts saved:", savedIds);
      this.resetCurrentVoiceSession("已保存账单，可继续记一笔。");
      wx.showToast({
        title: `已保存${savedIds.length}笔`,
        icon: "success",
      });
    } catch (error) {
      console.error("confirm bill drafts failed:", error);
      const errorMessage = error && error.errMsg
        ? error.errMsg
        : error && error.message
          ? error.message
          : "保存到云数据库失败，请稍后重试。";

      this.setParseState(PARSE_STATUS.ERROR, {
        parseError: errorMessage,
      });

      wx.showToast({
        title: "保存失败",
        icon: "none",
      });
    } finally {
      this.isConfirmSaving = false;
      this.setData({
        confirmSaving: false,
      });
      wx.hideLoading();
    }
  },

  onCancelDraftTap() {
    if (this.data.voiceFlowBusy || this.data.confirmSaving) {
      return;
    }

    this.resetCurrentVoiceSession("已取消本次语音记账，可重新开始。");
    wx.showToast({
      title: "已取消",
      icon: "none",
    });
  },
});
