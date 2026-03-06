const cloud = require("wx-server-sdk");
const { asr } = require("tencentcloud-sdk-nodejs-asr");

const AsrClient = asr.v20190614.Client;

const TEST_TRANSCRIPT = "\u4eca\u5929\u5348\u996d35\uff0c\u6253\u8f6628";
const MAX_INLINE_AUDIO_BYTES = 5 * 1024 * 1024;
const DEFAULT_REGION = process.env.ASR_REGION || process.env.TENCENTCLOUD_REGION || "ap-guangzhou";
const DEFAULT_ENGINE_MODEL_TYPE = process.env.ASR_ENGINE_MODEL_TYPE || "16k_zh";
const DEFAULT_CHANNEL_NUM = readPositiveInt("ASR_CHANNEL_NUM", 1);
const DEFAULT_RES_TEXT_FORMAT = readNonNegativeInt("ASR_RES_TEXT_FORMAT", 2);
const DEFAULT_POLL_INTERVAL_MS = readPositiveInt("ASR_POLL_INTERVAL_MS", 1500);
const DEFAULT_POLL_TIMEOUT_MS = readPositiveInt("ASR_POLL_TIMEOUT_MS", 120000);

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

function readPositiveInt(name, defaultValue) {
  const rawValue = process.env[name];
  if (!rawValue) {
    return defaultValue;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultValue;
}

function readNonNegativeInt(name, defaultValue) {
  const rawValue = process.env[name];
  if (!rawValue) {
    return defaultValue;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : defaultValue;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildTestResponse(event) {
  return {
    ok: true,
    msg: "cloud function works",
    transcript: TEST_TRANSCRIPT,
    event,
  };
}

function buildErrorResponse(fileID, message) {
  return {
    ok: false,
    stage: "real_asr_processing",
    fileID: fileID || "",
    transcript: "",
    parsed: {
      rawText: "",
    },
    msg: message,
  };
}

function getRuntimeCredential() {
  const hasAsrSecretId = Boolean(process.env.ASR_SECRET_ID);
  const hasAsrSecretKey = Boolean(process.env.ASR_SECRET_KEY);

  console.log("asr credential env:", {
    hasAsrSecretId,
    hasAsrSecretKey,
    region: DEFAULT_REGION,
  });

  const useAsrCredential = hasAsrSecretId && hasAsrSecretKey;
  const secretId = useAsrCredential
    ? process.env.ASR_SECRET_ID
    : (process.env.TENCENTCLOUD_SECRETID || "");
  const secretKey = useAsrCredential
    ? process.env.ASR_SECRET_KEY
    : (process.env.TENCENTCLOUD_SECRETKEY || "");
  const token = useAsrCredential
    ? (process.env.ASR_SESSION_TOKEN || "")
    : (process.env.TENCENTCLOUD_SESSIONTOKEN || "");

  if (!secretId || !secretKey) {
    throw new Error(
      "Missing ASR credentials. Please configure ASR_SECRET_ID / ASR_SECRET_KEY or ensure Tencent Cloud runtime credentials are available."
    );
  }

  return token
    ? { secretId, secretKey, token }
    : { secretId, secretKey };
}

function getAsrClient() {
  return new AsrClient({
    credential: getRuntimeCredential(),
    region: DEFAULT_REGION,
    profile: {
      httpProfile: {
        endpoint: "asr.tencentcloudapi.com",
      },
    },
  });
}

async function downloadAudioBuffer(fileID) {
  const result = await cloud.downloadFile({
    fileID,
  });

  if (!result || !result.fileContent) {
    throw new Error("downloadFile returned empty fileContent.");
  }

  if (Buffer.isBuffer(result.fileContent)) {
    return result.fileContent;
  }

  return Buffer.from(result.fileContent);
}

function extractTranscript(taskStatus) {
  if (taskStatus && Array.isArray(taskStatus.ResultDetail) && taskStatus.ResultDetail.length > 0) {
    const detailedText = taskStatus.ResultDetail
      .map((item) => item && (item.FinalSentence || item.SliceSentence || ""))
      .join("")
      .trim();

    if (detailedText) {
      return detailedText;
    }
  }

  const fallbackText = taskStatus && typeof taskStatus.Result === "string"
    ? taskStatus.Result
    : "";

  return fallbackText
    .replace(/\[[^\]]+\]\s*/g, "")
    .replace(/\n/g, "")
    .trim();
}

async function createRecognitionTask(client, audioBuffer) {
  const response = await client.CreateRecTask({
    EngineModelType: DEFAULT_ENGINE_MODEL_TYPE,
    ChannelNum: DEFAULT_CHANNEL_NUM,
    ResTextFormat: DEFAULT_RES_TEXT_FORMAT,
    SourceType: 1,
    Data: audioBuffer.toString("base64"),
    DataLen: audioBuffer.length,
  });

  const taskId = response && response.Data && response.Data.TaskId;
  if (!taskId) {
    throw new Error(
      `CreateRecTask succeeded but TaskId is missing. RequestId: ${response && response.RequestId ? response.RequestId : ""}`
    );
  }

  return taskId;
}

async function waitForTaskResult(client, taskId) {
  const startTime = Date.now();

  while (Date.now() - startTime < DEFAULT_POLL_TIMEOUT_MS) {
    const response = await client.DescribeTaskStatus({
      TaskId: taskId,
    });

    const taskStatus = response && response.Data;
    console.log("asr task polling", {
      taskId,
      status: taskStatus && typeof taskStatus.Status !== "undefined" ? taskStatus.Status : null,
      statusStr: taskStatus && taskStatus.StatusStr ? taskStatus.StatusStr : "",
      requestId: response && response.RequestId ? response.RequestId : "",
    });

    if (!taskStatus) {
      throw new Error("DescribeTaskStatus returned empty Data.");
    }

    if (taskStatus.Status === 2 || taskStatus.StatusStr === "success") {
      return taskStatus;
    }

    if (taskStatus.Status === 3 || taskStatus.StatusStr === "failed") {
      throw new Error(taskStatus.ErrorMsg || "ASR task failed.");
    }

    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  throw new Error(
    `ASR polling timed out after ${DEFAULT_POLL_TIMEOUT_MS}ms. Increase ASR_POLL_TIMEOUT_MS if your audio is longer.`
  );
}

exports.main = async (event) => {
  if (event && event.test) {
    return buildTestResponse(event);
  }

  const fileID = event && typeof event.fileID === "string" ? event.fileID.trim() : "";
  if (!fileID) {
    return buildErrorResponse("", "fileID is required");
  }

  try {
    console.log("asrTranscribe received fileID:", fileID);
    console.log("asrTranscribe source:", event && event.source ? event.source : "");

    const audioBuffer = await downloadAudioBuffer(fileID);
    console.log("downloaded audio bytes:", audioBuffer.length);

    if (audioBuffer.length === 0) {
      throw new Error("Downloaded audio file is empty.");
    }

    if (audioBuffer.length > MAX_INLINE_AUDIO_BYTES) {
      throw new Error(
        "Audio file is larger than 5MB. Current implementation uses inline audio data for ASR. Reduce recording size or switch to URL mode."
      );
    }

    const client = getAsrClient();
    const taskId = await createRecognitionTask(client, audioBuffer);
    console.log("asr task created:", taskId);

    const taskStatus = await waitForTaskResult(client, taskId);
    const transcript = extractTranscript(taskStatus);

    if (!transcript) {
      throw new Error("ASR finished but transcript is empty.");
    }

    return {
      ok: true,
      stage: "real_asr_processing",
      fileID,
      transcript,
      parsed: {
        rawText: transcript,
      },
      msg: "real asr success",
    };
  } catch (error) {
    console.error("asrTranscribe real asr failed:", error);

    return buildErrorResponse(
      fileID,
      error && error.message ? error.message : "real asr failed"
    );
  }
};
