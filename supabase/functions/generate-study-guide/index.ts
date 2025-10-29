import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch user's question history
    const { data: questions, error } = await supabase
      .from('question_history')
      .select('problem_text, solution_mode, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!questions || questions.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No question history found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare context from question history
    const historyContext = questions.map((q, idx) => `Problem ${idx + 1} (Mode: ${q.solution_mode}):\n-- Problem Text: ${q.problem_text

    const systemPrompt = `You are an expert math tutor creating a highly personalized study guide. Analyze the provided problem texts and solution modes from the history. Identify the mathematical concepts involved, common mistakes, and areas needing review. Your response MUST be formatted with clear headings for:
    1. Summary of Topics Covered
    2. Key Concepts to Review
    3. Practice Problems for Weak Areas (include an example problem for each area)
    4. Study Recommendations`; 

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `Generate a personalized study guide based on this question history:\n\n${historyContext}\n\nTotal questions: ${questions.length}`
          }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('AI API error:', error);
      throw new Error(`AI API error: ${error}`);
    }

    const data = await response.json();
    const studyGuide = data.choices[0].message.content;

    console.log('Study guide generated successfully');

    return new Response(
      JSON.stringify({ studyGuide }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
