import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTenantKey } from "@/lib/tenant-server";
import type { TenantKey } from "@/lib/tenants";

/**
 * One Postgres schema per company. `prisma` keeps its familiar shape
 * (`prisma.customer.findMany(...)`), but every call first resolves which company
 * the request is for, from its cookie, and runs against that company's schema.
 *
 * Calls are deferred rather than eager so the array form of `$transaction([...])`
 * still works: the recorded calls are rebuilt on the tenant's client and handed
 * to Prisma as one atomic batch.
 */

const log: ("error" | "warn")[] = process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

const globalForPrisma = globalThis as unknown as { prismaByTenant?: Map<TenantKey, PrismaClient> };
const perRequest = new WeakMap<object, Map<TenantKey, PrismaClient>>();

/**
 * Each company gets its own small pool. Prisma's default (CPU count × 2 + 1)
 * multiplied by eight companies and by every running server exhausts
 * Postgres' connection limit; three per company is plenty for this app.
 * An explicit `connection_limit` in DATABASE_URL still wins.
 */
function withSchema(url: string, schema: string): string {
  const u = new URL(url);
  u.searchParams.set("schema", schema);
  if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "3");
  return u.toString();
}

function clientFor(tenant: TenantKey): PrismaClient {
  let ctx: object | undefined;
  let env: { HYPERDRIVE?: { connectionString: string } } | undefined;
  try {
    ({ ctx, env } = getCloudflareContext() as { ctx: object; env: typeof env });
  } catch {
    // next dev, scripts, or no Hyperdrive binding: shared Node clients.
  }
  const hyperdrive = env?.HYPERDRIVE;
  if (!ctx || !hyperdrive) {
    const map = (globalForPrisma.prismaByTenant ??= new Map());
    let c = map.get(tenant);
    if (!c) {
      const base = process.env.DATABASE_URL;
      c = new PrismaClient({ log, ...(base ? { datasourceUrl: withSchema(base, tenant) } : {}) });
      map.set(tenant, c);
    }
    return c;
  }
  // Workers can't reuse a socket across requests: one client per request and tenant.
  let byTenant = perRequest.get(ctx);
  if (!byTenant) perRequest.set(ctx, (byTenant = new Map()));
  let c = byTenant.get(tenant);
  if (!c) {
    c = new PrismaClient({
      log,
      adapter: new PrismaPg({ connectionString: hyperdrive.connectionString, maxUses: 1 }, { schema: tenant }),
    });
    byTenant.set(tenant, c);
  }
  return c;
}

async function current(): Promise<PrismaClient> {
  return clientFor(await getTenantKey());
}

/** A model call recorded now and run against the right tenant when awaited. */
class Deferred<T = unknown> implements PromiseLike<T> {
  private run?: Promise<T>;
  constructor(
    private readonly model: string,
    private readonly method: string,
    private readonly args: unknown[],
  ) {}
  build(c: PrismaClient): Promise<T> {
    const delegate = (c as unknown as Record<string, Record<string, (...a: unknown[]) => Promise<T>>>)[this.model]!;
    return delegate[this.method]!(...this.args);
  }
  private start(): Promise<T> {
    return (this.run ??= current().then((c) => this.build(c)));
  }
  then<A = T, B = never>(ok?: ((v: T) => A | PromiseLike<A>) | null, err?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.start().then(ok, err);
  }
  catch<B = never>(err?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.start().catch(err);
  }
  finally(fn?: (() => void) | null) {
    return this.start().finally(fn);
  }
}

function clientMethod(name: string) {
  if (name === "$transaction") {
    return async (arg: unknown, opts?: unknown) => {
      const c = await current();
      if (Array.isArray(arg)) {
        const ops = arg.map((op) => (op instanceof Deferred ? op.build(c) : op));
        return (c.$transaction as (a: unknown, o?: unknown) => Promise<unknown>)(ops, opts);
      }
      return (c.$transaction as (a: unknown, o?: unknown) => Promise<unknown>)(arg, opts);
    };
  }
  return async (...args: unknown[]) => {
    const c = await current();
    return (c as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!.apply(c, args);
  };
}

export const prisma = new Proxy({} as PrismaClient, {
  get: (_, prop) => {
    if (typeof prop !== "string" || prop === "then") return undefined;
    if (prop.startsWith("$")) return clientMethod(prop);
    return new Proxy(
      {},
      {
        get: (__, method) =>
          typeof method === "string" && method !== "then"
            ? (...args: unknown[]) => new Deferred(prop, method, args)
            : undefined,
      },
    );
  },
});

/** For scripts and seeds: a client bound to one company's schema. */
export function prismaForTenant(tenant: TenantKey): PrismaClient {
  return clientFor(tenant);
}
