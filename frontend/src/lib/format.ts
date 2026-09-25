/** Money like the template: $29.99 */
export const money = (value: number | string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
};

/** Date like the template's delivery line: "Sep 25" */
export const shortDate = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
