-- Add tags column to question_history for storing topic tags
ALTER TABLE public.question_history 
ADD COLUMN tags text[] DEFAULT '{}'::text[];