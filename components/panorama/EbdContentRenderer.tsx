import React, { useEffect, useState } from "react";
import { Sparkles, Plus, Edit, PenLine } from "lucide-react";
import { db } from "../../services/database";
import { AnnotationModal } from "./AnnotationModal";

interface EbdContentRendererProps {
  pages: string[];
  currentPage: number;
  fontSize: number;
  isPlaying: boolean;
  currentGlobalIndex: number;
  globalSentences: any[];
  parseInline: (t: string) => React.ReactNode;
  isAdmin: boolean;
  studyKey: string;
}

export const EbdContentRenderer: React.FC<EbdContentRendererProps> = ({
  pages,
  currentPage,
  fontSize,
  isPlaying,
  currentGlobalIndex,
  globalSentences,
  parseInline,
  isAdmin,
  studyKey,
}) => {
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeParagraph, setActiveParagraph] = useState<number | null>(null);

  // HIGHLIGHTS MANAGEMENT
  const [highlights, setHighlights] = useState<any[]>([]);
  const [showHighlightButton, setShowHighlightButton] = useState(false);
  const [buttonPosition, setButtonPosition] = useState({ top: 0, left: 0 });
  const [selectedHighlightInfo, setSelectedHighlightInfo] = useState<{
    paragraph_index: number;
    start_offset: number;
    end_offset: number;
    text: string;
  } | null>(null);

  useEffect(() => {
    const loadAnnotations = async () => {
      try {
        const filtered = await db.entities.Commentary.filter({
          study_key: studyKey,
          type: "annotation",
        });
        setAnnotations(filtered);
      } catch (error) {
        console.error("Error loading annotations:", error);
      }
    };
    const loadHighlights = async () => {
      if (!isAdmin) return;
      try {
        const filtered = await db.entities.Highlights.filter({
          study_key: studyKey,
        });
        setHighlights(filtered || []);
      } catch (error) {
        console.error("Error loading highlights:", error);
      }
    };
    loadAnnotations();
    loadHighlights();
  }, [studyKey, isAdmin]);

  const handleCreateHighlight = async () => {
    if (!selectedHighlightInfo || !isAdmin) return;
    const highlightId = `highlight_${studyKey}_${Date.now()}`;
    const userEmail = "michel.felix@adma.local";

    try {
      await db.entities.Highlights.save({
        id: highlightId,
        study_key: studyKey,
        paragraph_index: selectedHighlightInfo.paragraph_index,
        start_offset: selectedHighlightInfo.start_offset,
        end_offset: selectedHighlightInfo.end_offset,
        text: selectedHighlightInfo.text,
        user_email: userEmail,
        created_at: new Date().toISOString(),
      });

      // Refresh local state immediately
      const filtered = await db.entities.Highlights.filter({
        study_key: studyKey,
      });
      setHighlights(filtered || []);

      // Clear selection browser-side
      window.getSelection()?.removeAllRanges();
      setShowHighlightButton(false);
      setSelectedHighlightInfo(null);
    } catch (error) {
      console.error("Error saving highlight:", error);
    }
  };

  const handleRemoveHighlight = async (id: string) => {
    if (!isAdmin) return;
    if (window.confirm("Deseja remover este destaque em amarelo?")) {
      try {
        await db.entities.Highlights.delete(id);
        // Refresh local state immediately
        const filtered = await db.entities.Highlights.filter({
          study_key: studyKey,
        });
        setHighlights(filtered || []);
      } catch (error) {
        console.error("Error deleting highlight:", error);
      }
    }
  };

  const handleSaveAnnotation = async (content: string) => {
    if (activeParagraph === null) return;
    const userEmail = "michel.felix@adma.local";
    const annotationId = `annotation_${studyKey}_${activeParagraph}`;

    try {
      await db.entities.Commentary.save({
        id: annotationId,
        study_key: studyKey,
        paragraph_index: Number(activeParagraph),
        content,
        type: "annotation",
        user_email: userEmail,
        updated_at: new Date().toISOString(),
      });

      // Refresh local state immediately
      const filtered = await db.entities.Commentary.filter({
        study_key: studyKey,
        type: "annotation",
      });
      setAnnotations(filtered);
      setModalOpen(false);
    } catch (error) {
      console.error("Error saving annotation:", error);
    }
  };

  const getParagraphIndex = (node: Node | null): number | null => {
    let current: HTMLElement | null =
      node instanceof HTMLElement ? node : node?.parentElement || null;
    while (current) {
      if (current.id && current.id.startsWith("read-block-")) {
        const match = current.id.match(/^read-block-(\d+)$/);
        if (match) return parseInt(match[1], 10);
      }
      current = current.parentElement;
    }
    return null;
  };

  const getSelectionOffsets = (parent: HTMLElement, range: Range) => {
    let startOffset = 0;
    let endOffset = 0;

    const nodeIterator = document.createNodeIterator(
      parent,
      NodeFilter.SHOW_TEXT,
      null,
    );

    let currentNode = nodeIterator.nextNode();
    let currentLength = 0;

    while (currentNode) {
      if (currentNode === range.startContainer) {
        startOffset = currentLength + range.startOffset;
      }
      if (currentNode === range.endContainer) {
        endOffset = currentLength + range.endOffset;
        break;
      }
      currentLength += currentNode.textContent?.length || 0;
      currentNode = nodeIterator.nextNode();
    }

    return { startOffset, endOffset };
  };

  const handleMouseUpOrTouchEnd = () => {
    if (!isAdmin) return;
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setShowHighlightButton(false);
        return;
      }
      const text = selection.toString().trim();
      if (text.length > 0) {
        try {
          const range = selection.getRangeAt(0);
          const startParagraphIdx = getParagraphIndex(range.startContainer);
          const endParagraphIdx = getParagraphIndex(range.endContainer);

          if (
            startParagraphIdx !== null &&
            startParagraphIdx === endParagraphIdx
          ) {
            const parent = document.getElementById(
              `read-block-${startParagraphIdx}`,
            );
            if (parent) {
              const { startOffset, endOffset } = getSelectionOffsets(
                parent,
                range,
              );
              const rect = range.getBoundingClientRect();
              setButtonPosition({
                top: rect.top + window.scrollY - 45,
                left: rect.left + window.scrollX + rect.width / 2 - 40,
              });

              setSelectedHighlightInfo({
                paragraph_index: startParagraphIdx,
                start_offset: startOffset,
                end_offset: endOffset,
                text,
              });
              setShowHighlightButton(true);
            } else {
              setShowHighlightButton(false);
            }
          } else {
            setShowHighlightButton(false);
          }
        } catch (e) {
          setShowHighlightButton(false);
        }
      } else {
        setShowHighlightButton(false);
      }
    }, 100);
  };

  const applyHighlightsToReactNode = (
    node: React.ReactNode,
    activeHighlights: any[],
    onRemoveHighlight: (id: string) => void,
    offsetRef: { current: number },
  ): React.ReactNode => {
    if (!node) return node;

    if (typeof node === "string") {
      const text = node;
      const startOfNode = offsetRef.current;
      const endOfNode = startOfNode + text.length;
      offsetRef.current = endOfNode;

      const activeInNode: { h: any; relStart: number; relEnd: number }[] = [];
      for (const h of activeHighlights) {
        const overlapStart = Math.max(startOfNode, h.start_offset);
        const overlapEnd = Math.min(endOfNode, h.end_offset);
        if (overlapStart < overlapEnd) {
          activeInNode.push({
            h,
            relStart: overlapStart - startOfNode,
            relEnd: overlapEnd - startOfNode,
          });
        }
      }

      if (activeInNode.length === 0) {
        return text;
      }

      activeInNode.sort((a, b) => a.relStart - b.relStart);

      const segments: React.ReactNode[] = [];
      let lastIndex = 0;

      for (const { h, relStart, relEnd } of activeInNode) {
        if (relStart > lastIndex) {
          segments.push(text.substring(lastIndex, relStart));
        }
        const highlightedText = text.substring(relStart, relEnd);
        segments.push(
          <mark
            key={`hl-${h.id}-${startOfNode + relStart}`}
            className="bg-yellow-300 dark:bg-yellow-600/70 text-[#1a1a1a] dark:text-white px-0.5 rounded cursor-pointer font-semibold transition-all hover:bg-yellow-400 active:scale-95 select-all"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveHighlight(h.id);
            }}
            title="Remover Destaque (Admin)"
          >
            {highlightedText}
          </mark>,
        );
        lastIndex = relEnd;
      }

      if (lastIndex < text.length) {
        segments.push(text.substring(lastIndex));
      }

      return <>{segments}</>;
    }

    if (React.isValidElement(node)) {
      const element = node as React.ReactElement<any>;
      if (element.props && "children" in element.props) {
        const children = element.props.children;
        let updatedChildren;
        if (Array.isArray(children)) {
          updatedChildren = React.Children.map(children, (child) =>
            applyHighlightsToReactNode(
              child,
              activeHighlights,
              onRemoveHighlight,
              offsetRef,
            ),
          );
        } else {
          updatedChildren = applyHighlightsToReactNode(
            children,
            activeHighlights,
            onRemoveHighlight,
            offsetRef,
          );
        }
        return React.cloneElement(
          element,
          { ...element.props },
          updatedChildren,
        );
      }
    }

    if (Array.isArray(node)) {
      return node.map((child, idx) => (
        <React.Fragment key={idx}>
          {applyHighlightsToReactNode(
            child,
            activeHighlights,
            onRemoveHighlight,
            offsetRef,
          )}
        </React.Fragment>
      ));
    }

    return node;
  };

  const renderLineWithHighlights = (
    idx: number,
    parsedNode: React.ReactNode,
  ) => {
    const lineHighlights = highlights.filter((h) => h.paragraph_index === idx);
    if (lineHighlights.length === 0) return parsedNode;

    const offsetRef = { current: 0 };
    return applyHighlightsToReactNode(
      parsedNode,
      lineHighlights,
      handleRemoveHighlight,
      offsetRef,
    );
  };

  // Identifica o bloco ativo para highlight
  const activeBlockIndex =
    isPlaying && globalSentences[currentGlobalIndex]?.pageIndex === currentPage
      ? globalSentences[currentGlobalIndex]?.blockIndex
      : -1;

  useEffect(() => {
    if (activeBlockIndex !== -1) {
      const el = document.getElementById(`read-block-${activeBlockIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeBlockIndex]);

  if (pages.length === 0) return null;

  const text = pages[currentPage];
  if (!text) return null;

  const rawLines = text.split("\n");
  const groupedBlocks: {
    type: "line" | "code" | "table";
    text: string;
    originalIndex: number;
  }[] = [];

  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeStartIndex = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const tr = line.trim();

    if (tr.startsWith("```")) {
      if (inCodeBlock) {
        codeContent.push(line);
        groupedBlocks.push({
          type: "code",
          text: codeContent.join("\n"),
          originalIndex: codeStartIndex,
        });
        codeContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeStartIndex = i;
        codeContent.push(line);
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
    } else {
      if (tr.length > 0) {
        // Determine if this line looks like part of an ASCII table or a markdown table
        const isTableLine =
          tr.startsWith("+---") ||
          (tr.startsWith("|") && tr.indexOf("|", 1) !== -1);

        if (isTableLine) {
          // Peek ahead to see if there are consecutive table lines
          let j = i;
          const tableLines = [];
          while (j < rawLines.length) {
            const nextLine = rawLines[j];
            const trNext = nextLine.trim();
            if (trNext.length === 0) {
              // Empty line breaks the table
              break;
            }
            const nextIsTableLine =
              trNext.startsWith("+---") ||
              (trNext.startsWith("|") && trNext.indexOf("|", 1) !== -1) ||
              /^[=\-+_]+$/.test(trNext);
            if (!nextIsTableLine && !trNext.startsWith("|")) {
              break; // Not a table row
            }
            tableLines.push(nextLine);
            j++;
          }

          if (tableLines.length > 1) {
            // It's a block of table lines
            groupedBlocks.push({
              type: "table",
              text: tableLines.join("\n"),
              originalIndex: i,
            });
            i = j - 1; // Skip the lines we just consumed
          } else {
            groupedBlocks.push({ type: "line", text: line, originalIndex: i });
          }
        } else {
          groupedBlocks.push({ type: "line", text: line, originalIndex: i });
        }
      }
    }
  }

  if (inCodeBlock && codeContent.length > 0) {
    groupedBlocks.push({
      type: "code",
      text: codeContent.join("\n"),
      originalIndex: codeStartIndex,
    });
  }

  return (
    <div
      className="space-y-8 md:space-y-12 animate-in fade-in duration-1000 relative select-text"
      onMouseUp={handleMouseUpOrTouchEnd}
      onTouchEnd={handleMouseUpOrTouchEnd}
    >
      <AnnotationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveAnnotation}
        initialContent={
          annotations.find((a) => Number(a.paragraph_index) === activeParagraph)
            ?.content || ""
        }
        key={`modal-${activeParagraph}-${annotations.length}`}
      />

      {/* Floating Highlighter Buttons for Admin */}
      {showHighlightButton && (
        <button
          style={{
            position: "absolute",
            top: `${buttonPosition.top}px`,
            left: `${buttonPosition.left}px`,
            zIndex: 1000,
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleCreateHighlight();
          }}
          className="flex items-center gap-2 bg-[#C5A059] hover:bg-[#8B0000] text-white px-4 py-2 rounded-full shadow-2xl text-xs font-bold font-cinzel tracking-wider animate-in fade-in zoom-in-95 duration-200 border border-white/20 hover:scale-105 active:scale-95 transition-all"
        >
          <PenLine className="w-4 h-4 text-white" />
          Destacar Texto
        </button>
      )}

      {groupedBlocks.map((block, groupIdx) => {
        const idx = block.originalIndex;
        const isBlockActive = idx === activeBlockIndex;
        const activeClass = isBlockActive
          ? "bg-yellow-100/50 dark:bg-yellow-900/20 rounded-xl px-2 -mx-2 transition-colors duration-300 shadow-[0_0_15px_rgba(197,160,89,0.1)]"
          : "transition-colors duration-300";

        const annotation = annotations.find((a) => a.paragraph_index === idx);

        const renderAnnotationButton = () => {
          if (!isAdmin) return null;
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveParagraph(idx);
                setModalOpen(true);
              }}
              className={`ml-2 p-1 rounded-full transition-all ${annotation ? "bg-[#C5A059] text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-500 hover:bg-[#8B0000] hover:text-white"}`}
              title={annotation ? "Editar Anotação" : "Adicionar Anotação"}
            >
              {annotation ? (
                <Edit className="w-3 h-3" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
            </button>
          );
        };

        if (block.type === "code") {
          // Extract code block content without backticks
          const codeClean = block.text.replace(/^```[a-zA-Z]*\n?|\n?```$/g, "");
          return (
            <div
              key={`code-${groupIdx}`}
              id={`read-block-${idx}`}
              className={`my-8 relative group ${activeClass}`}
            >
              {renderAnnotationButton()}
              <pre className="bg-[#1a1a1a] dark:bg-black text-[#e5e5e5] p-4 md:p-6 rounded-xl overflow-x-auto font-mono text-sm md:text-base leading-snug shadow-2xl border border-[#333] mt-2">
                <code className="block whitespace-pre">{codeClean}</code>
              </pre>
            </div>
          );
        }

        if (block.type === "table") {
          return (
            <div
              key={`table-${groupIdx}`}
              id={`read-block-${idx}`}
              className={`my-8 relative group ${activeClass}`}
            >
              {renderAnnotationButton()}
              <div className="bg-gray-50 dark:bg-black/50 p-4 md:p-6 rounded-xl overflow-x-auto font-mono text-sm md:text-base leading-snug shadow-inner border border-[#C5A059]/20 mt-2">
                <pre className="text-gray-800 dark:text-gray-200 block whitespace-pre">
                  {block.text}
                </pre>
              </div>
            </div>
          );
        }

        const line = block.text;
        const tr = line.trim();

        if (tr === "__CONTINUATION_MARKER__")
          return (
            <div
              key={idx}
              id={`read-block-${idx}`}
              className="my-12 border-b border-[#C5A059]/20"
            />
          );

        // HEADER DE DOSSIÊ ESPECIAL
        if (
          tr.toUpperCase().includes("DOSSIÊ ESPECIAL") &&
          (tr.startsWith("#") || tr.startsWith("##"))
        ) {
          const cleanTitle = tr.replace(/#/g, "").trim();
          return (
            <div
              key={idx}
              className={`my-16 text-center relative py-12 px-3 md:px-4 border-y-4 border-double border-[#8B0000] ${activeClass}`}
            >
              <div className="absolute inset-0 bg-[#8B0000]/5 -z-10"></div>
              <span className="block font-cinzel font-black text-[#C5A059] text-sm uppercase tracking-[0.5em] mb-4">
                Documento Histórico
              </span>
              <h1
                id={`read-block-${idx}`}
                className="font-cinzel font-black text-4xl md:text-6xl text-[#8B0000] dark:text-[#ff6b6b] uppercase tracking-widest leading-tight drop-shadow-xl outline-none"
              >
                {renderLineWithHighlights(idx, parseInline(cleanTitle))}
              </h1>
            </div>
          );
        }

        const isMainTitle =
          tr.startsWith("# ") ||
          tr.toUpperCase().startsWith("PANORÂMA BÍBLICO") ||
          tr.toUpperCase().startsWith("PANORAMA BÍBLICO");

        if (isMainTitle) {
          const cleanTitle = tr.replace(/#/g, "").trim();
          return (
            <div
              key={idx}
              className={`mb-14 text-center border-b-8 border-[#8B0000] pb-8 pt-4 bg-gradient-to-b from-transparent to-[#8B0000]/5 rounded-b-[3rem] ${activeClass}`}
            >
              <h1
                id={`read-block-${idx}`}
                className="font-cinzel font-black text-4xl md:text-6xl text-[#8B0000] dark:text-[#ff6b6b] uppercase tracking-widest leading-tight drop-shadow-xl outline-none"
              >
                {renderLineWithHighlights(idx, parseInline(cleanTitle))}
              </h1>
            </div>
          );
        }

        const isH3 = tr.startsWith("###");
        if (isH3) {
          const title = tr.replace(/###/g, "").trim();
          const isPremium =
            title.toUpperCase().includes("TIPOLOGIA") ||
            title.toUpperCase().includes("CURIOSIDADES") ||
            title.toUpperCase().includes("ARQUEOLOGIA");

          if (isPremium) {
            return (
              <div key={idx} className={`mt-10 mb-6 ${activeClass}`}>
                <div
                  id={`read-block-${idx}`}
                  className="w-full bg-gradient-to-br from-[#C5A059] to-[#9e8045] px-6 py-3 rounded-lg shadow-md outline-none"
                >
                  <h3 className="font-cinzel font-black text-base md:text-lg text-[#1a1a1a] uppercase tracking-[0.15em] leading-tight">
                    {renderLineWithHighlights(idx, parseInline(title))}
                  </h3>
                </div>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className={`mt-16 mb-8 text-center relative ${activeClass}`}
            >
              <div className="absolute top-1/2 left-0 w-full h-[1px] bg-[#C5A059]/30 -z-10"></div>
              <h3
                id={`read-block-${idx}`}
                className="inline-block bg-[#FDFBF7] dark:bg-dark-card px-4 md:px-6 font-cinzel font-bold text-xl md:text-2xl uppercase tracking-widest text-[#C5A059] leading-tight outline-none"
              >
                {renderLineWithHighlights(idx, parseInline(title))}
              </h3>
            </div>
          );
        }

        const isH2 = tr.startsWith("##");
        if (isH2) {
          const title = tr.replace(/##/g, "").trim();
          return (
            <h2
              key={idx}
              id={`read-block-${idx}`}
              className={`font-cinzel font-black text-3xl md:text-4xl text-[#8B0000] dark:text-[#ff6b6b] mt-16 mb-8 uppercase tracking-widest border-l-[6px] border-[#C5A059] pl-4 md:pl-6 leading-tight ${activeClass} outline-none`}
            >
              {renderLineWithHighlights(idx, parseInline(title))}
            </h2>
          );
        }

        if (tr.toUpperCase().includes("PÉROLA DE OURO")) {
          const parts = tr.split(
            /(\*\*PÉROLA DE OURO:\*\*|\*\*PÉROLA DE OURO\*\*|PÉROLA DE OURO:|PÉROLA DE OURO)/i,
          );
          return (
            <div key={idx} className={`mb-6 md:mb-8 ${activeClass}`}>
              {parts.map((p, i) => {
                if (!p) return null;
                if (p.toUpperCase().match(/PÉROLA DE OURO/)) {
                  return (
                    <div
                      key={i}
                      className="text-[#000000] bg-gradient-to-br from-[#C5A059] to-[#9e8045] px-4 py-3 md:px-6 md:py-4 rounded-xl border-l-[6px] border-[#8B0000] shadow-lg font-black my-4 tracking-wider uppercase text-sm md:text-base select-none"
                    >
                      {p.replace(/\*\*/g, "").trim()}
                    </div>
                  );
                }
                return (
                  <div
                    key={i}
                    id={`read-block-${idx}`}
                    className="text-gray-800 dark:text-gray-300 text-lg md:text-xl leading-relaxed text-justify mt-2 outline-none"
                  >
                    {renderLineWithHighlights(idx, parseInline(p))}
                  </div>
                );
              })}
            </div>
          );
        }

        if (/^\d+\./.test(tr)) {
          const firstSpaceIndex = tr.indexOf(" ");
          const numPart = tr.substring(0, firstSpaceIndex).replace(".", "");
          const contentPart = tr.substring(firstSpaceIndex + 1).trim();

          return (
            <div
              key={idx}
              className={`mb-10 flex gap-4 md:gap-6 items-start animate-in slide-in-from-left-6 group ${activeClass}`}
            >
              <span className="font-cinzel font-black text-6xl text-[#C5A059] opacity-80 shrink-0 select-none drop-shadow-sm leading-none -mt-1 group-hover:text-[#8B0000] transition-colors duration-500">
                {numPart}
              </span>
              <div className="flex-1 pt-1">
                <div
                  id={`read-block-${idx}`}
                  className="font-cormorant text-xl md:text-2xl leading-relaxed text-gray-900 dark:text-gray-100 text-justify tracking-wide font-medium outline-none"
                  style={{ fontSize: `${fontSize}px`, lineHeight: "1.8" }}
                >
                  {renderLineWithHighlights(idx, parseInline(contentPart))}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={idx}
            id={`read-block-${idx}`}
            className={`font-cormorant text-xl md:text-2xl leading-loose text-gray-950 dark:text-gray-50 text-justify indent-6 md:indent-12 mb-8 tracking-wide font-medium ${activeClass} outline-none`}
            style={{ fontSize: `${fontSize}px`, lineHeight: "1.8" }}
          >
            {renderAnnotationButton()}
            {renderLineWithHighlights(idx, parseInline(tr))}
          </div>
        );
      })}
    </div>
  );
};
