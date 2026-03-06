const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

exports.main = async (event) => {
  return {
    ok: true,
    msg: "cloud function works",
    transcript: "今天午饭35，打车28",
    event,
  };
};
