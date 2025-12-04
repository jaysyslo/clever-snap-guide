import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Camera, Upload, History, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [problemsSolved, setProblemsSolved] = useState(0);
  const [studyGuidesCount, setStudyGuidesCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;
      
      try {
        const [questionsRes, guidesRes] = await Promise.all([
          supabase
            .from("question_history")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("study_guides")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);

        if (questionsRes.error) throw questionsRes.error;
        if (guidesRes.error) throw guidesRes.error;

        setProblemsSolved(questionsRes.count || 0);
        setStudyGuidesCount(guidesRes.count || 0);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [user]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("problem-images")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("problem-images")
        .getPublicUrl(fileName);

      navigate("/solve", { state: { imageUrl: publicUrl } });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleCameraCapture = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = (e: any) => handleFileUpload(e);
    input.click();
  };

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-md">
              <span className="text-primary-foreground font-bold text-sm">F(x)</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Foundx</h1>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/history")}
              className="rounded-xl"
            >
              <History className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/settings")}
              className="rounded-xl"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Main Actions */}
        <div className="space-y-4">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Get Help with Math</h2>
            <p className="text-muted-foreground">Upload or capture a problem to get started</p>
          </div>

          <div className="grid gap-4">
            <Button
              onClick={handleCameraCapture}
              disabled={uploading}
              className="h-32 bg-gradient-primary hover:opacity-90 transition-smooth text-lg rounded-2xl shadow-lg"
            >
              <Camera className="w-8 h-8 mr-3" />
              Take Photo
            </Button>

            <label className="block">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
              <div className="w-full h-32 bg-gradient-secondary hover:opacity-90 transition-smooth text-lg rounded-2xl shadow-lg cursor-pointer flex items-center justify-center text-secondary-foreground font-medium">
                <Upload className="w-8 h-8 mr-3" />
                Upload Image
              </div>
            </label>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-card rounded-2xl p-6 shadow-md">
          <h3 className="font-semibold mb-4">Your Progress</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">
                {loadingStats ? "—" : problemsSolved}
              </div>
              <div className="text-sm text-muted-foreground">Problems Solved</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-secondary">
                {loadingStats ? "—" : studyGuidesCount}
              </div>
              <div className="text-sm text-muted-foreground">Study Guides</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
