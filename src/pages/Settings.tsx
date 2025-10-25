import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Moon, Sun, Monitor, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Settings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [staySignedIn, setStaySignedIn] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("stay_signed_in, theme")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      if (data) {
        setStaySignedIn(data.stay_signed_in);
        setTheme(data.theme as any);
      }
    } catch (error: any) {
      console.error("Error loading settings:", error);
    }
  };

  const updateSetting = async (field: string, value: any) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ [field]: value })
        .eq("id", user.id);

      if (error) throw error;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    try {
      // Delete profile (cascade will handle related data)
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", user.id);

      if (error) throw error;

      await supabase.auth.signOut();
      toast({ title: "Account deleted successfully" });
      navigate("/auth");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="min-h-screen bg-gradient-surface p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Settings</h1>
          <div className="w-20" />
        </div>

        <Card className="p-6 space-y-6">
          {/* Theme Selection */}
          <div className="space-y-4">
            <Label className="text-lg font-semibold">Theme</Label>
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  variant={theme === value ? "default" : "outline"}
                  onClick={() => {
                    setTheme(value as any);
                    updateSetting("theme", value);
                  }}
                  className="h-auto py-4 flex flex-col gap-2"
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Stay Signed In */}
          <div className="flex items-center justify-between py-4 border-t">
            <div className="space-y-1">
              <Label htmlFor="stay-signed-in">Stay Signed In</Label>
              <p className="text-sm text-muted-foreground">
                Keep me logged in on this device
              </p>
            </div>
            <Switch
              id="stay-signed-in"
              checked={staySignedIn}
              onCheckedChange={(checked) => {
                setStaySignedIn(checked);
                updateSetting("stay_signed_in", checked);
              }}
            />
          </div>
        </Card>

        {/* Account Actions */}
        <Card className="p-6 space-y-4">
          <Button
            variant="outline"
            onClick={handleSignOut}
            className="w-full"
          >
            Sign Out
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your
                  account and all associated data including your question history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete Account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
