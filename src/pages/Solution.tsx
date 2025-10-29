import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, AlertCircle, Lightbulb, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Step {
  instruction: string;
  hint: string;
  answer: string;
}

const Solution = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [solution, setSolution] = useState<string>("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [attemptedWrong, setAttemptedWrong] = useState(false);

  useEffect(() => {
    if (!imageUrl || !mode) {
      navigate("/");
      return;
    }
    generateSolution();
  }, [imageUrl, mode]);

  // Solution.tsx (Client Side)

// Solution.tsx

const generateSolution = async () => {
  setLoading(true);
   
  try {
    const { data, error } = await supabase.functions.invoke("solve-math-problem", {
      body: { imagePath, bucketName: 'problem_images', mode },
    });

    if (error) throw error;

    // --------------------------------------------------------------------
    // FINAL FIX: Safely unwrap the nested response body from the function invocation.
    // The response body { solution, mode } is usually inside `data.data` or sometimes just `data`.
    const responseBody = data && typeof data === 'object' && 'solution' in data 
        ? data // Case 1: If data directly contains the solution key
        : data?.data; // Case 2: If the solution is nested under a 'data' key

    if (!responseBody || typeof responseBody.solution === 'undefined') {
        throw new Error("AI function returned an invalid or empty response structure.");
    }
    // --------------------------------------------------------------------

    // Now, use the safely extracted responseBody for all logic:
    if (mode === 'step_by_step') {
      const parsedSteps = parseSteps(responseBody.solution);
      setSteps(parsedSteps);
    } else {
      setSolution(responseBody.solution);
    }

    // Update the question history with the solution
    await supabase
      .from("question_history")
      .update({ solution_data: { solution: responseBody.solution } }) // Use responseBody
      .eq("user_id", user?.id)
      .eq("image_url", imageUrl)
      .eq("solution_mode", mode);

  } catch (error: any) {
    toast({ title: "Error", description: error.message, variant: "destructive" });
    console.error('Solution error:', error);
  } finally {
    setLoading(false);
  }
};

  const parseSteps = (solutionText: string): Step[] => {
    // Parse the AI response into structured steps
    const stepRegex = /Step \d+:([^|]+)\|?\s*Hint:([^|]+)\|?\s*Answer:([^\n]+)/gi;
    const parsedSteps: Step[] = [];
    let match;

    while ((match = stepRegex.exec(solutionText)) !== null) {
      parsedSteps.push({
        instruction: match[1].trim(),
        hint: match[2].trim(),
        answer: match[3].trim(),
      });
    }

    // Fallback: if parsing fails, create generic steps
    if (parsedSteps.length === 0) {
      const lines = solutionText.split('\n').filter(l => l.trim());
      lines.forEach((line, idx) => {
        if (idx < 4) {
          parsedSteps.push({
            instruction: line,
            hint: "Think about the mathematical principles involved.",
            answer: "Check your work carefully"
          });
        }
      });
    }

    return parsedSteps;
  };

  const handleSubmitAnswer = () => {
    if (!steps[currentStep]) return;

    const normalizeAnswer = (ans: string) => 
      ans.trim().toLowerCase().replace(/\s+/g, '');

    const isCorrect = normalizeAnswer(userAnswer) === normalizeAnswer(steps[currentStep].answer);

    if (isCorrect) {
      toast({ 
        title: "✓ Correct!", 
        description: currentStep < steps.length - 1 ? "Moving to next step" : "Problem completed!"
      });
      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1);
        setUserAnswer("");
        setShowHint(false);
        setAttemptedWrong(false);
      }
    } else {
      setAttemptedWrong(true);
      toast({ 
        title: "Not quite right", 
        description: "Try again or view a hint",
        variant: "destructive"
      });
    }
  };

  const handleGenerateSimilar = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("solve-math-problem", {
        body: { imageUrl, mode: 'similar' },
      });
      if (error) throw error;
      setSolution(data.solution);
      navigate('/solution', { state: { imageUrl, mode: 'similar' }, replace: true });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleReport = async () => {
    try {
      const { data: questionData } = await supabase
        .from("question_history")
        .select("id")
        .eq("user_id", user?.id)
        .eq("image_url", imageUrl)
        .single();

      if (questionData) {
        const { error } = await supabase
          .from("problem_reports")
          .insert({
            user_id: user?.id,
            question_id: questionData.id,
            report_reason: "AI response issue"
          });

        if (error) throw error;
        toast({ title: "Report submitted", description: "Thank you for your feedback" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Analyzing your problem...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-surface p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        {/* Problem Image */}
        <Card className="overflow-hidden">
          <img src={imageUrl} alt="Problem" className="w-full h-auto max-h-64 object-contain bg-muted" />
        </Card>

        {/* Solution Content */}
        {mode === "similar" ? (
          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-bold">Similar Problem Solution</h2>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <div className="bg-accent/30 p-6 rounded-lg whitespace-pre-wrap">
                {solution}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-bold">Step-by-Step Solution</h2>
            
            {currentStep < steps.length ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Step {currentStep + 1} of {steps.length}</span>
                  <div className="flex gap-1">
                    {steps.map((_, idx) => (
                      <div
                        key={idx}
                        className={`w-8 h-1 rounded ${
                          idx < currentStep ? 'bg-primary' : idx === currentStep ? 'bg-primary/50' : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="bg-accent/30 p-4 rounded-lg">
                  <p className="font-semibold mb-2">Step {currentStep + 1}:</p>
                  <p>{steps[currentStep].instruction}</p>
                </div>

                {showHint && (
                  <div className="bg-warning/10 border border-warning p-4 rounded-lg flex gap-3">
                    <Lightbulb className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Hint:</p>
                      <p className="text-sm">{steps[currentStep].hint}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Input
                    placeholder="Enter your answer"
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmitAnswer()}
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSubmitAnswer} className="flex-1">
                      Submit Answer
                    </Button>
                    {!showHint && (
                      <Button variant="outline" onClick={() => setShowHint(true)}>
                        <Lightbulb className="w-4 h-4 mr-2" />
                        Hint
                      </Button>
                    )}
                  </div>
                </div>

                {attemptedWrong && (
                  <Button
                    variant="outline"
                    onClick={handleGenerateSimilar}
                    className="w-full"
                  >
                    Generate Similar Problem Instead
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center space-y-4 py-8">
                <CheckCircle className="w-16 h-16 text-primary mx-auto" />
                <h3 className="text-xl font-bold">Great Job!</h3>
                <p className="text-muted-foreground">You've completed all steps!</p>
                <Button onClick={() => navigate('/')}>Solve Another Problem</Button>
              </div>
            )}
          </Card>
        )}

        <Button
          variant="outline"
          onClick={handleReport}
          className="w-full"
        >
          <AlertCircle className="w-4 h-4 mr-2" />
          Report an Issue
        </Button>
      </div>
    </div>
  );
};

export default Solution;
