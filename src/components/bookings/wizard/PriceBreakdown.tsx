import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock, Users, Leaf } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { usePrivateLessonRates, useHighSeasonPeriods } from "@/hooks/usePrivateLessonRates";
import { useProducts, ProductWithTiers } from "@/hooks/useProducts";
import { calculatePrice, formatPriceCHF } from "@/lib/pricing-utils";
import {
  calculatePrivateLessonPrice,
  formatCHF,
  ADDITIONAL_PERSON_RATE,
} from "@/lib/pricing/private-lesson-pricing";

interface PriceBreakdownProps {
  discountPercent: number;
  autoDiscountPercent?: number;
  autoDiscountReason?: string;
}

interface ParticipantLineItem {
  participantName: string;
  courseName: string;
  days: number;
  price: number;
}

interface ParticipantLunchItem {
  participantId: string;
  participantName: string;
  days: number;
  isVegetarian: boolean;
  price: number;
}

const VAT_RATE = 0.077; // 7.7%

export function PriceBreakdown({
  discountPercent,
  autoDiscountPercent = 0,
  autoDiscountReason,
}: PriceBreakdownProps) {
  const { state } = useBookingWizard();

  // Fetch products with price tiers
  const { data: products = [], isLoading: productsLoading } = useProducts({
    isActive: true,
    includeTiers: true,
  });

  // Fetch group courses to get product_id linkage
  const { data: groupCourses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ["group-courses-for-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_courses")
        .select("id, name, product_id, price_per_day")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  // Fetch private lesson rates and high season periods
  const { data: rates = [] } = usePrivateLessonRates();
  const { data: highSeasonPeriods = [] } = useHighSeasonPeriods();

  const isLoading = productsLoading || coursesLoading;

  // Calculate prices
  const daysCount = state.selectedDates.length;
  const productType = state.productType || "private";

  // Parse time slot for private lessons
  const timeSlotParts = state.timeSlot?.split(" - ") || [];
  const startTime = timeSlotParts[0] || "";
  const endTime = timeSlotParts[1] || "";

  // Calculate private lesson price using time-based pricing
  const privateLessonPrice = useMemo(() => {
    if (productType !== "private" || !startTime || !endTime || daysCount === 0) {
      return null;
    }
    const firstDate = state.selectedDates[0] ? new Date(state.selectedDates[0]) : null;
    return calculatePrivateLessonPrice(
      firstDate,
      startTime,
      endTime,
      state.numberOfPersons,
      rates,
      highSeasonPeriods
    );
  }, [productType, startTime, endTime, state.selectedDates, state.numberOfPersons, rates, highSeasonPeriods, daysCount]);

  // Calculate group course pricing with participant-specific mode support
  const groupCourseCalculation = useMemo(() => {
    if (productType !== "group") {
      return { lineItems: [], totalCoursePrice: 0, productName: "" };
    }

    const lineItems: ParticipantLineItem[] = [];
    let totalCoursePrice = 0;

    // Check if we're in participant-specific booking mode
    if (state.useParticipantSpecificBooking && Object.keys(state.participantBookings).length > 0) {
      // Calculate for each participant individually
      for (const participant of state.selectedParticipants) {
        const booking = state.participantBookings[participant.id];
        if (!booking) continue;

        // Get the linked group course
        const groupCourse = groupCourses.find(c => c.id === booking.groupCourseId);
        if (!groupCourse) continue;

        // Find the product linked to this group course
        const product = products.find(p => p.id === groupCourse.product_id) as ProductWithTiers | undefined;
        
        // Calculate price based on number of days using tiered pricing
        const participantDaysCount = booking.dates.length;
        let price = 0;

        if (product && product.pricing_type === "tiered" && product.price_tiers?.length) {
          // Use tiered pricing from product_price_tiers
          price = calculatePrice(product, participantDaysCount);
        } else if (product) {
          // Fallback to fixed price
          price = (product.price || 0) * participantDaysCount;
        } else {
          // Fallback to group course price_per_day
          price = (groupCourse.price_per_day || 0) * participantDaysCount;
        }

        lineItems.push({
          participantName: `${participant.first_name} ${participant.last_name || ""}`.trim(),
          courseName: groupCourse.name,
          days: participantDaysCount,
          price: price,
        });

        totalCoursePrice += price;
      }
    } else {
      // Shared mode - all participants in same course
      // Find the group product
      const groupProduct = products.find(p => p.type === "group") as ProductWithTiers | undefined;
      
      let pricePerParticipant = 0;
      
      if (groupProduct && groupProduct.pricing_type === "tiered" && groupProduct.price_tiers?.length) {
        // Use tiered pricing
        pricePerParticipant = calculatePrice(groupProduct, daysCount);
      } else if (groupProduct) {
        pricePerParticipant = (groupProduct.price || 0) * daysCount;
      }

      // Multiply by number of participants
      const participantCount = state.selectedParticipants.length || 1;
      totalCoursePrice = pricePerParticipant * participantCount;

      // Create a single line item for shared mode
      if (participantCount > 1) {
        lineItems.push({
          participantName: `${participantCount} Teilnehmer`,
          courseName: groupProduct?.name || "Gruppenkurs",
          days: daysCount,
          price: totalCoursePrice,
        });
      }
    }

    return { 
      lineItems, 
      totalCoursePrice,
      productName: lineItems.length === 1 ? lineItems[0].courseName : "Gruppenkurs"
    };
  }, [productType, state.useParticipantSpecificBooking, state.participantBookings, state.selectedParticipants, groupCourses, products, daysCount]);

  // Private lesson pricing
  let unitPrice = 0;
  let productName = "";

  if (productType === "private" && privateLessonPrice) {
    unitPrice = privateLessonPrice.totalPrice;
    const duration = privateLessonPrice.durationHours;
    productName = `Privatstunde ${state.sport === "ski" ? "Ski" : state.sport === "snowboard" ? "Snowboard" : ""} ${duration}h`;
  }

  // Calculate lunch from lunchSelections (for group courses) or includeLunch (for private)
  const lunchProduct = products.find((p) => p.type === "lunch");
  const lunchPricePerDay = lunchProduct?.price || 25;
  
  // Build per-participant lunch data
  const participantLunchItems = useMemo((): ParticipantLunchItem[] => {
    const items: ParticipantLunchItem[] = [];
    
    if (productType === "group") {
      // Check individual booking mode first
      if (state.useParticipantSpecificBooking && Object.keys(state.participantBookings).length > 0) {
        for (const participant of state.selectedParticipants) {
          const booking = state.participantBookings[participant.id];
          if (booking && booking.lunchDays.length > 0) {
            items.push({
              participantId: participant.id,
              participantName: `${participant.first_name} ${participant.last_name || ""}`.trim(),
              days: booking.lunchDays.length,
              isVegetarian: booking.isVegetarian,
              price: booking.lunchDays.length * lunchPricePerDay,
            });
          }
        }
      } else {
        // Shared mode - use lunchSelections and vegetarianSelections
        for (const participant of state.selectedParticipants) {
          const days = state.lunchSelections[participant.id] || [];
          if (days.length > 0) {
            items.push({
              participantId: participant.id,
              participantName: `${participant.first_name} ${participant.last_name || ""}`.trim(),
              days: days.length,
              isVegetarian: state.vegetarianSelections[participant.id] || false,
              price: days.length * lunchPricePerDay,
            });
          }
        }
      }
    }
    
    return items;
  }, [productType, state.useParticipantSpecificBooking, state.participantBookings, state.selectedParticipants, state.lunchSelections, state.vegetarianSelections, lunchPricePerDay]);
  
  let lunchTotal = 0;
  let lunchDaysCount = 0;
  
  if (participantLunchItems.length > 0) {
    lunchTotal = participantLunchItems.reduce((sum, item) => sum + item.price, 0);
    lunchDaysCount = participantLunchItems.reduce((sum, item) => sum + item.days, 0);
  } else if (state.includeLunch && lunchProduct) {
    lunchDaysCount = daysCount;
    lunchTotal = lunchProduct.price * daysCount;
  }

  // Combine manual and auto discounts
  const totalDiscountPercent = discountPercent + autoDiscountPercent;

  // Calculate totals based on product type
  const courseTotal = productType === "group" 
    ? groupCourseCalculation.totalCoursePrice 
    : (productType === "private" ? unitPrice * daysCount : 0);

  const subtotal = courseTotal + lunchTotal;
  const discountAmount = subtotal * (totalDiscountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = afterDiscount * VAT_RATE;
  const total = afterDiscount;

  const formatCurrency = (amount: number) => {
    return `CHF ${amount.toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Preisdetails
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Preisdetails
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Line items */}
        <div className="space-y-2">
          {/* Group course - participant-specific mode */}
          {productType === "group" && state.useParticipantSpecificBooking && groupCourseCalculation.lineItems.length > 0 && (
            <>
              {groupCourseCalculation.lineItems.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <div>
                    <p className="font-medium">{item.participantName}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.courseName} · {item.days} Tag{item.days > 1 ? "e" : ""}
                    </p>
                  </div>
                  <span className="font-medium">{formatCurrency(item.price)}</span>
                </div>
              ))}
            </>
          )}

          {/* Group course - shared mode */}
          {productType === "group" && !state.useParticipantSpecificBooking && (
            <div className="flex justify-between">
              <div>
                <p className="font-medium">{groupCourseCalculation.productName || "Gruppenkurs"}</p>
                <p className="text-sm text-muted-foreground">
                  {state.selectedParticipants.length > 1 
                    ? `${state.selectedParticipants.length} Teilnehmer × ${daysCount} Tag${daysCount > 1 ? "e" : ""}`
                    : `${daysCount} Tag${daysCount > 1 ? "e" : ""}`
                  }
                </p>
              </div>
              <span className="font-medium">{formatCurrency(groupCourseCalculation.totalCoursePrice)}</span>
            </div>
          )}

          {/* Private lesson */}
          {productType === "private" && (
            <div className="flex justify-between">
              <div>
                <p className="font-medium">{productName}</p>
                {privateLessonPrice && (
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    <p className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {state.timeSlot}
                    </p>
                    {/* Time slot breakdown */}
                    {privateLessonPrice.breakdown.map((item, idx) => (
                      <p key={idx} className="text-xs">
                        {item.timeSlot}: {formatCHF(item.rate)} ({item.isPeak ? "Hauptzeit" : "Randzeit"})
                      </p>
                    ))}
                    {state.numberOfPersons > 1 && (
                      <p className="flex items-center gap-1 text-xs">
                        <Users className="h-3 w-3" />
                        +{state.numberOfPersons - 1} Person(en) × {privateLessonPrice.durationHours}h × {formatCHF(ADDITIONAL_PERSON_RATE)}
                      </p>
                    )}
                  </div>
                )}
                {daysCount > 1 && (
                  <p className="text-sm text-muted-foreground">
                    {daysCount} Tag{daysCount > 1 ? "e" : ""} × {formatCurrency(unitPrice)}
                  </p>
                )}
              </div>
              <span className="font-medium">
                {formatCurrency(unitPrice * daysCount)}
              </span>
            </div>
          )}

          {/* High season badge for private lessons */}
          {productType === "private" && privateLessonPrice?.isHighSeason && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              Hochsaison
            </Badge>
          )}

          {/* Lunch - Per participant breakdown */}
          {participantLunchItems.length > 0 && (
            <>
              <div className="font-medium text-sm text-muted-foreground mt-2">Mittagsbetreuung</div>
              {participantLunchItems.map((item) => (
                <div key={item.participantId} className="flex justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {item.participantName}: {item.days} Tag{item.days > 1 ? "e" : ""}
                    </span>
                    {item.isVegetarian && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 gap-1 text-xs">
                        <Leaf className="h-3 w-3" />
                        Vegi
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm">{formatCurrency(item.price)}</span>
                </div>
              ))}
            </>
          )}

          {/* Lunch - Simple display for private lessons */}
          {lunchTotal > 0 && participantLunchItems.length === 0 && (
            <div className="flex justify-between">
              <div>
                <p className="font-medium">Mittagsbetreuung</p>
                <p className="text-sm text-muted-foreground">
                  {lunchDaysCount} Tag{lunchDaysCount > 1 ? "e" : ""} × {formatCurrency(lunchPricePerDay)}
                </p>
              </div>
              <span className="font-medium">{formatCurrency(lunchTotal)}</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Subtotal */}
        <div className="flex justify-between text-sm">
          <span>Zwischensumme</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>

        {/* Auto Discount */}
        {autoDiscountPercent > 0 && autoDiscountReason && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-green-600">
              <Check className="h-4 w-4" />
              <span>{autoDiscountReason} ({autoDiscountPercent}%)</span>
            </div>
            <span className="text-green-600">
              -{formatCurrency(subtotal * (autoDiscountPercent / 100))}
            </span>
          </div>
        )}

        {/* Manual Discount */}
        {discountPercent > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Manueller Rabatt ({discountPercent}%)</span>
            <span>-{formatCurrency(subtotal * (discountPercent / 100))}</span>
          </div>
        )}

        {/* VAT info */}
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>MwSt. (7.7%)</span>
          <span>{formatCurrency(vatAmount)}</span>
        </div>

        <Separator />

        {/* Total */}
        <div className="flex justify-between text-lg font-bold">
          <span>TOTAL</span>
          <span>{formatCurrency(total)}</span>
        </div>
        <p className="text-xs text-muted-foreground">(inkl. MwSt.)</p>
      </CardContent>
    </Card>
  );
}
