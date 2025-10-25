import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, AlertCircle, Lightbulb, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Solution = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { imageUrl, mode } = location.state || {};
  const [loading, setLoading] = useState(true);
  const [solution, setSolution] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!imageUrl || !mode) {
      navigate("/");
      return;
    }
    generateSolution();
  }, [imageUrl, mode]);

  const generateSolution = async () => {
    setLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("solve-math-problem", {
        body: { imageUrl, mode },
      });

      if (error) throw error;
      setSolution(data);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = () => {
    if (!solution?.steps?.[currentStep]) return;

    const isCorrect = userAnswer.trim().toLowerCase() === solution.steps[currentStep].answer.toLowerCase();

    if (isCorrect) {
      toast({ title: "Correct!", description: "Moving to next step" });
      setCurrentStep(currentStep + 1);
      setUserAnswer("");
      setShowHint(false);
    } else {
      toast({ 
        title: "Not quite right", 
        description: "Try again or view a hint",
        variant: "destructive"
      });
    }
  };

  const handleReport = async () => {
    // This will be implemented with the reporting feature
    toast({ title: "Report submitted", description: "Thank you for your feedback" });
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
            <div className="prose prose-sm max-w-none">
              <p className="text-muted-foreground mb-4">
                This is a placeholder for the AI-generated similar problem solution.
                The actual implementation will call the AI API to generate a complete
                solution to a similar problem.
              </p>
              <div className="bg-accent/50 p-4 rounded-lg">
                <p className="font-semibold">Example: If the problem is "Solve: 2x + 5 = 15"</p>
                <ol className="mt-2 space-y-2">
                  <li>Step 1: Subtract 5 from both sides: 2x = 10</li>
                  <li>Step 2: Divide both sides by 2: x = 5</li>
                  <li>Step 3: Verify: 2(5) + 5 = 15 ✓</li>
                </ol>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-bold">Step-by-Step Solution</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Step {currentStep + 1} of 3</span>
              </div>

              <div className="bg-accent/50 p-4 rounded-lg">
                <p className="font-semibold mb-2">Current Step:</p>
                <p>This is a placeholder for the current step instruction.</p>
              </div>

              {showHint && (
                <div className="bg-warning/10 border border-warning p-4 rounded-lg flex gap-3">
                  <Lightbulb className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Hint:</p>
                    <p className="text-sm">This is a placeholder for the hint.</p>
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
                  <Button variant="outline" onClick={() => setShowHint(true)}>
                    <Lightbulb className="w-4 h-4 mr-2" />
                    Hint
                  </Button>
                </div>
              </div>
            </div>
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
