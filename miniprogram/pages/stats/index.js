const echarts = require("../../components/ec-canvas/echarts");
const { getCategoryDisplay } = require("../../utils/constants");
const { fetchBills, formatMoney, getBillCategory, getBillDate, getBillType } = require("../../utils/bills");

const FILTER_MODE = {
  ALL: "all",
  CURRENT_MONTH: "currentMonth",
  CUSTOM_MONTH: "customMonth",
};

const BRAND_BLUE = "#5B8DEF";
const DONUT_COLORS = [
  "#6F8FEA",
  "#8BA7D8",
  "#A8C0BF",
  "#D6A77A",
  "#D18D8D",
  "#A38CC6",
  "#7EB7B1",
  "#C2A36B",
  "#E0B3A7",
  "#88A1B5",
  "#9DB99C",
];

function buildCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildRangeLabel(filterMode, selectedMonth) {
  if (filterMode === FILTER_MODE.CURRENT_MONTH) {
    return `本月（${buildCurrentMonthKey()}）`;
  }

  if (filterMode === FILTER_MODE.CUSTOM_MONTH) {
    return `指定月份（${selectedMonth}）`;
  }

  return "全部时间";
}

function buildTrendRangeText(filterMode, selectedMonth) {
  if (filterMode === FILTER_MODE.ALL) {
    return "最近 30 个有支出记录的日期";
  }

  const monthKey = filterMode === FILTER_MODE.CURRENT_MONTH
    ? buildCurrentMonthKey()
    : selectedMonth;

  return `${monthKey} 日维度`;
}

function getMonthDayCount(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return 30;
  }

  const [year, month] = monthKey.split("-").map((item) => Number(item));
  return new Date(year, month, 0).getDate();
}

function filterBillsByMode(rawBills, filterMode, selectedMonth) {
  if (filterMode === FILTER_MODE.ALL) {
    return rawBills;
  }

  const targetMonth = filterMode === FILTER_MODE.CURRENT_MONTH
    ? buildCurrentMonthKey()
    : selectedMonth;

  return rawBills.filter((item) => {
    const billDate = getBillDate(item);
    return billDate && billDate.slice(0, 7) === targetMonth;
  });
}

function buildCategoryRows(categoryMap, totalAmount) {
  return Object.keys(categoryMap)
    .map((category) => {
      const amountValue = categoryMap[category];
      const categoryDisplay = getCategoryDisplay(category);
      return {
        category: categoryDisplay.name,
        categoryIcon: categoryDisplay.icon,
        amount_value: amountValue,
        amount_text: formatMoney(amountValue),
        ratio_text: totalAmount > 0 ? `${((amountValue / totalAmount) * 100).toFixed(1)}%` : "0.0%",
      };
    })
    .sort((a, b) => b.amount_value - a.amount_value);
}

function buildMonthlyExpenseTrend(filteredBills, monthKey) {
  const dayCount = getMonthDayCount(monthKey);
  const dailyValues = Array.from({ length: dayCount }, () => 0);

  filteredBills.forEach((item) => {
    if (getBillType(item) === "income") {
      return;
    }

    const amount = Number(item && item.amount);
    const billDate = getBillDate(item);
    if (!Number.isFinite(amount) || amount <= 0 || !billDate || billDate.slice(0, 7) !== monthKey) {
      return;
    }

    const dayIndex = Number(billDate.slice(8, 10)) - 1;
    if (dayIndex >= 0 && dayIndex < dailyValues.length) {
      dailyValues[dayIndex] += amount;
    }
  });

  return {
    labels: Array.from({ length: dayCount }, (_, index) => `${index + 1}`),
    values: dailyValues.map((value) => Number(value.toFixed(2))),
    hasData: dailyValues.some((value) => value > 0),
  };
}

function buildAllExpenseTrend(filteredBills) {
  const expenseByDate = {};

  filteredBills.forEach((item) => {
    if (getBillType(item) === "income") {
      return;
    }

    const amount = Number(item && item.amount);
    const billDate = getBillDate(item);
    if (!Number.isFinite(amount) || amount <= 0 || !billDate) {
      return;
    }

    expenseByDate[billDate] = (expenseByDate[billDate] || 0) + amount;
  });

  const dateKeys = Object.keys(expenseByDate).sort().slice(-30);

  return {
    labels: dateKeys.map((dateKey) => dateKey.slice(5).replace("-", "/")),
    values: dateKeys.map((dateKey) => Number(expenseByDate[dateKey].toFixed(2))),
    hasData: dateKeys.length > 0,
  };
}

