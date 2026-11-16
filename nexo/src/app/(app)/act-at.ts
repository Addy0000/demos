/**
 * The value at which somebody acts, per dashboard metric — the deck's second
 * test ("What threshold?"). Drawn on every chart as a line.
 *
 * These are the calibration knobs of the screen: a plant that runs on thinner
 * margins moves them; the queries and charts do not change. Kept apart from
 * metrics.ts so client charts can read them without pulling in Prisma.
 */
export const ACT_AT = {
  /** Top five accounts as a share of revenue. */
  concentrationPct: 40,
  /** Customer quadrant: big enough to matter… */
  repriceRevenue: 1_00_00_000,
  /** …and thin enough to re-price. */
  repriceMarginPct: 15,
  /** A funnel stage this many points below its own trailing rate. */
  funnelDropPts: 10,
  /** Receivables past 90 days, per customer. */
  receivable90: 5_00_000,
  /** Monthly rupee impact of a material's price move. */
  priceImpactMonthly: 2_00_000,
  /** Value in the 90+ band, per category. */
  aged90: 5_00_000,
  /** Frozen cost sheet against today's rates. */
  driftPct: 3,
  /** One input carrying this share of a grade's cost. */
  inputSharePct: 40,
  /** A move in the cash cycle worth a conversation. */
  cycleMoveDays: 5,
  /** Orders confirmed or allocated and not moving. */
  backlogDays: 2,
  /** Approved requisitions not converted. */
  requisitionDays: 3,
  /** Customer silence. */
  dormantDays: 90,
} as const;
