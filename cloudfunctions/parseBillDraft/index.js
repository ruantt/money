const https = require("https");
const cloud = require("wx-server-sdk");

const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const ZHIPU_MODEL = "glm-4.7-flash";
const REQUEST_TIMEOUT_MS = 50000;
const MAX_OUTPUT_TOKENS = 1024;
const EXPENSE_CATEGORIES = [
  "\u9910\u996e",
  "\u4ea4\u901a",
  "\u8d2d\u7269",
  "\u5c45\u5bb6\u65e5\u7528",
  "\u4f4f\u623f",
  "\u901a\u8baf\u7f51\u7edc",
  "\u533b\u7597\u5065\u5eb7",
  "\u6559\u80b2\u5b66\u4e60",
  "\u5a31\u4e50\u4f11\u95f2",
  "\u4eba\u60c5\u5f80\u6765",
  "\u8fd0\u52a8\u5065\u8eab",
];
const INCOME_CATEGORY = "\u6536\u5165";
const FALLBACK_CATEGORY = "\u5176\u4ed6";
const ALLOWED_CATEGORIES = [...EXPENSE_CATEGORIES, INCOME_CATEGORY, FALLBACK_CATEGORY];
const ALLOWED_TYPES = ["expense", "income"];
const CATEGORY_ALIASES = {
  "\u65c5\u884c\u51fa\u884c": "\u5a31\u4e50\u4f11\u95f2",
  "\u996e\u54c1": "\u9910\u996e",
};
const INCOME_KEYWORDS = [
  "\u5de5\u8d44",
  "\u53d1\u5de5\u8d44",
  "\u516c\u53f8\u53d1\u4e86",
  "\u5956\u91d1",
  "\u6536\u5230",
  "\u6536\u6b3e",
  "\u5230\u8d26",
  "\u62a5\u9500",
  "\u62a5\u9500\u5230\u8d26",
  "\u9000\u6b3e",
  "\u9000\u6b3e\u5230\u8d26",
  "\u63d0\u6210",
  "\u8f6c\u8d26\u6536\u5165",
  "\u6536\u5165",
];
const CLAUSE_SPLIT_REGEX = /[\r\n\uff0c,\u3002\uff01\uff1f\uff1b;]+/;
const AMOUNT_PATTERN = /(?:[\u00A5\uFFE5]|\u4eba\u6c11\u5e01)?\s*(\d+(?:\.\d{1,2})?)/g;

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

function extractClauseAmount(text) {
  const content = typeof text === "string" ? text : "";
  if (!content) {
    return null;
  }

  const matches = Array.from(content.matchAll(AMOUNT_PATTERN))
    .map((match) => Number(match[1]))
    .filter((amount) => Number.isFinite(amount) && amount > 0);

  if (!matches.length) {
    return null;
  }

  return Number(matches[matches.length - 1].toFixed(2));
}