function buildExpenseTrend(filteredBills, filterMode, selectedMonth) {
  if (filterMode === FILTER_MODE.ALL) {
    return Object.assign({}, buildAllExpenseTrend(filteredBills), {
      rangeText: buildTrendRangeText(filterMode, selectedMonth),
    });
  }

  const targetMonth = filterMode === FILTER_MODE.CURRENT_MONTH
    ? buildCurrentMonthKey()
    : selectedMonth;

  return Object.assign({}, buildMonthlyExpenseTrend(filteredBills, targetMonth), {
    rangeText: buildTrendRangeText(filterMode, selectedMonth),
  });
}

function buildExpenseDonutData(expenseCategories) {
  return expenseCategories.map((item, index) => {
    return {
      value: Number(item.amount_value.toFixed(2)),
      name: item.category,
      itemStyle: {
        color: DONUT_COLORS[index % DONUT_COLORS.length],
      },
    };
  });
}

function buildExpenseTrendOption(labels, values) {
  return {
    animation: true,
    animationDuration: 500,
    grid: {
      top: 28,
      right: 8,
      bottom: 12,
      left: 0,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(15, 23, 42, 0.9)",
      borderWidth: 0,
      padding: [8, 12],
      textStyle: {
        color: "#ffffff",
        fontSize: 11,
      },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: labels,
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: "#8A94A6",
        fontSize: 11,
        interval: labels.length > 16 ? Math.ceil(labels.length / 8) - 1 : 0,
      },
    },
    yAxis: {
      type: "value",
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      splitLine: {
        show: false,
      },
      axisLabel: {
        color: "#A0AEC0",
        fontSize: 11,
      },
    },
    series: [
      {
        type: "line",
        smooth: true,
        showSymbol: labels.length <= 12,
        symbol: "circle",
        symbolSize: 6,
        data: values,
        lineStyle: {
          width: 3,
          color: BRAND_BLUE,
        },
        itemStyle: {
          color: BRAND_BLUE,
          borderColor: "#ffffff",
          borderWidth: 2,
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: "rgba(91, 141, 239, 0.30)",
            },
            {
              offset: 1,
              color: "rgba(91, 141, 239, 0.03)",
            },
          ]),
        },
      },
    ],
  };
}

