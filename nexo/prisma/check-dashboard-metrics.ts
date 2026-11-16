/**
 * Smoke check for the dashboard's altitude metrics: every query runs against the
 * live schema and returns sane shapes. Run after `npm run seed:dashboard`:
 *   npx tsx --tsconfig tsconfig.json prisma/check-dashboard-metrics.ts
 */
import assert from "node:assert/strict";
import * as M from "../src/app/(app)/metrics";

(async () => {
  const { trends, cycle } = await M.trends();
  assert.equal(trends.revenue.series.length, 12);
  assert.ok(Number.isFinite(cycle.cycle));
  assert.ok(Math.abs(cycle.receivableDays + cycle.inventoryDays - cycle.payableDays - cycle.cycle) < 1e-6);

  const exc = await M.exceptions();
  assert.equal(exc.length, 6);

  const bridge = await M.profitBridge();
  const steps = bridge.filter((s) => s.kind === "step").reduce((t, s) => t + s.value, 0);
  assert.ok(Math.abs(bridge[0]!.value + steps - bridge[bridge.length - 1]!.value) < 1, "bridge must close");

  const stages = await M.funnel();
  assert.equal(stages.length, 4);
  for (let i = 1; i < stages.length; i++) assert.ok(stages[i]!.count <= stages[i - 1]!.count, "funnel narrows");

  for (const r of await M.receivables()) assert.ok(Math.abs(r.buckets.reduce((a, b) => a + b, 0) - r.total) < 1);

  await Promise.all([
    M.customerBook(), M.priceImpact(), M.inventoryAgeing(), M.costDrift(), M.docMatrix(),
    M.salesBacklog(), M.procurementSlippage(), M.dormantCustomers(), M.staleAllocations(),
  ]);
  console.log("dashboard metrics ok");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
