-- Create table for AI configuration settings
CREATE TABLE public.ai_configuration (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_configuration ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can read ai_configuration"
ON public.ai_configuration
FOR SELECT
USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admins can insert ai_configuration"
ON public.ai_configuration
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update ai_configuration"
ON public.ai_configuration
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Create table for AI knowledge documents
CREATE TABLE public.ai_knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_knowledge_documents ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can read ai_knowledge_documents"
ON public.ai_knowledge_documents
FOR SELECT
USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admins can insert ai_knowledge_documents"
ON public.ai_knowledge_documents
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete ai_knowledge_documents"
ON public.ai_knowledge_documents
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Create storage bucket for AI knowledge base
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai_knowledge_base', 'ai_knowledge_base', false);

-- Storage policies for admin access
CREATE POLICY "Admins can read ai_knowledge_base"
ON storage.objects
FOR SELECT
USING (bucket_id = 'ai_knowledge_base' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upload to ai_knowledge_base"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'ai_knowledge_base' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete from ai_knowledge_base"
ON storage.objects
FOR DELETE
USING (bucket_id = 'ai_knowledge_base' AND public.has_role(auth.uid(), 'admin'));

-- Insert default configuration
INSERT INTO public.ai_configuration (key, value) VALUES
('tonality_prompt', 'Antworte professionell, aber herzlich und nahbar. Kunden immer mit ''Sie'' ansprechen. Positive und lösungsorientierte Sprache verwenden. Antworten kurz und prägnant halten.'),
('signature_prompt', 'Freundliche Grüsse aus dem verschneiten Malbun,
Ihr Yeti Team');