import { Tables } from "@/integrations/supabase/types";

export interface PriceTier {
  day_count: number;
  cumulative_price: number;
}

export interface ProductWithTiers extends Tables<"products"> {
  price_tiers?: PriceTier[];
}

/**
 * Calculate the total price for a product based on number of days
 * 
 * IMPORTANT: For tiered pricing, price is based on NUMBER of days booked,
 * not which specific weekdays. If someone books Wed+Thu+Fri, that's 3 days.
 */
export function calculatePrice(product: ProductWithTiers, numberOfDays: number): number {
  if (numberOfDays <= 0) return 0;

  const pricingType = product.pricing_type || 'fixed';

  switch (pricingType) {
    case 'tiered': {
      const tiers = product.price_tiers || [];
      if (tiers.length === 0) {
        // Fallback to fixed price if no tiers
        return (product.price || 0) * numberOfDays;
      }

      // Sort tiers by day_count
      const sortedTiers = [...tiers].sort((a, b) => a.day_count - b.day_count);

      // Find exact match
      const exactTier = sortedTiers.find(t => t.day_count === numberOfDays);
      if (exactTier) {
        return Number(exactTier.cumulative_price);
      }

      // If more days than max tier, extrapolate
      const maxTier = sortedTiers[sortedTiers.length - 1];
      if (numberOfDays > maxTier.day_count) {
        // Calculate the per-day rate from the last two tiers
        const prevTier = sortedTiers[sortedTiers.length - 2];
        const extraDayRate = prevTier 
          ? Number(maxTier.cumulative_price) - Number(prevTier.cumulative_price)
          : Number(maxTier.cumulative_price) / maxTier.day_count;
        
        const extraDays = numberOfDays - maxTier.day_count;
        return Number(maxTier.cumulative_price) + (extraDays * extraDayRate);
      }

      // If fewer days than min tier (shouldn't happen normally)
      return Number(sortedTiers[0].cumulative_price);
    }

    case 'hourly': {
      return (product.price || 0) * numberOfDays; // numberOfDays = hours for hourly
    }

    case 'fixed':
    default: {
      return (product.price || 0) * numberOfDays;
    }
  }
}

/**
 * Get detailed price breakdown for display in booking wizard
 */
export function getPriceBreakdown(
  product: ProductWithTiers,
  selectedDates: Date[]
): Array<{ date: Date; dayNumber: number; dayPrice: number; cumulativePrice: number }> {
  const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
  const pricingType = product.pricing_type || 'fixed';
  
  if (pricingType !== 'tiered' || !product.price_tiers?.length) {
    // Fixed pricing: same price each day
    const dayPrice = product.price || 0;
    return sortedDates.map((date, index) => ({
      date,
      dayNumber: index + 1,
      dayPrice,
      cumulativePrice: dayPrice * (index + 1),
    }));
  }

  // Tiered pricing
  const sortedTiers = [...product.price_tiers].sort((a, b) => a.day_count - b.day_count);

  return sortedDates.map((date, index) => {
    const dayNumber = index + 1;
    
    const currentTier = sortedTiers.find(t => t.day_count === dayNumber);
    const prevTier = sortedTiers.find(t => t.day_count === dayNumber - 1);
    
    let cumulativePrice: number;
    let dayPrice: number;

    if (currentTier) {
      cumulativePrice = Number(currentTier.cumulative_price);
      dayPrice = prevTier 
        ? Number(currentTier.cumulative_price) - Number(prevTier.cumulative_price)
        : Number(currentTier.cumulative_price);
    } else {
      // Beyond defined tiers - extrapolate
      const maxTier = sortedTiers[sortedTiers.length - 1];
      const secondMaxTier = sortedTiers[sortedTiers.length - 2];
      
      dayPrice = secondMaxTier
        ? Number(maxTier.cumulative_price) - Number(secondMaxTier.cumulative_price)
        : Number(maxTier.cumulative_price) / maxTier.day_count;
      
      const prevCumulative = index > 0 
        ? calculatePrice(product, dayNumber - 1)
        : 0;
      cumulativePrice = prevCumulative + dayPrice;
    }

    return { date, dayNumber, dayPrice, cumulativePrice };
  });
}

/**
 * Calculate savings percentage for a given tier
 */
export function calculateSavingsPercent(tiers: PriceTier[], dayCount: number): number {
  if (dayCount <= 1 || tiers.length < dayCount) return 0;
  
  const sortedTiers = [...tiers].sort((a, b) => a.day_count - b.day_count);
  const firstDayPrice = Number(sortedTiers[0]?.cumulative_price) || 0;
  const totalAtFirstDayRate = firstDayPrice * dayCount;
  
  const currentTier = sortedTiers.find(t => t.day_count === dayCount);
  const actualPrice = Number(currentTier?.cumulative_price) || 0;
  
  if (totalAtFirstDayRate === 0) return 0;
  return Math.round(((totalAtFirstDayRate - actualPrice) / totalAtFirstDayRate) * 100);
}

/**
 * Format price for display (Swiss format)
 */
export function formatPriceCHF(amount: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Get price display string for a product (for list views)
 */
export function getProductPriceDisplay(product: ProductWithTiers): string {
  const pricingType = product.pricing_type || 'fixed';
  
  if (pricingType === 'tiered' && product.price_tiers?.length) {
    const sortedTiers = [...product.price_tiers].sort((a, b) => a.day_count - b.day_count);
    const minPrice = Number(sortedTiers[0]?.cumulative_price) || 0;
    const maxPrice = Number(sortedTiers[sortedTiers.length - 1]?.cumulative_price) || 0;
    return `${formatPriceCHF(minPrice)} – ${formatPriceCHF(maxPrice)}`;
  }
  
  if (pricingType === 'hourly') {
    return `${formatPriceCHF(product.price || 0)}/h`;
  }
  
  return formatPriceCHF(product.price || 0);
}

/**
 * Get default price tiers for a new tiered product
 */
export function getDefaultPriceTiers(): PriceTier[] {
  return [
    { day_count: 1, cumulative_price: 0 },
    { day_count: 2, cumulative_price: 0 },
    { day_count: 3, cumulative_price: 0 },
    { day_count: 4, cumulative_price: 0 },
    { day_count: 5, cumulative_price: 0 },
  ];
}
