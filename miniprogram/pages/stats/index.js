const { statsThisMonth } = require("../../utils/store");

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

Page({
  data: {
    month: "",
    totalExpense: "0.00",
    totalIncome: "0.00",
    balance: "0.00",
    hasExpense: false,
    topCategories: [],
  },

  onShow() {
    this.reload();
  },

  reload() {
    const data = statsThisMonth();

    this.setData({
      month: data.month,
      totalExpense: formatMoney(data.total_expense),
      totalIncome: formatMoney(data.total_income),
      balance: formatMoney(data.balance),
      hasExpense: data.total_expense > 0,
      topCategories: data.top_categories.map((item) => {
        return {
          category: item.category,
          amount: formatMoney(item.amount),
          ratio: `${(item.ratio * 100).toFixed(1)}%`,
        };
      }),
    });
  },
});
