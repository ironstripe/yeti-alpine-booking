-- Group Courses (recurring training definitions)
CREATE TABLE public.group_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  skill_level TEXT NOT NULL DEFAULT 'beginner',
  discipline TEXT NOT NULL DEFAULT 'ski',
  min_age INTEGER,
  max_age INTEGER,
  max_participants INTEGER NOT NULL DEFAULT 8,
  price_per_day NUMERIC(10,2) NOT NULL,
  price_full_week NUMERIC(10,2),
  meeting_point TEXT,
  color TEXT DEFAULT '#3B82F6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Group Course Schedules (weekly recurring patterns)
CREATE TABLE public.group_course_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.group_courses(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Group Course Instances (actual occurrences on specific dates)
CREATE TABLE public.group_course_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.group_courses(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.group_course_schedules(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
  assistant_instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'scheduled',
  current_participants INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(course_id, date, start_time)
);

-- Group Course Enrollments (participants in each instance)
CREATE TABLE public.group_course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.group_course_instances(id) ON DELETE CASCADE,
  ticket_item_id UUID REFERENCES public.ticket_items(id) ON DELETE SET NULL,
  participant_id UUID REFERENCES public.customer_participants(id) ON DELETE SET NULL,
  attendance_status TEXT DEFAULT 'registered',
  checked_in_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.group_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_course_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_course_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_course_enrollments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for group_courses
CREATE POLICY "Authenticated users can view all group_courses"
ON public.group_courses FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert group_courses"
ON public.group_courses FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update group_courses"
ON public.group_courses FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete group_courses"
ON public.group_courses FOR DELETE
USING (true);

-- RLS Policies for group_course_schedules
CREATE POLICY "Authenticated users can view all group_course_schedules"
ON public.group_course_schedules FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert group_course_schedules"
ON public.group_course_schedules FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update group_course_schedules"
ON public.group_course_schedules FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete group_course_schedules"
ON public.group_course_schedules FOR DELETE
USING (true);

-- RLS Policies for group_course_instances
CREATE POLICY "Authenticated users can view all group_course_instances"
ON public.group_course_instances FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert group_course_instances"
ON public.group_course_instances FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update group_course_instances"
ON public.group_course_instances FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete group_course_instances"
ON public.group_course_instances FOR DELETE
USING (true);

-- RLS Policies for group_course_enrollments
CREATE POLICY "Authenticated users can view all group_course_enrollments"
ON public.group_course_enrollments FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert group_course_enrollments"
ON public.group_course_enrollments FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update group_course_enrollments"
ON public.group_course_enrollments FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete group_course_enrollments"
ON public.group_course_enrollments FOR DELETE
USING (true);

-- Trigger for updated_at on group_courses
CREATE TRIGGER update_group_courses_updated_at
BEFORE UPDATE ON public.group_courses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for instances
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_course_instances;