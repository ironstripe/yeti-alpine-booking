import { describe, expect, mock, test } from "bun:test";
import { editorPriceTiers, editorPricingTypeSchema, productEditorPricingPatch } from "../src/lib/productEditorPricing";

const tiers = Array.from({ length: 7 }, (_, i) => ({ day_count: i + 1, cumulative_price: (i + 1) * 70 }));
const calls: { table: string; action: string; data?: unknown }[] = [];
mock.module("@/lib/productLifecycle", () => ({ productSnapshot: (p: object) => p, productLifecycle: async (body: {patch:unknown}) => {calls.push({table:"products",action:"update",data:body.patch});return {product:{id:"synthetic-product"}};} }));
mock.module("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => ({
    update: (data: unknown) => ({ eq: async () => { calls.push({ table, action: "update", data }); return { error: null }; } }),
    delete: () => ({ eq: async () => { calls.push({ table, action: "delete" }); return { error: null }; } }),
    insert: async (data: unknown) => { calls.push({ table, action: "insert", data }); return { error: null }; },
  }),
} }));
mock.module("@tanstack/react-query", () => ({ useQuery: () => ({}), useQueryClient: () => ({ invalidateQueries() {} }), useMutation: (options: unknown) => options }));
const { useUpdateProduct } = await import("../src/hooks/useProducts");
const save = async (patch: object) => {
  calls.length = 0;
  const mutation = useUpdateProduct() as unknown as { mutationFn: (data: object) => Promise<void> };
  await mutation.mutationFn({ id: "synthetic-product", expected:{id:"synthetic-product"}, name: "Metadata edited", ...patch });
  return [...calls];
};

describe("product editor compatibility", () => {
  test("activation-only change never writes prices or tiers", async () => {
    expect(await save({ is_active: true })).toEqual([{ table: "products", action: "update", data: { name: "Metadata edited", is_active: true } }]);
  });
  for (const pricing_type of ["flat", "fixed", "hourly", "tiered"] as const) {
    test(`${pricing_type}: metadata edit keeps price/model/tiers with no child write`, async () => {
      const product = { pricing_type, price: 85, price_tiers: tiers };
      expect(editorPricingTypeSchema.parse(pricing_type)).toBe(pricing_type);
      const patch = productEditorPricingPatch({ ...product, price_tiers: editorPriceTiers(tiers) }, product);
      expect(patch).toEqual({});
      expect(await save(patch)).toEqual([{ table: "products", action: "update", data: { name: "Metadata edited" } }]);
    });
  }
  test("days six and seven retained on open and explicit price edit/save", async () => {
    const opened = editorPriceTiers([...tiers].reverse());
    expect(opened).toEqual(tiers);
    const edited = opened.map(t => t.day_count === 1 ? { ...t, cumulative_price: 75 } : t);
    const patch = productEditorPricingPatch({ pricing_type: "tiered", price: 0, price_tiers: edited }, { pricing_type: "tiered", price: 0, price_tiers: tiers });
    const writes = await save(patch);
    expect(writes.map(w => w.action)).toEqual(["update", "delete", "insert"]);
    expect(writes[2]?.data).toEqual(edited.map(t => ({ product_id: "synthetic-product", ...t })));
  });
  test("stored zero-priced day seven survives tier replacement", async () => {
    const stored = [{ day_count: 1, cumulative_price: 70 }, { day_count: 7, cumulative_price: 0 }];
    const opened = editorPriceTiers(stored);
    opened[0] = { day_count: 1, cumulative_price: 75 };
    const patch = productEditorPricingPatch({ pricing_type: "tiered", price: 0, price_tiers: opened }, { pricing_type: "tiered", price: 0, price_tiers: stored });
    const writes = await save(patch);
    expect(writes[2]?.data).toEqual([{ product_id: "synthetic-product", day_count: 1, cumulative_price: 75 }, { product_id: "synthetic-product", day_count: 7, cumulative_price: 0 }]);
  });
  for (const pricing_type of ["flat", "fixed", "hourly"] as const) {
    test(`${pricing_type}: explicit price edit retains model and stored tiers`, async () => {
      const patch = productEditorPricingPatch({ pricing_type, price: 90, price_tiers: editorPriceTiers(tiers) }, { pricing_type, price: 85, price_tiers: tiers });
      expect(patch).toEqual({ price: 90 });
      expect((await save(patch)).map(w => w.table)).toEqual(["products"]);
    });
  }
  test("ordinary new pricing models and explicit model changes remain supported", async () => {
    for (const pricing_type of ["fixed", "hourly", "tiered"] as const) {
      expect(productEditorPricingPatch({ pricing_type, price: 85, price_tiers: tiers }, null)).toEqual({ pricing_type, price: pricing_type === "tiered" ? 0 : 85, ...(pricing_type === "tiered" ? { price_tiers: tiers } : {}) });
    }
    expect((await save({ pricing_type: "fixed", price: 85 })).map(w => w.action)).toEqual(["update", "delete"]);
    expect((await save({ pricing_type: "flat", price: 85 })).map(w => w.action)).toEqual(["update"]);
  });
});