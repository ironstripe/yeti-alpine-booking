// Real PriceBreakdown: 26/27 group preview uses the chosen quoted variant (server unit price) per
// linked person, never products.find(type=group) or group_courses.product_id; unique lunch price.
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as realWizardContext from "../src/contexts/BookingWizardContext";
import * as realProducts from "../src/hooks/useProducts";
import * as realLunch from "../src/hooks/useLunchProduct";
import * as realRates from "../src/hooks/usePrivateLessonRates";

let state: Record<string, unknown> = {};
mock.module("@/contexts/BookingWizardContext", () => ({ ...realWizardContext, useBookingWizard: () => ({ state }) }));
// Decoy legacy products: must be ignored for 26/27 server-quoted variants.
mock.module("@/hooks/useProducts", () => ({ ...realProducts, useProducts: () => ({ isLoading: false, data: [
  { id: "decoy", type: "group", name: "Alt Gruppe", price: 999, pricing_type: "tiered", price_tiers: [{ day_count: 5, cumulative_price: 999 }] },
] }) }));
mock.module("@/hooks/useLunchProduct", () => ({ ...realLunch, useLunchProduct: () => ({ data: { id: "l", price: 30 }, isLoading: false }) }));
mock.module("@/hooks/usePrivateLessonRates", () => ({ ...realRates, usePrivateLessonRates: () => ({ data: [] }), useHighSeasonPeriods: () => ({ data: [] }) }));

const { PriceBreakdown } = await import("../src/components/bookings/wizard/PriceBreakdown");

const WEEK = ["2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18"];
const XMAS = ["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25"];
const ref = (courseId: string, unitPrice: number) => ({ courseId, productId: "p-" + courseId, block: null, unitPrice });
const people = [
  { id: "a", first_name: "Adult", birth_date: "1990-01-01" },
  { id: "k", first_name: "Kid", birth_date: "2018-01-01" },
  { id: "w", first_name: "Windel", birth_date: "2022-01-01" },
  { id: "s", first_name: "Board", birth_date: "2012-01-01" },
  { id: "x", first_name: "NotLinked", birth_date: "2012-01-01" },
];
const render = () => {
  const qc = new QueryClient();
  qc.setQueryData(["group-courses-for-pricing"], [{ id: "c-kid", name: "Kids 4h", product_id: "decoy", price_per_day: 999 }]);
  const html = renderToStaticMarkup(<QueryClientProvider client={qc}><PriceBreakdown discountPercent={0} /></QueryClientProvider>);
  return html.match(/data-testid="price-total">([^<]+)</)?.[1] ?? null;
};
const base = (o: Record<string, unknown>) => ({ productType: "group", sport: "ski", selectedParticipants: people, localParticipants: [],
  activeCartItemId: "i", lunchSelections: {}, vegetarianSelections: {}, participantBookings: {}, useParticipantSpecificBooking: false,
  privateGroupProposal: null, appointments: null, timeSlot: null, numberOfPersons: 1, ...o });

describe("PriceBreakdown 26/27 group preview", () => {
  test("shared: kids 4h 320/person x 2 linked people + 2 lunch days at 30; unlinked person and decoy ignored", () => {
    state = base({ selectedDates: WEEK, selectedGroupId: "c-kid", cartItems: [{ id: "i", assignedParticipantIds: ["k", "w"] }],
      groupPlan: { courseId: "c-kid", courseName: "Kids 4h", server: ref("c-kid", 320) }, lunchSelections: { k: ["2026-12-14", "2026-12-15"], x: [WEEK[0]] } });
    expect(render()).toBe("CHF 700.00");
  });
  test("shared, changed dates same count: same exact package price, lunch outside booked dates not charged", () => {
    state = base({ selectedDates: XMAS, selectedGroupId: "c-kid", cartItems: [{ id: "i", assignedParticipantIds: ["k"] }],
      groupPlan: { courseId: "c-kid", courseName: "Kids 4h", server: ref("c-kid", 320) }, lunchSelections: { k: ["2026-12-14"] } });
    expect(render()).toBe("CHF 320.00");
  });
  test("per person: Ski adult 4h 370 + kids 4h 320 + Windel 2h 170 + Snowboard 2h 230, AM+PM not doubled", () => {
    const pb = (id: string, price: number, dates = WEEK, lunch: string[] = []) => ({ participantId: id, groupCourseId: "c-" + id, groupProductName: "V" + id,
      dates, lunchDays: lunch, isVegetarian: false, groupServer: ref("c-" + id, price) });
    state = base({ selectedDates: WEEK, selectedGroupId: null, useParticipantSpecificBooking: true,
      cartItems: [{ id: "i", assignedParticipantIds: ["a", "k", "w", "s"] }],
      participantBookings: { a: pb("a", 370), k: pb("k", 320, WEEK, [WEEK[0]]), w: pb("w", 170, XMAS), s: pb("s", 230), x: pb("x", 999) } });
    expect(render()).toBe("CHF 1120.00");
  });
});
