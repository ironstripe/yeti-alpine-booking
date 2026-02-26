
-- Enums
CREATE TYPE public.inventory_condition AS ENUM ('Neu', 'Ok', 'Ausgebleicht', 'Ersetzen');
CREATE TYPE public.inventory_item_status AS ENUM ('Verfügbar', 'Ausgeliehen', 'Verloren', 'In Reparatur');
CREATE TYPE public.rental_status AS ENUM ('Wartet auf Quittierung', 'Ausgeliehen', 'Teilweise zurückgegeben', 'Abgeschlossen');
CREATE TYPE public.rental_item_status AS ENUM ('Ausgeliehen', 'Rückgabe initiiert', 'Zurückgegeben', 'Verloren gemeldet');
CREATE TYPE public.return_condition AS ENUM ('Ok', 'Beschädigt', 'Verloren');

-- 1. inventory_categories
CREATE TABLE public.inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/office can manage categories"
  ON public.inventory_categories FOR ALL
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()))
  WITH CHECK (public.is_admin_or_office(auth.uid()));

-- 2. inventory_items
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  inventory_number TEXT UNIQUE,
  size TEXT,
  color TEXT,
  condition public.inventory_condition NOT NULL DEFAULT 'Neu',
  status public.inventory_item_status NOT NULL DEFAULT 'Verfügbar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/office can manage items"
  ON public.inventory_items FOR ALL
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()))
  WITH CHECK (public.is_admin_or_office(auth.uid()));

-- Instructors can read items (to see what they have)
CREATE POLICY "Instructors can read items"
  ON public.inventory_items FOR SELECT
  TO authenticated
  USING (public.get_instructor_for_user(auth.uid()) IS NOT NULL);

CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. inventory_rentals
CREATE TABLE public.inventory_rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  office_user_id UUID NOT NULL REFERENCES auth.users(id),
  rental_period_start DATE NOT NULL,
  rental_period_end DATE,
  status public.rental_status NOT NULL DEFAULT 'Wartet auf Quittierung',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_rentals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/office can manage rentals"
  ON public.inventory_rentals FOR ALL
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()))
  WITH CHECK (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Instructors can read own rentals"
  ON public.inventory_rentals FOR SELECT
  TO authenticated
  USING (instructor_id = public.get_instructor_for_user(auth.uid()));

CREATE POLICY "Instructors can confirm own rentals"
  ON public.inventory_rentals FOR UPDATE
  TO authenticated
  USING (instructor_id = public.get_instructor_for_user(auth.uid()))
  WITH CHECK (instructor_id = public.get_instructor_for_user(auth.uid()));

CREATE TRIGGER update_inventory_rentals_updated_at
  BEFORE UPDATE ON public.inventory_rentals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. inventory_rental_items
CREATE TABLE public.inventory_rental_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id UUID NOT NULL REFERENCES public.inventory_rentals(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  status public.rental_item_status NOT NULL DEFAULT 'Ausgeliehen',
  returned_at TIMESTAMPTZ,
  return_condition public.return_condition,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_rental_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/office can manage rental items"
  ON public.inventory_rental_items FOR ALL
  TO authenticated
  USING (public.is_admin_or_office(auth.uid()))
  WITH CHECK (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Instructors can read own rental items"
  ON public.inventory_rental_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_rentals r
      WHERE r.id = rental_id
        AND r.instructor_id = public.get_instructor_for_user(auth.uid())
    )
  );

CREATE POLICY "Instructors can update own rental items"
  ON public.inventory_rental_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_rentals r
      WHERE r.id = rental_id
        AND r.instructor_id = public.get_instructor_for_user(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inventory_rentals r
      WHERE r.id = rental_id
        AND r.instructor_id = public.get_instructor_for_user(auth.uid())
    )
  );
