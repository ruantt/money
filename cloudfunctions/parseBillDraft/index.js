const https = require("https");
const cloud = require("wx-server-sdk");

const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const ZHIPU_MODEL = "glm-4.7-flash";
const REQUEST_TIMEOUT_MS = 50000;
const MAX_OUTPUT_TOKENS = 1024;
const EXPENSE_CATEGORIES = [
  "餐饮",
  "交通",
  "购物",
  "居家日用",
  "住房",
  "通讯网络",
  "医疗健康",
  "教育学习",
  "娱乐休闲",
  "人情往来",
  "运动健身",
];
const INCOME_CATEGORY = "收入";
const FALLBACK_CATEGORY = "其他";
const ALLOWED_CATEGORIES = [...EXPENSE_CATEGORIES, INCOME_CATEGORY, FALLBACK_CATEGORY];
const ALLOWED_TYPES = ["expense", "income"];
const CATEGORY_ALIASES = {
  旅行出行: "娱乐休闲",
  饮品: "餐饮",
};
const INCOME_KEYWORDS = [
  "工资",
  "发工资",
  "收到工资",
  "奖金",
  "收入",
  "收款",
  "报销到账",
  "提成",
  "转账收入",
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

function containsIncomeKeyword(text) {
  const content = typeof text === "string" ? text.trim() : "";
  if (!content) {
    return false;
  }

  return INCOME_KEYWORDS.some((keyword) => content.includes(keyword));
}

function normalizeCategory(category, type) {
  if (type === "income") {
    return INCOME_CATEGORY;
  }

  if (typeof category !== "string") {
    return FALLBACK_CATEGORY;
  }

  const text = category.trim();
  if (!text) {
    return FALLBACK_CATEGORY;
  }

  const mappedCategory = CATEGORY_ALIASES[text] || text;
  return ALLOWED_CATEGORIES.includes(mappedCategory)
    ? mappedCategory
    : FALLBACK_CATEGORY;
}

function normalizeType(type, category, note, line) {
  if (ALLOWED_TYPES.includes(type)) {
    return type;
  }

  const categoryText = typeof category === "string" ? category : "";
  const noteText = typeof note === "string" ? note : "";
  const lineText = typeof line === "string" ? line : "";
  const incomeHintText = `${categoryText}|${noteText}|${lineText}`;

  if (categoryText === INCOME_CATEGORY || containsIncomeKeyword(incomeHintText)) {
    return "income";
  }

  return "expense";
}

function normalizeNote(note, category, type) {
  if (typeof note === "string" && note.trim()) {
    return note.trim();
  }

  if (type === "income") {
    return "收入";
  }

  return category || FALLBACK_CATEGORY;
}

function buildSystemPrompt() {
  return [
    "你是中文记账抽取器，只做结构化提取。",
    "输出必须是 JSON 对象：{\"drafts\":[{\"amount\":数字,\"type\":\"expense|income\",\"category\":\"分类\",\"note\":\"备注\"}]}。",
    "没有可提取账单时返回 {\"drafts\":[]}。",
    `支出分类仅限：${EXPENSE_CATEGORIES.join("、")}。`,
    `收入固定为 type=income，category=${INCOME_CATEGORY}。`,
    `无法归类的支出分类写 ${FALLBACK_CATEGORY}。`,
    "工资、奖金、收款、报销到账、提成、转账收入等识别为收入。",
    "一句话包含多笔账单时拆成多个 drafts 项。",
    "不要输出任何 JSON 之外的内容。",
  ].join("\n");
}

function buildUserPrompt(transcript) {
  return [
    "从 transcript 中提取所有明确提到的账单。",
    "只提取金额明确的项目。",
    "note 只保留最短必要说明。",
    "transcript:",
    transcript,
  ].join("\n");
}

function callZhipuApi(apiKey, transcript) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model: ZHIPU_MODEL,
      thinking: {
        type: "disabled",
      },
      do_sample: false,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(),
        },
        {
          role: "user",
          content: buildUserPrompt(transcript),
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

  if (parts.length !== 4 && parts.length !== 3) {
    return null;
  }

  const rawType = parts.length === 4 ? parts[1] : "";
  const rawCategory = parts.length === 4 ? parts[2] : parts[1];
  const rawNote = parts.length === 4 ? parts[3] : parts[2];
  return buildDraft(parts[0], rawType, rawCategory, rawNote, line);
}

function buildDraft(amountValue, rawType, rawCategory, rawNote, context) {
  const amount = Number(amountValue);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const type = normalizeType(rawType, rawCategory, rawNote, context);
  const category = normalizeCategory(rawCategory, type);
  const note = normalizeNote(rawNote, category, type);

  return {
    amount: Number(amount.toFixed(2)),
    type,
    category,
    note,
  };
}

function parseJsonReply(rawReply) {
  const content = String(rawReply || "").trim();
  if (!content || (content[0] !== "{" && content[0] !== "[")) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return null;
  }

  let items = null;
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && Array.isArray(parsed.drafts)) {
    items = parsed.drafts;
  }

  if (!items) {
    return null;
  }

  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      return buildDraft(
        item.amount,
        item.type,
        item.category,
        item.note,
        JSON.stringify(item)
      );
    })
    .filter(Boolean);
}

function parseTextReply(rawReply) {
  return String(rawReply || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseReplyLine(line))
    .filter(Boolean);
}

function parseReply(rawReply) {
  const jsonDrafts = parseJsonReply(rawReply);
  if (jsonDrafts !== null) {
    return jsonDrafts;
  }

  return parseTextReply(rawReply);
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
