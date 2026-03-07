const https = require("https");
const cloud = require("wx-server-sdk");

const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const ZHIPU_MODEL = "glm-4.7-flash";
const REQUEST_TIMEOUT_MS = 25000;
const ALLOWED_CATEGORIES = [
  "餐饮",
  "交通",
  "饮品",
  "其他",
];

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

function isTimeoutError(error) {
  const message = error && error.message ? error.message : "";
  return error && (
    error.code === "REQUEST_TIMEOUT"
    || error.code === "ETIMEDOUT"
    || message.includes("timeout")
  );
}

function callZhipuApi(apiKey, transcript) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model: ZHIPU_MODEL,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: [
            "你是中文记账提取助手。",
            "只返回多行纯文本。",
            "不要 JSON，不要 markdown，不要解释。",
            "每行固定格式：金额|分类|备注。",
            `分类只能是：${ALLOWED_CATEGORIES.join("、")}。`,
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "请从下面 transcript 中提取所有明确提到的账单。",
            "一行代表一笔账单。",
            "如果有多笔账单，就输出多行。",
            "如果没有可提取的账单，请返回空字符串。",
            "不要输出任何额外说明。",
            "每行格式固定为：金额|分类|备注",
            `分类只能是：${ALLOWED_CATEGORIES.join("、")}`,
            "示例：",
            "20|餐饮|早上吃饭",
            "20|交通|打车",
            "20|饮品|咖啡",
            "transcript:",
            transcript,
          ].join("\n"),
        },
      ],
    });

    const url = new URL(ZHIPU_API_URL);
    const req = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
      },
      timeout: REQUEST_TIMEOUT_MS,
    }, (res) => {
      let raw = "";

      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });

      res.on("end", () => {
        if (!raw) {
          reject(new Error("zhipu empty response"));
          return;
        }

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (error) {
          reject(new Error(`zhipu invalid json response: ${raw.slice(0, 200)}`));
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const apiMessage = parsed && parsed.error && parsed.error.message
            ? parsed.error.message
            : `HTTP ${res.statusCode}`;
          reject(new Error(apiMessage));
          return;
        }

        resolve(parsed);
      });
    });

    req.on("timeout", () => {
      const timeoutError = new Error(`zhipu request timeout after ${REQUEST_TIMEOUT_MS}ms`);
      timeoutError.code = "REQUEST_TIMEOUT";
      req.destroy(timeoutError);
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(requestBody);
    req.end();
  });
}

function extractModelReply(apiResponse) {
  const choice = apiResponse
    && Array.isArray(apiResponse.choices)
    && apiResponse.choices.length > 0
    ? apiResponse.choices[0]
    : null;

  const content = choice && choice.message ? choice.message.content : "";

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

function parseReplyLine(line) {
  const parts = String(line || "")
    .split("|")
    .map((item) => item.trim());

  if (parts.length !== 3) {
    return null;
  }

  const amount = Number(parts[0]);
  if (!Number.isFinite(amount)) {
    return null;
  }

  const category = parts[1];
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return null;
  }

  const note = parts[2];

  if (!note) {
    return null;
  }

  return {
    amount,
    category,
    note,
  };
}

function parseReply(rawReply) {
  return String(rawReply || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseReplyLine(line))
    .filter(Boolean);
}

exports.main = async (event) => {
  const transcript = event && typeof event.transcript === "string"
    ? event.transcript.trim()
    : "";

  console.log("parseBillDraft received transcript:", transcript);
  console.log("[step1] function start");

  try {
    if (!transcript) {
      throw new Error("transcript is required");
    }

    const apiKey = (process.env.ZHIPU_API_KEY || "").trim();
    if (!apiKey) {
      throw new Error("ZHIPU_API_KEY is missing");
    }

    console.log("[step2] api key exists");
    console.log("[step3] before request zhipu");

    const apiResponse = await callZhipuApi(apiKey, transcript);

    console.log("[step4] after request zhipu");

    const rawReply = extractModelReply(apiResponse);

    console.log("[step5] response received");
    console.log("[step6] json parse start");

    const drafts = parseReply(rawReply);
    if (!drafts.length) {
      return {
        ok: false,
        message: "no valid drafts parsed",
        rawReply,
      };
    }

    console.log("[step7] json parse success");
    console.log("[step8] function return success");

    return {
      ok: true,
      message: "parse success",
      transcript,
      drafts,
      rawReply,
    };
  } catch (error) {
    console.error("parseBillDraft failed:", error);

    if (isTimeoutError(error)) {
      return {
        ok: false,
        message: "parse timeout",
        error: "AI 解析超时，请重试一次",
      };
    }

    return {
      ok: false,
      message: "zhipu request failed",
      error: error && error.message ? error.message : "unknown error",
    };
  }
};
