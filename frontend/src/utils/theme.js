export function getTooltipStyle() {
  const light = document.documentElement.getAttribute("data-theme") === "light";
  const bg = light ? "#ffffff" : "#1e1e2e";
  const border = light ? "1px solid #e0e0e8" : "1px solid #444";
  const color = light ? "#1a1a2e" : "#e0e0f0";
  return {
    contentStyle: { background: bg, border, color, padding: "10px 14px", borderRadius: 8, lineHeight: "1.6" },
    labelStyle: { color },
    itemStyle: { color },
  };
}
