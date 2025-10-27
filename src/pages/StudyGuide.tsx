import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const StudyGuide = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { studyGuide } = location.state || {};

  if (!studyGuide) {
    return (
      <div className="min-h-screen bg-gradient-surface p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <Button variant="ghost" onClick={() => navigate("/history")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to History
          </Button>
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No study guide available</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-surface p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/history")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to History
        </Button>

        <Card className="p-6 space-y-4">
          <h1 className="text-2xl font-bold">Your Personalized Study Guide</h1>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <div className="bg-accent/30 p-6 rounded-lg whitespace-pre-wrap">
              {studyGuide}
            </div>
          </div>
        </Card>

        <Button
          onClick={() => navigate("/")}
          className="w-full bg-gradient-primary hover:opacity-90 transition-smooth rounded-xl"
        >
          Practice More Problems
        </Button>
      </div>
    </div>
  );
};

export default StudyGuide;