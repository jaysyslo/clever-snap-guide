import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Lightbulb, ListChecks, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const Solve = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { imageUrl } = location.state || {};
  const [selectedMode, setSelectedMode] = useState<"similar" | "step_by_step" | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!imageUrl) {
      toast({ title: "No image provided", variant: "destructive" });
      navigate("/");
    }
  }, [imageUrl, navigate, toast]);

  const handleModeSelect = async (mode: "similar" | "step_by_step") => {
    setSelectedMode(mode);
    setLoading(true);

    try {
      // Store question in history
      const { error } = await supabase
        .from("question_history")
        .insert({
          user_id: user?.id,
          image_url: imageUrl,
          solution_mode: mode,
          solution_data: { status: "processing" },
        });

      if (error) throw error;

      toast({ title: "Processing your problem...", description: "This may take a moment." });
      
      // Navigate to solution page
      navigate("/solution", { state: { imageUrl, mode } });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleReport = () => {
    toast({ title: "Report feature", description: "This will be available after solving." });
  };

  return (
    <div className="min-h-screen bg-gradient-surface p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {/* Image Preview */}
        <Card className="overflow-hidden">
          <img
            src={imageUrl}
            alt="Math problem"
            className="w-full h-auto max-h-96 object-contain bg-muted"
          />
        </Card>

        {/* Mode Selection */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-center">Choose Your Learning Mode</h2>

          <div className="grid gap-4">
            <Button
              onClick={() => handleModeSelect("similar")}
              disabled={loading}
              className="h-auto p-6 bg-gradient-primary hover:opacity-90 transition-smooth rounded-2xl shadow-lg flex flex-col items-start text-left"
            >
              <div className="flex items-center gap-3 mb-2">
                <Lightbulb className="w-6 h-6" />
                <h3 className="text-xl font-semibold">See a Similar Problem Solved</h3>
              </div>
              <p className="text-sm opacity-90">
                View a complete solution to a similar problem to understand the approach
              </p>
            </Button>

            <Button
              onClick={() => handleModeSelect("step_by_step")}
              disabled={loading}
              className="h-auto p-6 bg-gradient-secondary hover:opacity-90 transition-smooth rounded-2xl shadow-lg flex flex-col items-start text-left"
            >
              <div className="flex items-center gap-3 mb-2">
                <ListChecks className="w-6 h-6" />
                <h3 className="text-xl font-semibold">Step-by-Step Guidance</h3>
              </div>
              <p className="text-sm opacity-90">
                Work through your exact problem with hints and validation
              </p>
            </Button>
          </div>
        </div>

        {/* Report Option */}
        <Button
          variant="outline"
          onClick={handleReport}
          className="w-full rounded-xl"
        >
          <AlertCircle className="w-4 h-4 mr-2" />
          Report a Problem
        </Button>
      </div>
    </div>
  );
};

export default Solve;
