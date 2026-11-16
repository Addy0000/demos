import type { Industry, MaterialCategory } from "@prisma/client";
import { titleise } from "@/lib/format";

/**
 * Enum values for forms and filters. Forms offer every value the schema has;
 * filters offer only the values a company actually uses, so a food maker is not
 * asked to filter by PVC resin and a mill is not offered "Footwear".
 */
export const INDUSTRY_VALUES: Industry[] = [
  "WIRE_AND_CABLE", "FOOTWEAR", "PIPES_AND_FITTINGS", "PROFILES", "MEDICAL", "AUTOMOTIVE", "PACKAGING",
  "CONSTRUCTION", "ENGINEERING", "AGRICULTURE", "PHARMA", "FMCG", "RETAIL", "HOSPITALITY", "APPAREL",
  "ELECTRICAL", "INFRASTRUCTURE", "ENERGY", "OTHER",
];

const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  PVC_RESIN: "PVC Resin", PLASTICISER: "Plasticiser", STABILISER: "Stabiliser", FILLER: "Filler", LUBRICANT: "Lubricant",
  PROCESSING_AID: "Processing Aid", IMPACT_MODIFIER: "Impact Modifier", FLAME_RETARDANT: "Flame Retardant", PIGMENT: "Pigment",
  BLOWING_AGENT: "Blowing Agent", STEEL: "Steel", PLATING_CHEMICAL: "Plating Chemical", CONSUMABLE: "Consumable",
  PACKAGING: "Packaging", SOLVENT: "Solvent", INTERMEDIATE: "Intermediate", FOOD_INGREDIENT: "Food Ingredient",
  FIBRE: "Fibre & Yarn", FABRIC: "Fabric", DYE: "Dye", COMPONENT: "Component", TRADED_GOODS: "Traded Goods",
  OTHER: "Other Component",
};
export const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABELS) as MaterialCategory[]).map((value) => ({ value, label: CATEGORY_LABELS[value] }));

export function presentOptions<T>(rows: T[], pick: (r: T) => string | null | undefined): { value: string; label: string }[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const v = pick(r);
    if (v) seen.add(v);
  }
  return [...seen].sort().map((value) => ({ value, label: titleise(value) }));
}