function buildExpenseDonutOption(totalExpenseText, donutData) {
  return {
    color: DONUT_COLORS,
    animation: true,
    animationDuration: 500,
    title: {
      text: `¥${totalExpenseText}`,
      subtext: "总支出",
      left: "center",
      top: "32%",
      textAlign: "center",
      textStyle: {
        color: "#162033",
        fontSize: 18,
        fontWeight: "700",
      },
      subtextStyle: {
        color: "#8A94A6",
        fontSize: 11,
        lineHeight: 16,
      },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(15, 23, 42, 0.9)",
      borderWidth: 0,
      padding: [8, 12],
      textStyle: {
        color: "#ffffff",
        fontSize: 11,
      },
      formatter: "{b}<br/>{c} ({d}%)",
    },
    series: [
      {
        type: "pie",
        radius: ["58%", "78%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: false,
        label: {
          show: false,
        },
        labelLine: {
          show: false,
        },
        itemStyle: {
          borderColor: "#ffffff",
          borderWidth: 4,
        },
        emphasis: {
          scale: true,
          scaleSize: 8,
        },
        data: donutData,
      },
    ],
  };
}

function buildStatsData(rawBills, filterMode, selectedMonth) {
  const filteredBills = filterBillsByMode(rawBills, filterMode, selectedMonth);
  let totalExpenseValue = 0;
  let totalIncomeValue = 0;
  const expenseByCategory = {};
  const incomeByCategory = {};

  filteredBills.forEach((item) => {
    const amount = Number(item && item.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const type = getBillType(item);
    const category = getBillCategory(item);

    if (type === "income") {
      totalIncomeValue += amount;
      incomeByCategory[category] = (incomeByCategory[category] || 0) + amount;
      return;
    }

    totalExpenseValue += amount;
    expenseByCategory[category] = (expenseByCategory[category] || 0) + amount;
  });

  const expenseCategories = buildCategoryRows(expenseByCategory, totalExpenseValue);
  const incomeCategories = buildCategoryRows(incomeByCategory, totalIncomeValue);
  const expenseTrend = buildExpenseTrend(filteredBills, filterMode, selectedMonth);

  return {
    rangeLabel: buildRangeLabel(filterMode, selectedMonth),
    billCount: filteredBills.length,
    totalExpense: formatMoney(totalExpenseValue),
    totalIncome: formatMoney(totalIncomeValue),
    balance: formatMoney(totalIncomeValue - totalExpenseValue),
    hasBills: filteredBills.length > 0,
    hasExpense: totalExpenseValue > 0,
    hasIncome: totalIncomeValue > 0,
    expenseCategories,
    incomeCategories,
    hasExpenseTrendData: expenseTrend.hasData,
    expenseTrendLabels: expenseTrend.labels,
    expenseTrendValues: expenseTrend.values,
    trendRangeText: expenseTrend.rangeText,
    expenseDonutData: buildExpenseDonutData(expenseCategories),
  };
}

Page({
  data: {
    filterMode: FILTER_MODE.CURRENT_MONTH,
    selectedMonth: buildCurrentMonthKey(),
    rangeLabel: buildRangeLabel(FILTER_MODE.CURRENT_MONTH, buildCurrentMonthKey()),
    billCount: 0,
    totalExpense: "0.00",
    totalIncome: "0.00",
    balance: "0.00",
    hasBills: false,
    hasExpense: false,
    hasIncome: false,
    expenseCategories: [],
    incomeCategories: [],
    hasExpenseTrendData: false,
    expenseTrendLabels: [],
    expenseTrendValues: [],
    trendRangeText: buildTrendRangeText(FILTER_MODE.CURRENT_MONTH, buildCurrentMonthKey()),
    expenseDonutData: [],
    expenseTrendEc: {
      lazyLoad: true,
    },
    expenseDonutEc: {
      lazyLoad: true,
    },
    loading: false,
    loadError: "",
  },

  onLoad() {
    this.rawBills = [];
    this.expenseTrendChart = null;
    this.expenseDonutChart = null;
    this.expenseTrendChartComponent = null;
    this.expenseDonutChartComponent = null;
    this.expenseTrendChartInitializing = false;
    this.expenseDonutChartInitializing = false;
    this.expenseTrendChartNeedsRender = false;
    this.expenseDonutChartNeedsRender = false;
    this.chartRenderToken = 0;
    this.pageReady = false;
    this.pageVisible = false;
    this.hasLoadedStats = false;
    this.reloadRequestId = 0;
    this.chartRefreshTimer = null;
  },

  onReady() {
    this.pageReady = true;
    this.scheduleChartRefresh();
  },

  onShow() {
    this.pageVisible = true;
    if (this.hasLoadedStats) {
      this.scheduleChartRefresh();
    }
    this.reload();
  },

  onHide() {
    this.pageVisible = false;
    this.clearPendingChartRefresh();
  },

  onUnload() {
    this.pageVisible = false;
    this.reloadRequestId += 1;
    this.clearPendingChartRefresh();
    this.disposeCharts();
  },

  onPullDownRefresh() {
    this.reload(() => {
      wx.stopPullDownRefresh();
    });
  },

  onFilterModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.filterMode) {
      return;
    }

    this.setData({
      filterMode: mode,
    }, () => {
      this.applyStats();
    });
  },

  onMonthChange(e) {
    const nextMonth = e.detail && e.detail.value ? e.detail.value : buildCurrentMonthKey();
    this.setData({
      selectedMonth: nextMonth,
      filterMode: FILTER_MODE.CUSTOM_MONTH,
    }, () => {
      this.applyStats();
    });
  },

  applyStats(done) {
    const nextData = buildStatsData(
      this.rawBills || [],
      this.data.filterMode,
      this.data.selectedMonth
    );

    this.hasLoadedStats = true;
    this.setData(Object.assign({}, nextData, {
      loading: false,
      loadError: "",
    }), () => {
      this.scheduleChartRefresh();
      if (typeof done === "function") {
        done();
      }
    });
  },

  clearPendingChartRefresh() {
    if (this.chartRefreshTimer) {
      clearTimeout(this.chartRefreshTimer);
      this.chartRefreshTimer = null;
    }
  },

  scheduleChartRefresh() {
    this.clearPendingChartRefresh();

    if (!this.pageReady || !this.pageVisible) {
      return;
    }

    this.renderCharts();
    this.chartRefreshTimer = setTimeout(() => {
      this.chartRefreshTimer = null;
      if (!this.pageReady || !this.pageVisible) {
        return;
      }
      this.renderCharts();
    }, 48);
  },

  renderCharts() {
    if (!this.pageReady || !this.pageVisible) {
      return;
    }

    const renderToken = ++this.chartRenderToken;
    wx.nextTick(() => {
      if (
        renderToken !== this.chartRenderToken
        || !this.pageReady
        || !this.pageVisible
      ) {
        return;
      }

      const nextExpenseTrendChartComponent = this.selectComponent("#expenseTrendChart");
      const nextExpenseDonutChartComponent = this.selectComponent("#expenseDonutChart");

      if (!this.isChartInstanceValid(this.expenseTrendChart)) {
        this.expenseTrendChart = null;
      }

      if (!this.isChartInstanceValid(this.expenseDonutChart)) {
        this.expenseDonutChart = null;
      }

      if (this.expenseTrendChart && this.expenseTrendChartComponent !== nextExpenseTrendChartComponent) {
        this.disposeExpenseTrendChart();
      }

      if (this.expenseDonutChart && this.expenseDonutChartComponent !== nextExpenseDonutChartComponent) {
        this.disposeExpenseDonutChart();
      }

      this.expenseTrendChartComponent = nextExpenseTrendChartComponent;
      this.expenseDonutChartComponent = nextExpenseDonutChartComponent;
      this.renderExpenseTrendChart(renderToken);
      this.renderExpenseDonutChart(renderToken);
    });
  },

  renderExpenseTrendChart(renderToken = this.chartRenderToken) {
    if (!this.data.hasExpenseTrendData) {
      this.disposeExpenseTrendChart();
      return;
    }

    if (!this.expenseTrendChartComponent) {
      return;
    }

    const option = buildExpenseTrendOption(
      this.data.expenseTrendLabels,
      this.data.expenseTrendValues
    );

    if (this.updateChart(this.expenseTrendChart, option, "expense trend")) {
      return;
    }

    if (this.expenseTrendChartInitializing) {
      this.expenseTrendChartNeedsRender = true;
      return;
    }

    this.expenseTrendChartInitializing = true;
    const expectedComponent = this.expenseTrendChartComponent;
    this.expenseTrendChartComponent.init((canvas, width, height, dpr) => {
      let chart = null;
      try {
        chart = echarts.init(canvas, null, {
          width,
          height,
          devicePixelRatio: dpr,
        });

        canvas.setChart(chart);
        if (
          renderToken !== this.chartRenderToken
          || expectedComponent !== this.expenseTrendChartComponent
          || !this.pageVisible
        ) {
          chart.dispose();
          return null;
        }

        chart.setOption(option);
        if (typeof chart.resize === "function") {
          chart.resize();
        }
        this.expenseTrendChart = chart;
        return chart;
      } catch (error) {
        if (chart) {
          chart.dispose();
        }
        console.error("init expense trend chart failed:", error);
        return null;
      } finally {
        this.expenseTrendChartInitializing = false;
        if (this.expenseTrendChartNeedsRender) {
          this.expenseTrendChartNeedsRender = false;
          this.renderCharts();
        }
      }
    });
  },

  renderExpenseDonutChart(renderToken = this.chartRenderToken) {
    if (!this.data.hasExpense || !this.data.expenseDonutData.length) {
      this.disposeExpenseDonutChart();
      return;
    }

    if (!this.expenseDonutChartComponent) {
      return;
    }

    const option = buildExpenseDonutOption(
      this.data.totalExpense,
      this.data.expenseDonutData
    );

    if (this.updateChart(this.expenseDonutChart, option, "expense donut")) {
      return;
    }

    if (this.expenseDonutChartInitializing) {
      this.expenseDonutChartNeedsRender = true;
      return;
    }

    this.expenseDonutChartInitializing = true;
    const expectedComponent = this.expenseDonutChartComponent;
    this.expenseDonutChartComponent.init((canvas, width, height, dpr) => {
      let chart = null;
      try {
        chart = echarts.init(canvas, null, {
          width,
          height,
          devicePixelRatio: dpr,
        });

        canvas.setChart(chart);
        if (
          renderToken !== this.chartRenderToken
          || expectedComponent !== this.expenseDonutChartComponent
          || !this.pageVisible
        ) {
          chart.dispose();
          return null;
        }

        chart.setOption(option);
        if (typeof chart.resize === "function") {
          chart.resize();
        }
        this.expenseDonutChart = chart;
        return chart;
      } catch (error) {
        if (chart) {
          chart.dispose();
        }
        console.error("init expense donut chart failed:", error);
        return null;
      } finally {
        this.expenseDonutChartInitializing = false;
        if (this.expenseDonutChartNeedsRender) {
          this.expenseDonutChartNeedsRender = false;
          this.renderCharts();
        }
      }
    });
  },

  isChartInstanceValid(chart) {
    if (!chart) {
      return false;
    }

    if (typeof chart.isDisposed === "function") {
      return !chart.isDisposed();
    }

    return typeof chart.setOption === "function";
  },

  updateChart(chart, option, chartName) {
    if (!this.isChartInstanceValid(chart)) {
      return false;
    }

    try {
      chart.setOption(option, true);
      if (typeof chart.resize === "function") {
        chart.resize();
      }
      return true;
    } catch (error) {
      console.error(`refresh ${chartName} chart failed:`, error);
      return false;
    }
  },

  safeDisposeChart(chart, component, chartName) {
    if (!chart) {
      return null;
    }

    try {
      if (!this.isChartInstanceValid(chart)) {
        return null;
      }

      if (typeof chart.dispose === "function") {
        chart.dispose();
      }
    } catch (error) {
      console.error(`dispose ${chartName} chart failed:`, error);
    } finally {
      if (component && component.chart === chart) {
        component.chart = null;
      }
    }

    return null;
  },

  disposeExpenseTrendChart() {
    this.expenseTrendChart = this.safeDisposeChart(
      this.expenseTrendChart,
      this.expenseTrendChartComponent,
      "expense trend"
    );
    this.expenseTrendChartInitializing = false;
    this.expenseTrendChartNeedsRender = false;
  },

  disposeExpenseDonutChart() {
    this.expenseDonutChart = this.safeDisposeChart(
      this.expenseDonutChart,
      this.expenseDonutChartComponent,
      "expense donut"
    );
    this.expenseDonutChartInitializing = false;
    this.expenseDonutChartNeedsRender = false;
  },

  disposeCharts() {
    this.clearPendingChartRefresh();
    this.disposeExpenseTrendChart();
    this.disposeExpenseDonutChart();
    this.expenseTrendChartComponent = null;
    this.expenseDonutChartComponent = null;
  },

  async reload(done) {
    const requestId = ++this.reloadRequestId;
    const shouldShowLoading = !this.hasLoadedStats;

    if (!wx.cloud || typeof wx.cloud.database !== "function") {
      const message = "当前基础库不支持云开发，请检查云环境配置。";
      console.error(message);
      this.setData({
        loading: false,
        loadError: shouldShowLoading ? message : "",
      }, () => {
        if (typeof done === "function") {
          done();
        }
      });
      wx.showToast({
        title: "加载失败",
        icon: "none",
      });
      return;
    }

    this.setData({
      loading: shouldShowLoading,
      loadError: "",
    });

    try {
      const db = wx.cloud.database();
      const bills = await fetchBills(db, {
        orderByField: "createdAt",
        orderByDirection: "desc",
      });
      if (requestId !== this.reloadRequestId) {
        return;
      }
      this.rawBills = bills;
      this.applyStats(done);
    } catch (error) {
      if (requestId !== this.reloadRequestId) {
        return;
      }
      console.error("load bill stats failed:", error);
      this.setData({
        loading: false,
        loadError: "统计加载失败，请稍后下拉重试。",
      }, () => {
        if (typeof done === "function") {
          done();
        }
      });
      wx.showToast({
        title: "加载失败",
        icon: "none",
      });
    }
  },
});
