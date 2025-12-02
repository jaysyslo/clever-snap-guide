import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userAnswer, expectedAnswer, stepInstruction, problemContext } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Validating answer:', { userAnswer, expectedAnswer, stepInstruction });

    const systemPrompt = `You are a math tutor evaluating a student's answer. Be LENIENT and focus on whether the student understands the concept correctly.

Accept answers that are:
- Mathematically equivalent (e.g., "2/4" = "1/2" = "0.5")
- Same meaning with different notation (e.g., "x=5" = "5" = "x = 5")
- Correct but with minor formatting differences
- Partial but demonstrate understanding of the key concept
- Simplified or unsimplified versions of the same expression

Only mark as incorrect if the answer shows a fundamental misunderstanding or is completely wrong.

Respond with ONLY a JSON object (no markdown, no code blocks):
{"correct": true/false, "feedback": "brief explanation"}`;

    const userPrompt = `Problem context: ${problemContext || "Math problem"}

Step question: ${stepInstruction}

Expected answer: ${expectedAnswer}

Student's answer: ${userAnswer}

Is the student's answer correct or close enough to be considered correct?`;

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
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('AI API error:', error);
      throw new Error(`AI API error: ${error}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    console.log('AI validation response:', aiResponse);

    // Parse the JSON response, handling potential markdown wrapping
    let result;
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      // Fallback: check if response contains "true" or indicates correctness
      const isCorrect = aiResponse.toLowerCase().includes('"correct": true') || 
                       aiResponse.toLowerCase().includes('"correct":true');
      result = { correct: isCorrect, feedback: "Answer evaluated" };
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
