/** The color of a usage bar: grey when the percent is unknown, green, orange from 60 percent, red above 75 percent. */
export function usageColor(percent: number | null): string {
  if (percent === null) {
    return "#888";
  }
  if (percent > 75) {
    return "#eb4d4d";
  }
  return percent >= 60 ? "#f79433" : "#4dbf66";
}
