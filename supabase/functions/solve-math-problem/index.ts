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
    const { imageUrl, mode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }


    // ... (omitted code)

    // Fetch the image and convert to base64
    console.log('Fetching image from:', imageUrl);
    console.log('Mode:', mode);
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    // Correctly convert ArrayBuffer to a Base64 string
    const uint8Array = new Uint8Array(imageBuffer);
    // Convert Uint8Array to a binary string before btoa()
    const binaryString = uint8Array.reduce(
        (acc, byte) => acc + String.fromCharCode(byte), 
        ''
    );
    const base64Image = btoa(binaryString);

    const mimeType = imageResponse.headers.get('content-type') || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    console.log('Image converted to base64, size:', base64Image.length);

    let systemPrompt = '';

    if (mode === 'similar') {
      systemPrompt = "You are a math tutor. Analyze the math problem in the image and create a SIMILAR (not identical) problem with a complete step-by-step solution. Format your response as a clear, educational walkthrough with numbered steps.";
    } else if (mode === 'step_by_step') {
      systemPrompt = "You are a math tutor. Analyze the EXACT problem in the image and break it down into 3-4 clear steps. For EACH step, you must provide: 1) A brief instruction/question for that step, 2) A helpful hint, and 3) The correct answer for that specific step. Format as: Step 1: [instruction] | Hint: [hint] | Answer: [answer]";
    }

    console.log('Calling AI with mode:', mode);
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
            content: [
              { type: 'text', text: 'Please analyze this math problem and provide the solution in the requested format.' },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
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
    const solution = data.choices[0].message.content;

    console.log('AI Response:', solution);

    return new Response(
      JSON.stringify({ solution, mode }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // ... (omitted code)

  } catch (error) {
    console.error('Error:', error.name, error.message); // Added .name
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
