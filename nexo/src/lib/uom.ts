/**
 * UOM Display Formatter
 * Converts database UOM enum values (NOS, KG, MT, LTR) into consistent, friendly display labels.
 * e.g. "NOS" -> "units", "KG" -> "kg", "MT" -> "mt", "LTR" -> "ltr"
 */
export function formatUomDisplay(uom?: string | null): string {
  if (!uom) return "kg";
  const u = uom.trim().toUpperCase();
  if (u === "NOS" || u === "UNIT" || u === "UNITS") return "units";
  if (u === "LTR" || u === "LITER" || u === "LITRE") return "ltr";
  if (u === "MT") return "mt";
  if (u === "KG") return "kg";
  return uom.toLowerCase();
}
