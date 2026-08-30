import React, { useState } from "react";
import { Workflow, Maximize2, X, Terminal, Sparkles, ChevronDown } from "lucide-react";

interface DiagramStep {
  stepNumber: number;
  text: string;
  connectorText?: string;
}

interface ParsedDiagram {
  isDiagram: boolean;
  title: string;
  steps: DiagramStep[];
}

export function parseAsciiDiagram(rawText: string): ParsedDiagram {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { isDiagram: false, title: "", steps: [] };
  }

  // Check if it has ASCII box characters or diagram elements
  const hasDiagramChars = /[┌└┐┘├┤┬┴┼│\u2500-\u257F▼↓]|\+[\-\=]{3,}\+|\[.*\]/.test(rawText);
  if (!hasDiagramChars && lines.length < 2) {
    return { isDiagram: false, title: "", steps: [] };
  }

  let title = "";
  let startIndex = 0;

  if (lines.length > 0 && /^\[.*\]$/.test(lines[0])) {
    title = lines[0].slice(1, -1).trim();
    startIndex = 1;
  } else if (lines.length > 0 && /^#+\s+/.test(lines[0])) {
    title = lines[0].replace(/^#+\s+/, "").trim();
    startIndex = 1;
  }

  const cleanText = (str: string) => {
    return str
      .replace(/^[┌└┐┘├┤┬┴┼│|─\-+=#\s\u2500-\u257F]+|[┌└┐┘├┤┬┴┼│|─\-+=#\s\u2500-\u257F]+$/g, "")
      .replace(/^[\+│|─\-]+\s*/, "")
      .replace(/\s*[\+│|─\-]+$/, "")
      .trim();
  };

  const isBoxBorder = (str: string) => {
    const withoutASCII = str.replace(/[┌└┐┘├┤┬┴┼─\-+=#\u2500-\u257F\s\+]/g, "");
    return str.length >= 3 && withoutASCII.length === 0;
  };

  const steps: DiagramStep[] = [];
  let currentBoxText: string[] = [];
  let inBox = false;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    if (isBoxBorder(line)) {
      if (inBox && currentBoxText.length > 0) {
        // Box closed
        const textJoined = currentBoxText.join(" ");
        let cleanT = textJoined;
        const numMatch = cleanT.match(/^(\d+)\.\s*(.*)/);
        let stepNum = steps.length + 1;
        if (numMatch) {
          stepNum = parseInt(numMatch[1], 10);
          cleanT = numMatch[2];
        }
        steps.push({
          stepNumber: stepNum,
          text: cleanT,
          connectorText: "",
        });
        currentBoxText = [];
        inBox = false;
      } else {
        // Box opened
        inBox = true;
      }
      continue;
    }

    if (inBox) {
      const cleaned = cleanText(line);
      if (cleaned) currentBoxText.push(cleaned);
    } else {
      // Outside box: check if connector text like (Purificação e Aceitação)
      const match = line.match(/\((.*?)\)/);
      if (match && match[1] && steps.length > 0) {
        steps[steps.length - 1].connectorText = match[1].trim();
      }
    }
  }

  if (currentBoxText.length > 0) {
    const textJoined = currentBoxText.join(" ");
    let cleanT = textJoined;
    const numMatch = cleanT.match(/^(\d+)\.\s*(.*)/);
    let stepNum = steps.length + 1;
    if (numMatch) {
      stepNum = parseInt(numMatch[1], 10);
      cleanT = numMatch[2];
    }
    steps.push({
      stepNumber: stepNum,
      text: cleanT,
      connectorText: "",
    });
  }

  const isDiagram = steps.length > 0;
  return { isDiagram, title, steps };
}

interface EbdDiagramBlockProps {
  codeText: string;
  parseInline: (text: string) => React.ReactNode;
}

export const EbdDiagramBlock: React.FC<EbdDiagramBlockProps> = ({
  codeText,
  parseInline,
}) => {
  const [viewMode, setViewMode] = useState<"visual" | "text">("visual");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const parsed = parseAsciiDiagram(codeText);

  // If parsing as steps failed, or user chooses text mode:
  const renderVisualContent = () => {
    if (!parsed.isDiagram || parsed.steps.length === 0) {
      // Fallback clean pre box with wrapped text for non-step diagrams
      return (
        <div className="p-4 md:p-6 bg-[#FDFBF7] dark:bg-[#141414] rounded-xl border border-[#C5A059]/30 text-left overflow-x-auto">
          <pre className="font-mono text-xs md:text-sm leading-relaxed text-[#8B0000] dark:text-[#C5A059] whitespace-pre-wrap break-words">
            {codeText}
          </pre>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 w-full my-2">
        {parsed.steps.map((step, idx) => (
          <React.Fragment key={idx}>
            {/* Step Card */}
            <div className="group relative bg-gradient-to-r from-[#FDFBF7] via-white to-[#FDFBF7] dark:from-[#18181b] dark:via-[#1e1e24] dark:to-[#18181b] p-4 md:p-6 rounded-2xl border-2 border-[#C5A059]/40 dark:border-[#C5A059]/30 shadow-md hover:shadow-lg transition-all flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full">
              {/* Step Badge */}
              <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-[#C5A059] to-[#8B0000] text-white font-cinzel font-bold text-xs md:text-sm flex items-center justify-center shadow-md ring-2 ring-[#C5A059]/20">
                {String(step.stepNumber).padStart(2, "0")}
              </div>

              {/* Step Text Content */}
              <div className="flex-1 text-left font-serif text-sm md:text-base leading-relaxed text-gray-900 dark:text-gray-100 font-medium">
                {parseInline(step.text)}
              </div>
            </div>

            {/* Connector Arrow & Pill Badge between steps */}
            {idx < parsed.steps.length - 1 && (
              <div className="flex flex-col items-center justify-center my-1 relative py-1">
                {/* Vertical Line */}
                <div className="w-0.5 h-6 bg-gradient-to-b from-[#C5A059] to-[#8B0000]/60 dark:from-[#C5A059]/80 dark:to-[#C5A059]/20" />

                {/* Optional Connector Pill */}
                {step.connectorText ? (
                  <div className="my-1 px-3 py-1 rounded-full bg-[#8B0000] dark:bg-[#C5A059] text-white dark:text-gray-950 font-cinzel text-[11px] md:text-xs font-bold tracking-wide shadow-md uppercase border border-amber-200/30 dark:border-amber-900/30 animate-in fade-in duration-300 max-w-[90%] text-center break-words">
                    {parseInline(step.connectorText)}
                  </div>
                ) : (
                  <div className="p-1 rounded-full bg-[#C5A059]/20 text-[#C5A059] my-0.5">
                    <ChevronDown className="w-4 h-4 text-[#C5A059] animate-bounce" />
                  </div>
                )}

                {/* Vertical Bottom Segment */}
                {step.connectorText && (
                  <div className="w-0.5 h-4 bg-gradient-to-b from-[#8B0000]/60 to-[#C5A059] dark:from-[#C5A059]/60 dark:to-[#C5A059]" />
                )}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="w-full my-6 rounded-2xl border-2 border-[#C5A059]/40 dark:border-[#C5A059]/30 bg-[#FDFBF7]/90 dark:bg-[#121214] shadow-xl overflow-hidden transition-all">
        {/* Top Header Controls Bar */}
        <div className="px-4 py-3 bg-gradient-to-r from-[#2A1810] via-[#3D2314] to-[#2A1810] border-b border-[#C5A059]/30 flex items-center justify-between text-white">
          <div className="flex items-center gap-2 min-w-0">
            <Workflow className="w-4 h-4 text-[#C5A059] flex-shrink-0" />
            <h4 className="font-cinzel text-xs md:text-sm font-bold tracking-wide text-[#FDFBF7] truncate">
              {parsed.title || "Esquema / Fluxograma Teológico"}
            </h4>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Toggle Mode Button */}
            {parsed.isDiagram && (
              <button
                onClick={() => setViewMode(viewMode === "visual" ? "text" : "visual")}
                className="px-2.5 py-1 rounded-lg text-[11px] font-sans font-medium bg-white/10 hover:bg-white/20 text-amber-200 border border-amber-500/30 flex items-center gap-1.5 transition-all"
                title={viewMode === "visual" ? "Ver Texto Original" : "Ver Infográfico"}
              >
                {viewMode === "visual" ? (
                  <>
                    <Terminal className="w-3.5 h-3.5 text-[#C5A059]" />
                    <span className="hidden sm:inline">Texto ASCII</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span className="hidden sm:inline">Infográfico</span>
                  </>
                )}
              </button>
            )}

            {/* Fullscreen Button */}
            <button
              onClick={() => setIsFullscreen(true)}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-amber-200 border border-amber-500/30 transition-all"
              title="Ver em Tela Cheia"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-3 md:p-6">
          {viewMode === "visual" ? (
            renderVisualContent()
          ) : (
            <div className="p-4 bg-[#141414] rounded-xl border border-gray-800 text-left overflow-x-auto">
              <pre className="font-mono text-xs md:text-sm leading-relaxed text-[#C5A059] whitespace-pre">
                <code>{codeText}</code>
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Modal View */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-start p-4 md:p-8 overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-[#FDFBF7] dark:bg-[#121214] rounded-3xl border-2 border-[#C5A059] shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-[#2A1810] via-[#3D2314] to-[#2A1810] border-b border-[#C5A059]/40 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#C5A059]" />
                <h3 className="font-cinzel text-sm md:text-base font-bold text-[#FDFBF7]">
                  {parsed.title || "Visualização Ampliada do Esquema"}
                </h3>
              </div>

              <button
                onClick={() => setIsFullscreen(false)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 md:p-10 max-h-[80vh] overflow-y-auto">
              {renderVisualContent()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
