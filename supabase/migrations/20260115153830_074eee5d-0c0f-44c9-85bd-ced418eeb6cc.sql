-- Add file_size column to ai_knowledge_documents for better UX
ALTER TABLE public.ai_knowledge_documents 
ADD COLUMN IF NOT EXISTS file_size INTEGER;

-- Add created_by column to track who uploaded the document  
ALTER TABLE public.ai_knowledge_documents 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);