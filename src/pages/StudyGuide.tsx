import { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Save, Check, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import html2pdf from "html2pdf.js";
import "katex/dist/katex.min.css";

const StudyGuide = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { studyGuide, savedGuideId } = location.state || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!savedGuideId);
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    if (!user || !studyGuide) return;
    
    setSaving(true);
    try {
      const title = `Study Guide - ${new Date().toLocaleDateString()}`;
      const { error } = await supabase
        .from("study_guides")
        .insert({
          user_id: user.id,
          title,
          content: studyGuide,
        });

      if (error) throw error;
      
      setSaved(true);
      toast({ title: "Study guide saved!" });
    } catch (error: any) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async () => {
    if (!contentRef.current) return;
    
    setExporting(true);
    try {
      // Create an overlay to hide the flash
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: white;
        z-index: 99998;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: system-ui;
        font-size: 18px;
        color: #666;
      `;
      overlay.textContent = 'Generating PDF...';
      document.body.appendChild(overlay);

      // Clone the rendered content
      const clone = contentRef.current.cloneNode(true) as HTMLElement;
      
      // Create wrapper with print-friendly styles
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 800px;
        background: white;
        color: black;
        font-family: 'Times New Roman', Times, serif;
        padding: 40px;
        z-index: 99999;
      `;
      
      // Style the cloned content for PDF
      clone.style.cssText = 'color: black !important; background: white !important;';
      
      // Override all text colors to black for PDF
      clone.querySelectorAll('*').forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.color = 'black';
        if (htmlEl.style.backgroundColor) {
          htmlEl.style.backgroundColor = htmlEl.classList.contains('bg-muted') ? '#f5f5f5' : 'transparent';
        }
      });
      
      // Expand all details elements for PDF
      clone.querySelectorAll('details').forEach((details) => {
        details.setAttribute('open', 'true');
      });
      
      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      // Wait for rendering
      await new Promise(resolve => setTimeout(resolve, 200));

      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `study-guide-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false
        },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
      };
      
      await html2pdf().set(opt).from(wrapper).save();
      
      document.body.removeChild(wrapper);
      document.body.removeChild(overlay);
      toast({ title: "PDF exported successfully!" });
    } catch (error: any) {
      console.error('PDF export error:', error);
      // Clean up on error
      document.querySelectorAll('[style*="z-index: 99999"], [style*="z-index: 99998"]').forEach(el => el.remove());
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };


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
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/history")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to History
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportPDF}
              disabled={exporting}
            >
              <Download className="w-4 h-4 mr-2" />
              {exporting ? "Exporting..." : "Export PDF"}
            </Button>
            {!savedGuideId && (
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={saving || saved}
              >
                {saved ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Saving..." : "Save Guide"}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        <Card ref={contentRef} className="p-8 space-y-6">
          <h1 className="text-2xl font-bold">Your Personalized Study Guide</h1>
          <div className="prose prose-base max-w-none dark:prose-invert prose-headings:mt-8 prose-headings:mb-4 prose-p:my-4 prose-p:leading-relaxed prose-li:my-2 prose-ul:my-4 prose-ol:my-4 prose-hr:my-8">
            <div className="space-y-6">
              <ReactMarkdown 
                remarkPlugins={[remarkMath]} 
                rehypePlugins={[rehypeKatex, rehypeRaw]}
                components={{
                  h1: ({ children, ...props }) => (
                    <h1 {...props} className="text-2xl font-bold mt-8 mb-4 pb-2 border-b border-border">{children}</h1>
                  ),
                  h2: ({ children, ...props }) => (
                    <h2 {...props} className="text-xl font-semibold mt-8 mb-4 text-primary">{children}</h2>
                  ),
                  h3: ({ children, ...props }) => (
                    <h3 {...props} className="text-lg font-semibold mt-6 mb-3">{children}</h3>
                  ),
                  p: ({ children, ...props }) => (
                    <p {...props} className="my-4 leading-relaxed text-foreground/90">{children}</p>
                  ),
                  ul: ({ children, ...props }) => (
                    <ul {...props} className="my-4 ml-6 space-y-2 list-disc">{children}</ul>
                  ),
                  ol: ({ children, ...props }) => (
                    <ol {...props} className="my-4 ml-6 space-y-2 list-decimal">{children}</ol>
                  ),
                  li: ({ children, ...props }) => (
                    <li {...props} className="my-2 leading-relaxed">{children}</li>
                  ),
                  hr: ({ ...props }) => (
                    <hr {...props} className="my-8 border-border" />
                  ),
                  strong: ({ children, ...props }) => (
                    <strong {...props} className="font-semibold text-foreground">{children}</strong>
                  ),
                  details: ({ children, ...props }) => (
                    <details {...props} className="my-6 rounded-lg bg-muted/50 p-5 border border-border">
                      {children}
                    </details>
                  ),
                  summary: ({ children, ...props }) => (
                    <summary {...props} className="cursor-pointer font-semibold text-primary hover:text-primary/80 py-1">
                      {children}
                    </summary>
                  ),
                }}
              >
                {studyGuide}
              </ReactMarkdown>
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