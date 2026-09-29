DO $$
DECLARE m jsonb := '{
"ai_configuration":["Admins can insert ai_configuration","Admins can read ai_configuration","Admins can update ai_configuration"],
"ai_knowledge_documents":["Admins can delete ai_knowledge_documents","Admins can insert ai_knowledge_documents","Admins can read ai_knowledge_documents"],
"booking_cancellations":["Admin/office can manage cancellations"],
"booking_requests":["Anyone can create booking requests","Anyone can view requests by magic token","Authenticated users can update booking requests"],
"customer_contacts":["Authenticated users can delete customer_contacts","Authenticated users can insert customer_contacts","Authenticated users can update customer_contacts","Authenticated users can view customer_contacts"],
"customer_credit_usage":["Admin/office can manage credit usage"],
"customer_credits":["Admin/office can manage credits"],
"email_logs":["Admin can view email logs"],
"email_templates":["Admin can manage email templates"],
"event_categories":["Admin/office can manage event_categories","Authenticated can view event_categories"],
"event_participants":["Admin/office can manage event_participants","Authenticated can view event_participants","Instructors can update opt_out"],
"events":["Admin/office can manage events","Authenticated can view events"],
"group_course_enrollments":["Authenticated users can delete group_course_enrollments","Authenticated users can insert group_course_enrollments","Authenticated users can update group_course_enrollments","Authenticated users can view all group_course_enrollments"],
"group_course_instances":["Authenticated users can delete group_course_instances","Authenticated users can insert group_course_instances","Authenticated users can update group_course_instances","Authenticated users can view all group_course_instances"],
"group_course_schedules":["Authenticated users can delete group_course_schedules","Authenticated users can insert group_course_schedules","Authenticated users can update group_course_schedules","Authenticated users can view all group_course_schedules"],
"group_courses":["Authenticated users can delete group_courses","Authenticated users can insert group_courses","Authenticated users can update group_courses","Authenticated users can view all group_courses"],
"instructor_absences":["Authenticated users can delete absences","Authenticated users can insert absences","Authenticated users can update absences","Authenticated users can view all absences"],
"instructor_notification_queue":["Admin can manage notification queue","Admin can view notification queue"],
"instructor_recurring_blocks":["Admins can manage all blocks","Instructors can create their own blocks","Instructors can update their own pending blocks","Instructors can view their own blocks"],
"invoices":["Admin and office can insert invoices","Admin and office can update invoices","Admin and office can view all invoices"],
"master_bookings":["Authenticated users can delete master_bookings","Authenticated users can insert master_bookings","Authenticated users can update master_bookings","Authenticated users can view master_bookings"],
"notification_preferences":["Users can manage own preferences"],
"notifications":["Admin can insert notifications","Users can update own notifications","Users can view own notifications"],
"office_hour_blocks":["Admin and office can create office hour blocks","Admin and office can delete office hour blocks","Admin and office can update office hour blocks","Admin and office can view office hour blocks"],
"office_shift_assignments":["Admin/office can manage office_shift_assignments","Authenticated users can view office_shift_assignments"],
"participant_level_history":["Authenticated can insert level_history","Authenticated can update level_history","Authenticated can view level_history"],
"participant_transfer_requests":["Admin and office have full access","Instructors can create transfer requests","Instructors can view their transfer requests","Requesting instructor can cancel requests","Target instructor can respond to requests"],
"payments":["Authenticated users can delete payments","Authenticated users can insert payments","Authenticated users can update payments","Authenticated users can view payments"],
"private_lesson_rates":["Anyone can view private lesson rates","Authenticated users can manage rates"],
"product_price_tiers":["Price tiers are viewable by everyone","Price tiers can be managed by admin/office"],
"refund_requests":["Admin/office can manage refunds"],
"shop_article_variants":["Authenticated users can delete shop_article_variants","Authenticated users can insert shop_article_variants","Authenticated users can update shop_article_variants","Authenticated users can view shop_article_variants"],
"shop_articles":["Authenticated users can delete shop_articles","Authenticated users can insert shop_articles","Authenticated users can update shop_articles","Authenticated users can view shop_articles"],
"shop_stock_movements":["Authenticated users can insert shop_stock_movements","Authenticated users can view shop_stock_movements"],
"shop_transaction_items":["Authenticated users can insert shop_transaction_items","Authenticated users can view shop_transaction_items"],
"shop_transactions":["Authenticated users can insert shop_transactions","Authenticated users can update shop_transactions","Authenticated users can view shop_transactions"],
"skill_levels":["Admin can manage skill_levels","Anyone can view skill_levels"],
"ticket_history":["Authenticated users can insert ticket_history","Authenticated users can view ticket_history"],
"ticket_item_overrides":["Authenticated users can delete ticket item overrides","Authenticated users can insert ticket item overrides","Authenticated users can update ticket item overrides","Authenticated users can view ticket item overrides"],
"training_course_dates":["Admin/office can manage course dates","Authenticated users can view course dates"],
"training_groups":["Admin/office can manage training_groups","Authenticated users can view training_groups"],
"voucher_redemptions":["Authenticated users can insert redemptions","Authenticated users can view redemptions"],
"vouchers":["Authenticated users can insert vouchers","Authenticated users can update vouchers","Authenticated users can view vouchers"]
}'::jsonb; t text; p text;
BEGIN
  FOR t IN SELECT jsonb_object_keys(m) LOOP
    FOR p IN SELECT jsonb_array_elements_text(m->t) LOOP
      EXECUTE format('ALTER POLICY %I ON public.%I TO public', p, t);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY "Public can view conversations" ON public.conversations AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view customer_participants" ON public.customer_participants AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view groups" ON public.groups AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view instructors" ON public.instructors AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view ticket_items" ON public.ticket_items AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view tickets" ON public.tickets AS PERMISSIVE FOR SELECT TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;