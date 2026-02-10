
-- Create a temporary function to normalize phone numbers
CREATE OR REPLACE FUNCTION public.normalize_phone(phone text) RETURNS text AS $$
DECLARE
  cleaned text;
BEGIN
  IF phone IS NULL OR phone = '' THEN
    RETURN phone;
  END IF;
  
  -- Remove all non-digit characters except +
  cleaned := regexp_replace(phone, '[^\d+]', '', 'g');
  
  -- Handle 00xx... -> +xx...
  IF cleaned LIKE '00%' THEN
    cleaned := '+' || substring(cleaned from 3);
  -- Handle 0xx... (local) -> +41xx...
  ELSIF cleaned LIKE '0%' AND cleaned NOT LIKE '00%' THEN
    cleaned := '+41' || substring(cleaned from 2);
  -- No prefix, has digits -> assume Swiss
  ELSIF cleaned NOT LIKE '+%' AND length(cleaned) >= 7 THEN
    cleaned := '+41' || cleaned;
  ELSIF cleaned NOT LIKE '+%' AND length(cleaned) > 0 THEN
    cleaned := '+' || cleaned;
  END IF;
  
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Normalize customers.phone
UPDATE customers 
SET phone = public.normalize_phone(phone) 
WHERE phone IS NOT NULL AND phone != '' AND phone != public.normalize_phone(phone);

-- Normalize instructors.phone
UPDATE instructors 
SET phone = public.normalize_phone(phone) 
WHERE phone IS NOT NULL AND phone != '' AND phone != public.normalize_phone(phone);

-- Normalize customer_contacts.phone
UPDATE customer_contacts 
SET phone = public.normalize_phone(phone) 
WHERE phone IS NOT NULL AND phone != '' AND phone != public.normalize_phone(phone);

-- Drop the helper function (one-time use)
DROP FUNCTION public.normalize_phone(text);
