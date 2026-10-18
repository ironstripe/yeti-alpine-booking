-- Export this display-only table before rollback if staff have entered information.
-- Does not touch products, BC sources, operational tariffs, bookings or invoices.
DROP FUNCTION public.save_public_private_tariff_display(uuid,uuid,jsonb,integer,boolean,uuid);
DROP TABLE public.public_private_tariff_display;
DROP FUNCTION public.public_private_display_shape(jsonb);
