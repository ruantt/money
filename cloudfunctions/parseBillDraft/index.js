const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

exports.main = async (event) => {
  const transcript = event && typeof event.transcript === "string"
    ? event.transcript.trim()
    : "";

  if (!transcript) {
    return {
      ok: false,
      message: "transcript 不能为空",
      drafts: [],
      missingFields: ["transcript"],
    };
  }

  console.log("parseBillDraft received transcript:", transcript);

  // TODO: 下一步在这里替换为真实大模型解析逻辑。
  // 当前阶段先返回固定 mock 数据，验证前后端链路和 UI 展示。
  return {
    ok: true,
    message: "解析成功",
    drafts: [
      {
        amount: 35,
        type: "expense",
        category: "餐饮",
        note: "午饭",
        dateText: "今天",
      },
      {
        amount: 28,
        type: "expense",
        category: "交通",
        note: "打车",
        dateText: "今天",
      },
    ],
    missingFields: [],
  };
};
