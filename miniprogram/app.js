const CLOUD_ENV_ID = "cloud1-7gegqr9w0d2b7cc7";
// TODO: 如果你后续切换了云环境，把上面的 env id 替换成你自己的当前环境。

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error("当前基础库不支持云开发，请升级微信或基础库版本。");
      return;
    }

    wx.cloud.init({
      env: CLOUD_ENV_ID,
      traceUser: true,
    });
  },
});
