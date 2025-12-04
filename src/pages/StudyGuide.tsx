import { useState } from "react";
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
import katex from "katex";
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
    if (!studyGuide) return;
    
    setExporting(true);
    try {
      // Parse content to separate main content from solutions
      const sections = studyGuide.split(/(?=##\s)/);
      let mainContent = '';
      let solutionsContent = '';
      
      sections.forEach((section: string) => {
        if (section.includes('<details>') || section.includes('Show Full Solution')) {
          const cleanSection = section.replace(/<details[\s\S]*?<\/details>/g, '[See solutions section]');
          mainContent += cleanSection;
          
          const detailsMatches = section.match(/<details[\s\S]*?<\/details>/g);
          if (detailsMatches) {
            const sectionTitle = section.match(/##\s*([^\n]+)/)?.[1] || 'Practice Problems';
            solutionsContent += `\n\n## Solutions: ${sectionTitle}\n\n`;
            detailsMatches.forEach((detail, idx) => {
              const solutionContent = detail.replace(/<\/?details>/g, '').replace(/<summary>[\s\S]*?<\/summary>/g, '');
              solutionsContent += `**Solution ${idx + 1}:**\n${solutionContent}\n\n---\n\n`;
            });
          }
        } else {
          mainContent += section;
        }
      });

      // Create PDF container with comprehensive styles
      const pdfContainer = document.createElement('div');
      pdfContainer.id = 'pdf-export-container';
      
      // Comprehensive CSS for proper PDF rendering
      const styles = `
        #pdf-export-container {
          font-family: 'Times New Roman', Times, serif;
          font-size: 12pt;
          line-height: 1.6;
          color: #000;
          background: #fff;
          width: 170mm;
          padding: 0;
          box-sizing: border-box;
        }
        #pdf-export-container * {
          box-sizing: border-box;
          max-width: 100%;
        }
        #pdf-export-container h1 {
          font-size: 18pt;
          font-weight: bold;
          margin: 24pt 0 12pt 0;
          padding-bottom: 6pt;
          border-bottom: 1pt solid #000;
          page-break-after: avoid;
        }
        #pdf-export-container h2 {
          font-size: 14pt;
          font-weight: bold;
          margin: 20pt 0 10pt 0;
          page-break-after: avoid;
        }
        #pdf-export-container h3 {
          font-size: 12pt;
          font-weight: bold;
          margin: 16pt 0 8pt 0;
          page-break-after: avoid;
        }
        #pdf-export-container p {
          margin: 8pt 0;
          text-align: justify;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        #pdf-export-container ul, #pdf-export-container ol {
          margin: 8pt 0 8pt 20pt;
          padding-left: 10pt;
        }
        #pdf-export-container li {
          margin: 4pt 0;
          page-break-inside: avoid;
        }
        #pdf-export-container hr {
          border: none;
          border-top: 0.5pt solid #666;
          margin: 16pt 0;
        }
        #pdf-export-container .katex-display {
          display: block;
          margin: 12pt auto;
          text-align: center;
          overflow-x: visible;
          overflow-y: visible;
          page-break-inside: avoid;
        }
        #pdf-export-container .katex {
          font-size: 1em;
          white-space: normal;
        }
        #pdf-export-container .solution-block {
          margin: 16pt 0;
          padding: 12pt;
          background: #f8f8f8;
          border-left: 3pt solid #333;
          page-break-inside: avoid;
        }
        #pdf-export-container .page-break {
          page-break-before: always;
          padding-top: 0;
        }
        #pdf-export-container .section {
          page-break-inside: avoid;
        }
      `;

      const styleTag = document.createElement('style');
      styleTag.textContent = styles;
      pdfContainer.appendChild(styleTag);

      // Add KaTeX CSS
      const katexStyleTag = document.createElement('style');
      katexStyleTag.textContent = `
        .katex { font-size: 1.1em; }
        .katex-display { margin: 1em 0; }
        .katex-display > .katex { display: inline-block; text-align: center; }
      `;
      pdfContainer.appendChild(katexStyleTag);

      // Build content
      const mainHTML = await renderMarkdownToHTML(mainContent);
      const solutionsHTML = solutionsContent ? await renderMarkdownToHTML(solutionsContent) : '';

      const contentWrapper = document.createElement('div');
      contentWrapper.innerHTML = `
        <h1 style="margin-top: 0;">Study Guide</h1>
        <div class="main-content">${mainHTML}</div>
        ${solutionsHTML ? `
          <div class="page-break">
            <h1 style="margin-top: 0;">Full Solutions</h1>
            <div class="solutions-content">${solutionsHTML}</div>
          </div>
        ` : ''}
      `;
      pdfContainer.appendChild(contentWrapper);

      // Add to DOM - must be visible for html2canvas to capture
      pdfContainer.style.position = 'fixed';
      pdfContainer.style.top = '0';
      pdfContainer.style.left = '0';
      pdfContainer.style.zIndex = '-1';
      pdfContainer.style.opacity = '0.01';
      pdfContainer.style.pointerEvents = 'none';
      pdfContainer.style.width = '650px';
      document.body.appendChild(pdfContainer);

      const opt = {
        margin: [15, 15, 20, 15] as [number, number, number, number],
        filename: `study-guide-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          backgroundColor: '#ffffff',
          logging: false,
          width: 650,
          windowWidth: 650
        },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'], before: '.page-break', avoid: ['h1', 'h2', 'h3', 'li', '.solution-block', '.katex-display'] }
      };
      
      await html2pdf().set(opt).from(pdfContainer).save();
      document.body.removeChild(pdfContainer);
      toast({ title: "PDF exported successfully!" });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const renderMarkdownToHTML = async (markdown: string): Promise<string> => {
    let html = markdown;
    
    // Render display math ($$...$$) - must come first
    html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
      try {
        const rendered = katex.renderToString(math.trim(), { 
          displayMode: true, 
          throwOnError: false,
          output: 'html'
        });
        return `<div class="katex-display">${rendered}</div>`;
      } catch {
        return `<code>${math}</code>`;
      }
    });
    
    // Render inline math ($...$)
    html = html.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { 
          displayMode: false, 
          throwOnError: false,
          output: 'html'
        });
      } catch {
        return `<code>${math}</code>`;
      }
    });
    
    // Process line by line for better structure
    const lines = html.split('\n');
    let result = '';
    let inList = false;
    let listType = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('### ')) {
        if (inList) { result += `</${listType}>`; inList = false; }
        result += `<h3>${trimmed.slice(4)}</h3>`;
      } else if (trimmed.startsWith('## ')) {
        if (inList) { result += `</${listType}>`; inList = false; }
        result += `<h2>${trimmed.slice(3)}</h2>`;
      } else if (trimmed.startsWith('# ')) {
        if (inList) { result += `</${listType}>`; inList = false; }
        result += `<h1>${trimmed.slice(2)}</h1>`;
      } else if (trimmed.startsWith('- ')) {
        if (!inList || listType !== 'ul') {
          if (inList) result += `</${listType}>`;
          result += '<ul>';
          inList = true;
          listType = 'ul';
        }
        result += `<li>${processInlineFormatting(trimmed.slice(2))}</li>`;
      } else if (/^\d+\.\s/.test(trimmed)) {
        if (!inList || listType !== 'ol') {
          if (inList) result += `</${listType}>`;
          result += '<ol>';
          inList = true;
          listType = 'ol';
        }
        result += `<li>${processInlineFormatting(trimmed.replace(/^\d+\.\s/, ''))}</li>`;
      } else if (trimmed === '---') {
        if (inList) { result += `</${listType}>`; inList = false; }
        result += '<hr>';
      } else if (trimmed === '') {
        if (inList) { result += `</${listType}>`; inList = false; }
      } else if (trimmed.startsWith('<')) {
        // Already HTML (KaTeX output)
        if (inList) { result += `</${listType}>`; inList = false; }
        result += trimmed;
      } else {
        if (inList) { result += `</${listType}>`; inList = false; }
        result += `<p>${processInlineFormatting(trimmed)}</p>`;
      }
    }
    
    if (inList) result += `</${listType}>`;
    
    // Clean up references to solutions section
    result = result.replace(/\[See solutions section\]/g, '<em>[See solutions section at end of document]</em>');
    
    return result;
  };

  const processInlineFormatting = (text: string): string => {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
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

        <Card className="p-8 space-y-6">
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