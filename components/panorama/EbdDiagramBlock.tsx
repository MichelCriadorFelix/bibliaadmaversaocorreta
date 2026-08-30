import React, { useState } from "react";
import {
  Workflow,
  Maximize2,
  X,
  Terminal,
  Sparkles,
  ChevronDown,
  ArrowRight,
  GitFork,
  CheckCircle2,
} from "lucide-react";

export interface DiagramNode {
  id: string;
  title: string;
  subtext?: string;
  resultText?: string;
  facts?: { label: string; value: string }[];
}

export interface DiagramLevel {
  levelIndex: number;
  connectorText?: string;
  nodes: DiagramNode[];
}

export interface ParsedDiagram {
  isDiagram: boolean;
  title: string;
  levels: DiagramLevel[];
  rawText: string;
}

export function parseAsciiDiagram(rawText: string): ParsedDiagram {
  const cleanCodeText = rawText.replace(/^```[a-zA-Z]*\n?|\n?```$/g, "").trim();
  const rawLines = cleanCodeText.split("\n");

  if (rawLines.length === 0) {
    return { isDiagram: false, title: "", levels: [], rawText };
  }

  // Filter out lines that are purely ASCII box top/bottom borders (e.g. +-----+ or +==============+)
  const isBorderLine = (str: string) => {
    const s = str.trim();
    return (
      /^[\+\|\-\=\_\s\u2500-\u257F]+$/.test(s) &&
      !s.includes("[") &&
      !s.includes("]") &&
      !s.includes("(") &&
      !s.includes(")")
    );
  };

  let title = "";
  let startIndex = 0;

  // NOTA: uma linha "[ Texto ]" sozinha no início NÃO é tratada como título do esquema —
  // era assim antes, mas isso é ambíguo (o formato padrão dos exemplos do prompt sempre começa
  // com o PRIMEIRO NÓ real nesse mesmo formato) e engolia silenciosamente o primeiro item de
  // qualquer fluxo/lista que começasse direto com um nó, sem nenhum aviso. Título real só vem
  // de sinais inequívocos: um cabeçalho "# ..." ou o prefixo "ESQUEMA:".
  const firstTrimmed = rawLines[0].trim();
  if (/^#+\s+/.test(firstTrimmed)) {
    title = firstTrimmed.replace(/^#+\s+/, "").trim();
    startIndex = 1;
  } else if (firstTrimmed.toUpperCase().startsWith("ESQUEMA")) {
    title = firstTrimmed.replace(/^ESQUEMA[:\s]*/i, "").trim();
    startIndex = 1;
  }

  const levels: DiagramLevel[] = [];
  let pendingConnectorText = "";

  for (let i = startIndex; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    // Check if line contains bracketed nodes like [ Node Title ]
    const bracketMatches = Array.from(line.matchAll(/\[([^\]]+)\]/g));

    if (bracketMatches.length > 0) {
      // It's a level line with nodes!
      const levelNodes: DiagramNode[] = [];

      for (let mIdx = 0; mIdx < bracketMatches.length; mIdx++) {
        const match = bracketMatches[mIdx];
        const rawNodeTitle = match[1].trim();

        // Check if there is an inline result arrow after this node on the same line (e.g., ---> Result)
        let resultText = "";
        const afterBracketIndex = (match.index || 0) + match[0].length;
        const lineAfter = line.slice(afterBracketIndex);
        const arrowMatch = lineAfter.match(/(?:--->|---|->|===>|=>)\s*(.*)/);
        if (arrowMatch && arrowMatch[1]) {
          resultText = arrowMatch[1].trim();
        }

        levelNodes.push({
          id: `node-${levels.length + 1}-${mIdx + 1}`,
          title: rawNodeTitle,
          resultText: resultText || undefined,
        });
      }

      // Single-node level: linhas seguintes no formato "Rótulo: valor" viram fatos estruturados
      // do card (ex: tabelas de comparação/hierarquia), em vez de serem espremidas num só subtexto.
      let consumedFacts = false;
      if (levelNodes.length === 1) {
        const facts: { label: string; value: string }[] = [];
        let j = i + 1;
        while (j < rawLines.length) {
          const factLine = rawLines[j].trim();
          if (!factLine || factLine.startsWith("[") || isBorderLine(factLine)) break;
          const factMatch = factLine.match(/^([^:{}\[\]]{2,40}):\s*(.+)$/);
          if (!factMatch) break;
          facts.push({ label: factMatch[1].trim(), value: factMatch[2].trim() });
          j++;
        }
        if (facts.length > 0) {
          levelNodes[0].facts = facts;
          i = j - 1; // pula as linhas de fato já consumidas
          consumedFacts = true;
        }
      }

      // Check the NEXT line for parenthetical subtexts (e.g., (Santo vs. Profano) (Limpo vs. Impuro))
      if (!consumedFacts && i + 1 < rawLines.length) {
        const nextLine = rawLines[i + 1].trim();
        if (
          nextLine.startsWith("(") &&
          !nextLine.includes("[") &&
          !isBorderLine(nextLine)
        ) {
          const parenMatches = Array.from(nextLine.matchAll(/\(([^)]+)\)/g));
          if (parenMatches.length > 0) {
            parenMatches.forEach((pMatch, pIdx) => {
              if (levelNodes[pIdx]) {
                levelNodes[pIdx].subtext = pMatch[1].trim();
              } else if (levelNodes.length > 0) {
                // If there are more subtexts than nodes, append to the last node
                const lastNode = levelNodes[levelNodes.length - 1];
                lastNode.subtext = lastNode.subtext
                  ? `${lastNode.subtext} | ${pMatch[1].trim()}`
                  : pMatch[1].trim();
              }
            });
            i++; // Skip the next line as we consumed it as subtext
          }
        }
      }

      levels.push({
        levelIndex: levels.length + 1,
        connectorText: pendingConnectorText || undefined,
        nodes: levelNodes,
      });

      pendingConnectorText = "";
    } else {
      // It's a connector line, arrow line, or subtext line
      if (isBorderLine(line)) continue;

      // Extract text inside parentheses on connector lines, e.g. ▼ (Removidos por Misael e Elzafã) or (Lv 9:22)
      const connParenMatch = line.match(/\((.*?)\)/);
      if (connParenMatch && connParenMatch[1]) {
        pendingConnectorText = connParenMatch[1].trim();
      } else {
        const cleanConn = line
          .replace(/^[│||\-+=#\s\u2500-\u257F▼v\>\<]+|[│||\-+=#\s\u2500-\u257F▼v\>\<]+$/g, "")
          .trim();
        if (cleanConn && cleanConn.length > 2 && !cleanConn.startsWith("(")) {
          pendingConnectorText = cleanConn;
        }
      }
    }
  }

  // Fallback: If no bracketed nodes found, parse bullet points or plain lines as sequential steps
  if (levels.length === 0) {
    const fallbackLines = rawLines
      .filter((l) => !isBorderLine(l.trim()) && l.trim().length > 0)
      .map((l) => l.trim().replace(/^[\-*\u2022•\d+\.\s]+/, "").trim())
      .filter(Boolean);

    if (fallbackLines.length > 0) {
      fallbackLines.forEach((fText, idx) => {
        levels.push({
          levelIndex: idx + 1,
          nodes: [{ id: `fb-${idx + 1}`, title: fText }],
        });
      });
    }
  }

  // Strict check for real diagrams: Must have at least 2 levels OR multiple nodes/connectors/results
  const isDiagram =
    levels.length >= 2 ||
    (levels.length === 1 &&
      (levels[0].nodes.length >= 2 ||
        !!levels[0].connectorText ||
        !!levels[0].nodes[0]?.resultText ||
        !!levels[0].nodes[0]?.subtext ||
        !!levels[0].nodes[0]?.facts?.length));

  return { isDiagram, title, levels, rawText };
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

  // If it's not a real diagram, render cleanly as standard paragraph text
  if (!parsed.isDiagram) {
    return (
      <div className="my-2 text-gray-800 dark:text-gray-300 text-lg md:text-xl leading-relaxed text-justify outline-none">
        {parseInline(codeText)}
      </div>
    );
  }

  const renderVisualContent = () => {
    if (!parsed.isDiagram || parsed.levels.length === 0) {
      return (
        <div className="p-4 md:p-6 bg-[#FDFBF7] dark:bg-[#141414] rounded-xl border border-[#C5A059]/30 text-left overflow-x-auto">
          <pre className="font-mono text-xs md:text-sm leading-relaxed text-[#8B0000] dark:text-[#C5A059] whitespace-pre-wrap break-words">
            {codeText}
          </pre>
        </div>
      );
    }

    // Uma "lista de níveis" onde cada nível tem exatamente 1 nó (sem ramificação) é o formato
    // típico de hierarquias/tabelas comparativas (ex: categorias de sacrifício por responsabilidade).
    // Nesse caso, o badge de cada card usa um degradê vermelho -> dourado (as 2 cores da marca)
    // para comunicar visualmente a ordem/gravidade decrescente, em vez da cor fixa padrão.
    const isTierList =
      parsed.levels.length >= 2 && parsed.levels.every((lv) => lv.nodes.length === 1);

    const lerpColor = (from: string, to: string, t: number) => {
      const a = parseInt(from.slice(1), 16);
      const b = parseInt(to.slice(1), 16);
      const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
      const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
      const r = Math.round(ar + (br - ar) * t);
      const g = Math.round(ag + (bg - ag) * t);
      const bl = Math.round(ab + (bb - ab) * t);
      return `rgb(${r}, ${g}, ${bl})`;
    };
    const tierColor = (idx: number) =>
      lerpColor("#8B0000", "#C5A059", parsed.levels.length > 1 ? idx / (parsed.levels.length - 1) : 0);

    return (
      <div className="flex flex-col items-center gap-4 w-full my-3 select-text">
        {parsed.levels.map((level, lIdx) => {
          const isBranching = level.nodes.length >= 2;

          return (
            <React.Fragment key={`level-${lIdx}`}>
              {/* Connector from previous level */}
              {lIdx > 0 && (
                <div className="flex flex-col items-center justify-center my-1 relative py-1 w-full max-w-md">
                  {/* Vertical Glowing Line */}
                  <div className="w-0.5 h-6 bg-gradient-to-b from-[#C5A059] to-[#8B0000] dark:from-[#C5A059] dark:to-[#EEDC9A]" />

                  {/* Connector Badge */}
                  {level.connectorText ? (
                    <div className="my-1.5 px-4 py-1.5 rounded-full bg-[#8B0000] dark:bg-[#C5A059] text-white dark:text-gray-950 font-cinzel text-xs md:text-sm font-bold tracking-wide shadow-lg uppercase border border-amber-200/40 dark:border-amber-900/40 animate-in fade-in duration-300 max-w-[95%] text-center break-words">
                      {parseInline(level.connectorText)}
                    </div>
                  ) : (
                    <div className="p-1 rounded-full bg-[#C5A059]/20 text-[#C5A059] my-0.5">
                      <ChevronDown className="w-4 h-4 text-[#C5A059] animate-bounce" />
                    </div>
                  )}

                  <div className="w-0.5 h-4 bg-gradient-to-b from-[#8B0000] to-[#C5A059] dark:from-[#C5A059] dark:to-[#C5A059]/60" />
                </div>
              )}

              {/* Branching Header Indicator */}
              {isBranching && (
                <div className="flex items-center justify-center gap-2 my-1 w-full">
                  <div className="h-[1px] flex-1 max-w-[60px] bg-gradient-to-r from-transparent to-[#C5A059]/50" />
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C5A059]/15 border border-[#C5A059]/30 text-[#C5A059] text-[11px] font-cinzel font-bold tracking-widest uppercase">
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Ramificação / Subdivisões ({level.nodes.length} Ramos)</span>
                  </div>
                  <div className="h-[1px] flex-1 max-w-[60px] bg-gradient-to-l from-transparent to-[#C5A059]/50" />
                </div>
              )}

              {/* Level Nodes Container */}
              <div
                className={`w-full ${
                  isBranching
                    ? `grid grid-cols-1 sm:grid-cols-${Math.min(
                        level.nodes.length,
                        3
                      )} gap-4 sm:gap-6`
                    : "flex flex-col items-center"
                }`}
              >
                {level.nodes.map((node, nIdx) => (
                  <div
                    key={node.id}
                    className={`group relative bg-gradient-to-br from-[#FFFDF9] via-white to-[#FDF9F0] dark:from-[#1a1a1e] dark:via-[#161619] dark:to-[#121214] p-4 md:p-6 rounded-2xl border-2 border-[#C5A059]/50 dark:border-[#C5A059]/40 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between w-full ${
                      !isBranching ? "max-w-2xl" : ""
                    }`}
                  >
                    {/* Top Row: Badge + Node Title */}
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-xl text-white font-cinzel font-black text-xs md:text-sm flex items-center justify-center shadow-md border border-amber-200/40 ${
                          isTierList && !isBranching ? "" : "bg-gradient-to-br from-[#C5A059] to-[#8B0000]"
                        }`}
                        style={isTierList && !isBranching ? { background: tierColor(lIdx) } : undefined}
                      >
                        {isBranching
                          ? `${String(level.levelIndex).padStart(
                              2,
                              "0"
                            )}.${String.fromCharCode(65 + nIdx)}`
                          : String(level.levelIndex).padStart(2, "0")}
                      </div>

                      <div className="flex-1 text-left">
                        <h4 className="font-cinzel font-bold text-base md:text-lg leading-snug text-[#8B0000] dark:text-[#EEDC9A] tracking-wide">
                          {parseInline(node.title)}
                        </h4>

                        {/* Subtext description if present */}
                        {node.subtext && (
                          <div className="mt-2 text-xs md:text-sm text-gray-800 dark:text-gray-200 font-serif italic bg-[#C5A059]/10 dark:bg-[#C5A059]/15 p-2.5 rounded-xl border-l-4 border-[#C5A059] leading-relaxed">
                            {parseInline(node.subtext)}
                          </div>
                        )}

                        {/* Fatos estruturados (ex: tabela de comparação) — rótulo + valor, um por linha */}
                        {node.facts && node.facts.length > 0 && (
                          <div className="mt-2.5 flex flex-col gap-1.5">
                            {node.facts.map((fact, fIdx) => (
                              <div key={fIdx} className="flex items-baseline gap-2">
                                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#C5A059] mt-1.5" />
                                <span className="text-[10px] md:text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 flex-shrink-0">
                                  {parseInline(fact.label)}:
                                </span>
                                <span className="text-xs md:text-sm text-gray-800 dark:text-gray-200 leading-snug">
                                  {parseInline(fact.value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Result / Arrow Consequence if present */}
                    {node.resultText && (
                      <div className="mt-3.5 pt-3 border-t border-[#C5A059]/20 flex items-center gap-2 text-xs md:text-sm text-emerald-800 dark:text-emerald-300 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 rounded-xl border border-emerald-500/30">
                        <ArrowRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <span className="leading-snug">
                          <strong className="font-cinzel font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider text-[11px] block sm:inline mr-1">
                            Resultado / Implicação:
                          </strong>
                          {parseInline(node.resultText)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="w-full my-6 rounded-2xl border-2 border-[#C5A059]/40 dark:border-[#C5A059]/30 bg-[#FDFBF7]/95 dark:bg-[#121214] shadow-xl overflow-hidden transition-all">
        {/* Top Header Controls Bar */}
        <div className="px-4 py-3 bg-gradient-to-r from-[#2A1810] via-[#3D2314] to-[#2A1810] border-b border-[#C5A059]/30 flex items-center justify-between text-white">
          <div className="flex items-center gap-2 min-w-0">
            <Workflow className="w-4.5 h-4.5 text-[#C5A059] flex-shrink-0 animate-pulse" />
            <h4 className="font-cinzel text-xs md:text-sm font-bold tracking-wide text-[#FDFBF7] truncate">
              {parsed.title || "ESQUEMA & FLUXOGRAMA TEOLÓGICO"}
            </h4>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Toggle Mode Button */}
            {parsed.isDiagram && (
              <button
                onClick={() =>
                  setViewMode(viewMode === "visual" ? "text" : "visual")
                }
                className="px-2.5 py-1 rounded-lg text-[11px] font-sans font-medium bg-white/10 hover:bg-white/20 text-amber-200 border border-amber-500/30 flex items-center gap-1.5 transition-all"
                title={
                  viewMode === "visual"
                    ? "Ver Texto Original ASCII"
                    : "Ver Infográfico Visual"
                }
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
