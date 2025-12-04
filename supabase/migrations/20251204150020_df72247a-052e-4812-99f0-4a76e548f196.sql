-- Create study_guides table
CREATE TABLE public.study_guides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Study Guide',
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.study_guides ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own study guides"
ON public.study_guides
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own study guides"
ON public.study_guides
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own study guides"
ON public.study_guides
FOR DELETE
USING (auth.uid() = user_id);