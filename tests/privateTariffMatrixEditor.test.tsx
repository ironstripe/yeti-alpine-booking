// Renders the real PrivateTariffMatrixEditor with mocked data hooks:
// effective prices win, BC originals serve as grey fallback placeholders,
// and the read-only BC comparison lists the untouched originals.
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import * as realHooks from "../src/hooks/usePrivateProductTariffs";

const effective = [
  { duration_minutes: 120, persons_per_lesson: 3, price_chf: 210 },
];
const originals = [
  { duration_minutes: 60, persons_per_lesson: 1, price_chf: 85 },
  { duration_minutes: 120, persons_per_lesson: 3, price_chf: 200 },
];

mock.module("@/hooks/usePrivateProductTariffs", () => ({
  ...realHooks,
  usePrivateProductTariffs: () => ({ data: effective, isPending: false, error: null }),
  useBcOriginalPrivateTariffs: () => ({ data: originals, isPending: false, error: null }),
  useSavePrivateProductTariffs: () => ({ mutateAsync: async () => effective, isPending: false }),
}));

const { PrivateTariffMatrixEditor } = await import("../src/components/settings/PrivateTariffMatrixEditor.tsx?real-under-test");

describe("PrivateTariffMatrixEditor", () => {
  const html = renderToStaticMarkup(createElement(PrivateTariffMatrixEditor, { productId: "p1" }));

  test("renders all 7 durations x 5 persons as editable inputs", () => {
    for (const h of [1, 2, 3, 4, 5, 6, 7]) {
      for (const n of [1, 2, 3, 4, 5]) {
        expect(html).toContain(`Preis ${h}h ${n} ${n === 1 ? "Person" : "Personen"}`);
      }
    }
  });

  test("shows the saved effective price in its cell", () => {
    expect(html).toContain('value="210"');
  });

  test("uses the BC original only as placeholder fallback", () => {
    expect(html).toContain('placeholder="85"');
    // The 2h/3p cell has an effective price, so its original 200 is NOT a placeholder.
    expect(html).not.toContain('placeholder="200"');
  });

  test("offers the read-only BC comparison toggle", () => {
    expect(html).toContain("Booking-Corner-Quelltarife (schreibgeschützt)");
  });

  test("states that tariffs do not yet drive booking/invoice logic", () => {
    expect(html).toContain("noch nicht die Buchungs- oder Rechnungslogik");
  });
});