function inferIncomeNote(text) {
  const content = typeof text === "string" ? text.trim() : "";
  if (!content) {
    return INCOME_CATEGORY;
  }

  if (
    content.includes("\u9000\u6b3e\u5230\u8d26")
    || (content.includes("\u9000\u6b3e") && content.includes("\u5230\u8d26"))
  ) {
    return "\u9000\u6b3e\u5230\u8d26";
  }

  if (
    content.includes("\u62a5\u9500\u5230\u8d26")
    || (content.includes("\u62a5\u9500") && content.includes("\u5230\u8d26"))
  ) {
    return "\u62a5\u9500\u5230\u8d26";
  }

  if (content.includes("\u5956\u91d1")) {
    return "\u5956\u91d1";
  }

  if (
    content.includes("\u516c\u53f8\u53d1\u4e86")
    || content.includes("\u516c\u53f8\u53d1\u5de5\u8d44")
  ) {
    return "\u516c\u53f8\u53d1\u5de5\u8d44";
  }

  if (content.includes("\u53d1\u5de5\u8d44") || content.includes("\u5de5\u8d44")) {
    return "\u5de5\u8d44";
  }

  if (content.includes("\u6536\u6b3e")) {
    return "\u6536\u6b3e";
  }

  if (content.includes("\u5230\u8d26")) {
    return "\u5230\u8d26";
  }

  if (content.includes("\u6536\u5230")) {
    return INCOME_CATEGORY;
  }

  return INCOME_CATEGORY;
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

function normalizeNote(note, category, type, context) {
  if (typeof note === "string" && note.trim()) {
    return note.trim();
  }

  if (type === "income") {
    return inferIncomeNote(context);
  }

  return category || FALLBACK_CATEGORY;
}

function buildSystemPrompt() {
  return [
    "\u4f60\u662f\u4e2d\u6587\u8bb0\u8d26\u62bd\u53d6\u5668\uff0c\u53ea\u505a\u7ed3\u6784\u5316\u63d0\u53d6\u3002",
    "\u8f93\u51fa\u5fc5\u987b\u662f JSON \u5bf9\u8c61\uff1a{\"drafts\":[{\"amount\":\u6570\u5b57,\"type\":\"expense|income\",\"category\":\"\u5206\u7c7b\",\"note\":\"\u5907\u6ce8\"}]}\u3002",
    "\u6ca1\u6709\u53ef\u63d0\u53d6\u8d26\u5355\u65f6\u8fd4\u56de {\"drafts\":[]}\u3002",
    "\u4e25\u683c\u4f7f\u7528 type\uff0ctype \u53ea\u80fd\u662f expense \u6216 income\u3002",
    `\u652f\u51fa\u5206\u7c7b\u4ec5\u9650\uff1a${EXPENSE_CATEGORIES.join("\u3001")}\u3002`,
    `\u6536\u5165\u56fa\u5b9a\u4e3a type=income\uff0ccategory=${INCOME_CATEGORY}\u3002`,
    `\u65e0\u6cd5\u5f52\u7c7b\u7684\u652f\u51fa\u5206\u7c7b\u5199 ${FALLBACK_CATEGORY}\u3002`,
    "\u4ee5\u4e0b\u8bed\u4e49\u9ed8\u8ba4\u4f18\u5148\u8bc6\u522b\u4e3a\u6536\u5165\uff1a\u5de5\u8d44\u3001\u53d1\u5de5\u8d44\u3001\u516c\u53f8\u53d1\u4e86\u3001\u5956\u91d1\u3001\u6536\u5230\u3001\u6536\u6b3e\u3001\u5230\u8d26\u3001\u62a5\u9500\u5230\u8d26\u3001\u9000\u6b3e\u5230\u8d26\u3002",
    "\u5de5\u8d44\u3001\u5956\u91d1\u3001\u62a5\u9500\u5230\u8d26\u3001\u6536\u6b3e\u3001\u9000\u6b3e\u5230\u8d26\u7b49\uff0c\u5fc5\u987b\u8bc6\u522b\u4e3a type=income\uff0ccategory=\u6536\u5165\u3002",
    "\u4e00\u53e5\u8bdd\u540c\u65f6\u5305\u542b\u6536\u5165\u548c\u652f\u51fa\u65f6\uff0c\u5fc5\u987b\u62c6\u6210\u591a\u7b14 drafts\u3002",
    "\u6bcf\u4e00\u7b14 drafts \u7b49\u4ef7\u4e8e\u4e00\u884c\u201c\u91d1\u989d|\u7c7b\u578b|\u5206\u7c7b|\u5907\u6ce8\u201d\uff0c\u4e0d\u5141\u8bb8\u4f7f\u7528\u65e7\u7684 3 \u5217\u683c\u5f0f\u3002",
    "\u793a\u4f8b\uff1a\u4eca\u5929\u516c\u53f8\u53d1\u4e865000\uff0c\u4e70\u82b1\u513f\u82b1\u4e8680\u3002\u6253\u8f66\u82b1\u4e8650\u3002",
    `\u5bf9\u5e94 drafts\uff1a[{\"amount\":5000,\"type\":\"income\",\"category\":\"${INCOME_CATEGORY}\",\"note\":\"\u516c\u53f8\u53d1\u5de5\u8d44\"},{\"amount\":80,\"type\":\"expense\",\"category\":\"${FALLBACK_CATEGORY}\",\"note\":\"\u4e70\u82b1\u513f\"},{\"amount\":50,\"type\":\"expense\",\"category\":\"\u4ea4\u901a\",\"note\":\"\u6253\u8f66\"}]\u3002`,
    "\u4e0d\u8981\u8f93\u51fa\u4efb\u4f55 JSON \u4e4b\u5916\u7684\u5185\u5bb9\u3002",
  ].join("\n");
}

function buildUserPrompt(transcript) {
  return [
    "\u4ece transcript \u4e2d\u63d0\u53d6\u6240\u6709\u660e\u786e\u63d0\u5230\u7684\u8d26\u5355\u3002",
    "\u53ea\u63d0\u53d6\u91d1\u989d\u660e\u786e\u7684\u9879\u76ee\u3002",
    "\u5982\u679c\u4e00\u53e5\u8bdd\u540c\u65f6\u6709\u6536\u5165\u548c\u652f\u51fa\uff0c\u5fc5\u987b\u62c6\u6210\u591a\u7b14\u3002",
    "\u5de5\u8d44\u3001\u516c\u53f8\u53d1\u4e86\u3001\u5956\u91d1\u3001\u6536\u5230\u3001\u6536\u6b3e\u3001\u5230\u8d26\u3001\u62a5\u9500\u5230\u8d26\u3001\u9000\u6b3e\u5230\u8d26\u7b49\uff0c\u9ed8\u8ba4\u6309\u6536\u5165\u5904\u7406\u3002",
    "note \u53ea\u4fdd\u7559\u6700\u77ed\u5fc5\u8981\u8bf4\u660e\u3002",
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
  const note = normalizeNote(rawNote, category, type, context);

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
    .filter((line) => line !== "```")
    .map((line) => parseReplyLine(line))
    .filter(Boolean);
}

function buildIncomeFallbackDrafts(transcript) {
  const content = typeof transcript === "string" ? transcript.trim() : "";
  if (!content) {
    return [];
  }

  return content
    .split(CLAUSE_SPLIT_REGEX)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .map((clause) => {
      if (!containsIncomeKeyword(clause)) {
        return null;
      }

      const amount = extractClauseAmount(clause);
      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      return buildDraft(
        amount,
        "income",
        INCOME_CATEGORY,
        inferIncomeNote(clause),
        clause
      );
    })
    .filter(Boolean);
}

function buildDraftKey(draft) {
  const amountText = Number(draft.amount).toFixed(2);

  if (draft.type === "income") {
    return `${draft.type}|${draft.category}|${amountText}`;
  }

  return `${draft.type}|${draft.category}|${amountText}|${draft.note}`;
}

function findDraftOrder(draft, transcript, fallbackOrder) {
  const content = typeof transcript === "string" ? transcript : "";
  if (draft && typeof draft.note === "string" && draft.note && draft.note !== INCOME_CATEGORY) {
    const noteIndex = content.indexOf(draft.note);
    if (noteIndex >= 0) {
      return noteIndex;
    }
  }

  if (draft && Number.isFinite(Number(draft.amount))) {
    const amount = Number(draft.amount);
    const amountCandidates = Number.isInteger(amount)
      ? [amount.toFixed(0)]
      : [amount.toFixed(2), String(amount)];
    const amountIndexes = amountCandidates
      .map((candidate) => content.indexOf(candidate))
      .filter((index) => index >= 0);

    if (amountIndexes.length) {
      return Math.min(...amountIndexes);
    }
  }

  return fallbackOrder;
}

function mergeDrafts(modelDrafts, fallbackDrafts, transcript) {
  const result = [];
  const seen = new Set();
  const pushDraft = (draft) => {
    const key = buildDraftKey(draft);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(draft);
  };

  modelDrafts.forEach(pushDraft);
  fallbackDrafts.forEach(pushDraft);

  return result
    .map((draft, index) => ({
      draft,
      order: findDraftOrder(draft, transcript, Number.MAX_SAFE_INTEGER - result.length + index),
      index,
    }))
    .sort((a, b) => {
      if (a.order === b.order) {
        return a.index - b.index;
      }
      return a.order - b.order;
    })
    .map((item) => item.draft);
}

function parseReply(rawReply, transcript) {
  const jsonDrafts = parseJsonReply(rawReply);
  const modelDrafts = jsonDrafts !== null ? jsonDrafts : parseTextReply(rawReply);
  const fallbackDrafts = buildIncomeFallbackDrafts(transcript);
  return mergeDrafts(modelDrafts, fallbackDrafts, transcript);
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

    const drafts = parseReply(rawReply, transcript);
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
        error: "AI \u89e3\u6790\u8d85\u65f6\uff0c\u8bf7\u91cd\u8bd5\u4e00\u6b21",
      };
    }

    return {
      ok: false,
      message: "zhipu request failed",
      error: error && error.message ? error.message : "unknown error",
    };
  }
};
