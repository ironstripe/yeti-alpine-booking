import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CustomerMatch {
  customer: {
    id: string;
    first_name: string | null;
    last_name: string;
    email: string;
    phone: string | null;
  };
  matchType: "exact_email" | "exact_phone" | "fuzzy_name";
  confidence: number;
  previousBookings: number;
}

function normalizePhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Remove spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
  
  // Convert 0041 to +41
  if (cleaned.startsWith("0041")) {
    cleaned = "+41" + cleaned.slice(4);
  }
  // Convert 00423 to +423
  if (cleaned.startsWith("00423")) {
    cleaned = "+423" + cleaned.slice(5);
  }
  // Convert leading 0 to +41 (Swiss default)
  if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
    cleaned = "+41" + cleaned.slice(1);
  }
  
  return cleaned;
}

function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  
  if (n1 === n2) return 1;
  
  // Split into parts
  const parts1 = n1.split(/\s+/);
  const parts2 = n2.split(/\s+/);
  
  // Check if last names match
  const lastName1 = parts1[parts1.length - 1];
  const lastName2 = parts2[parts2.length - 1];
  
  if (lastName1 !== lastName2) return 0;
  
  // Check first names
  if (parts1.length > 1 && parts2.length > 1) {
    if (parts1[0] === parts2[0]) return 1;
    // Partial match on first name
    if (parts1[0].startsWith(parts2[0]) || parts2[0].startsWith(parts1[0])) {
      return 0.8;
    }
  }
  
  // Only last name matches
  return 0.7;
}

export function useCustomerMatching(
  email?: string | null,
  phone?: string | null,
  name?: string | null
) {
  return useQuery({
    queryKey: ["customer-matching", email, phone, name],
    queryFn: async (): Promise<CustomerMatch[]> => {
      const matches: CustomerMatch[] = [];
      
      // 1. Exact email match (highest confidence)
      if (email) {
        const { data: emailMatch } = await supabase
          .from("customers")
          .select(`
            id, first_name, last_name, email, phone,
            tickets(count)
          `)
          .ilike("email", email.toLowerCase())
          .limit(1)
          .single();
        
        if (emailMatch) {
          matches.push({
            customer: emailMatch,
            matchType: "exact_email",
            confidence: 1.0,
            previousBookings: (emailMatch.tickets as any)?.[0]?.count || 0,
          });
        }
      }
      
      // 2. Exact phone match (if no email match)
      if (phone && matches.length === 0) {
        const normalizedPhone = normalizePhoneNumber(phone);
        if (normalizedPhone) {
          const { data: phoneMatches } = await supabase
            .from("customers")
            .select(`
              id, first_name, last_name, email, phone,
              tickets(count)
            `)
            .not("phone", "is", null)
            .limit(50);
          
          if (phoneMatches) {
            for (const customer of phoneMatches) {
              const customerNormalized = normalizePhoneNumber(customer.phone);
              if (customerNormalized === normalizedPhone) {
                matches.push({
                  customer,
                  matchType: "exact_phone",
                  confidence: 0.95,
                  previousBookings: (customer.tickets as any)?.[0]?.count || 0,
                });
                break;
              }
            }
          }
        }
      }
      
      // 3. Fuzzy name match (if no exact matches)
      if (name && matches.length === 0) {
        const nameParts = name.toLowerCase().split(/\s+/);
        const lastName = nameParts[nameParts.length - 1];
        
        const { data: nameMatches } = await supabase
          .from("customers")
          .select(`
            id, first_name, last_name, email, phone,
            tickets(count)
          `)
          .ilike("last_name", `%${lastName}%`)
          .limit(10);
        
        if (nameMatches) {
          for (const customer of nameMatches) {
            const fullName = `${customer.first_name || ""} ${customer.last_name}`.trim();
            const similarity = calculateNameSimilarity(name, fullName);
            
            if (similarity >= 0.7) {
              matches.push({
                customer,
                matchType: "fuzzy_name",
                confidence: similarity,
                previousBookings: (customer.tickets as any)?.[0]?.count || 0,
              });
            }
          }
        }
      }
      
      // Sort by confidence
      return matches.sort((a, b) => b.confidence - a.confidence);
    },
    enabled: !!(email || phone || name),
    staleTime: 30000, // Cache for 30 seconds
  });
}
