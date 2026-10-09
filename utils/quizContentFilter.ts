/**
 * Filtra o conteúdo da aula para geração de Quiz, mantendo EXCLUSIVAMENTE
 * o conteúdo expositivo da aula principal (tópicos principais) e removendo:
 * 1. Título principal, epígrafes e Introdução (tudo antes do 1º tópico principal ou seções de Introdução)
 * 2. Pérolas de Ouro (blocos **PÉROLA DE OURO:** e citações de fontes primárias {{...}})
 * 3. Tipologia com Cristo (seção ### TIPOLOGIA: CONEXÃO COM JESUS CRISTO)
 * 4. Curiosidades e Arqueologia (seção ### CURIOSIDADES E ARQUEOLOGIA)
 * 5. Definições laterais de glossário [[Termo | Explicação]] -> mantém apenas "Termo"
 */
export function extractMainLessonContentForQuiz(rawText: string): string {
    if (!rawText || typeof rawText !== 'string') return '';

    const lines = rawText.split(/\r?\n/);

    const isExcludedHeadingText = (headingText: string): boolean => {
        const clean = headingText
            .replace(/^[#*>\-\s]+/, '')
            .replace(/[*_]+/g, '')
            .trim();
        return /^(?:INTRODU[ÇC][ÃA]O|TIPOLOGIA|CONEX[ÃA]O\s+COM\s+(?:JESUS|CRISTO)|CURIOSIDADES?|ARQUEOLOGIA|P[ÉE]ROLAS?\s+DE\s+OURO|AP[ÊE]NDICE|DOSSI[ÊE]\s+ESPECIAL)/i.test(clean) ||
            /\b(?:TIPOLOGIA\s*:?\s*CONEX[ÃA]O|CONEX[ÃA]O\s+COM\s+JESUS\s+CRISTO|CURIOSIDADES?\s+E\s+ARQUEOLOGIA|ARQUEOLOGIA\s+E\s+CURIOSIDADES?)\b/i.test(clean);
    };

    const isMainTopicH2 = (line: string): boolean => {
        const tr = line.trim();
        if (!/^##\s+/.test(tr) || /^###/.test(tr)) return false;
        return !isExcludedHeadingText(tr);
    };

    const hasMainTopicH2 = lines.some(isMainTopicH2);

    const filterLines = (requireMainTopicStart: boolean): string[] => {
        const kept: string[] = [];
        let seenMainTopic = !requireMainTopicStart;
        let inExcludedSection = false;

        for (const rawLine of lines) {
            const tr = rawLine.trim();
            if (!tr) {
                if (seenMainTopic && !inExcludedSection && kept.length > 0 && kept[kept.length - 1] !== '') {
                    kept.push('');
                }
                continue;
            }

            // Ignora título principal (# PANORAMA BÍBLICO...) e marcadores internos
            if (/^#\s+/.test(tr) || /^PANOR[ÂA]MA\s+B[ÍI]BLICO/i.test(tr) || tr === '__CONTINUATION_MARKER__') {
                continue;
            }

            // Ignora epígrafes em blockquote no topo
            if (tr.startsWith('>')) {
                continue;
            }

            // Detecta cabeçalhos ## ou ### ou linhas de título em negrito isoladas
            const isH2 = /^##\s+/.test(tr) && !/^###/.test(tr);
            const isH3 = /^###+\s+/.test(tr);
            const isStandaloneBoldHeading = tr.length < 100 && /^\*\*[^*]+\*\*$/.test(tr);

            if (isH2) {
                if (isExcludedHeadingText(tr)) {
                    inExcludedSection = true;
                } else {
                    seenMainTopic = true;
                    inExcludedSection = false;
                    kept.push(tr);
                }
                continue;
            }

            if (isH3 || isStandaloneBoldHeading || (tr.length < 90 && isExcludedHeadingText(tr))) {
                if (isExcludedHeadingText(tr)) {
                    inExcludedSection = true;
                    continue;
                }
                if (isH3 && seenMainTopic) {
                    inExcludedSection = false;
                    kept.push(tr);
                    continue;
                }
            }

            if (!seenMainTopic || inExcludedSection) {
                continue;
            }

            // Remove blocos de PÉROLA DE OURO (seja a linha inteira ou anexado no fim do parágrafo)
            if (/^(?:[\*_>\-\s]*)*P[ÉE]ROLAS?\s+DE\s+OURO\b/i.test(tr)) {
                continue;
            }

            let cleanedLine = tr.replace(/(?:\*\*|\b)P[ÉE]ROLAS?\s+DE\s+OURO\s*:?\s*(?:\*\*)?[\s\S]*$/i, '').trim();
            if (!cleanedLine) continue;

            // Remove frases que contenham citações de fontes primárias {{Autor | Obra | Comando}}
            if (/\{\{[^}]+\}\}/.test(cleanedLine)) {
                const sentences = cleanedLine.split(/(?<=[.!?])\s+/);
                const filteredSentences = sentences.filter(s => !/\{\{[^}]+\}\}/.test(s) && !/P[ÉE]ROLAS?\s+DE\s+OURO/i.test(s));
                cleanedLine = filteredSentences.join(' ').trim();
                if (!cleanedLine) continue;
            }

            // Converte glossários [[Termo | Explicação]] em apenas "Termo" para focar na aula principal
            cleanedLine = cleanedLine.replace(/\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g, '$1');

            kept.push(cleanedLine);
        }

        return kept;
    };

    let resultLines = filterLines(hasMainTopicH2);
    let resultText = resultLines.join('\n').trim();

    // Fallback seguro caso o texto colado seja um trecho customizado curto sem cabeçalhos ##
    if (hasMainTopicH2 && resultText.length < 200) {
        resultLines = filterLines(false);
        resultText = resultLines.join('\n').trim();
    }

    return resultText || rawText;
}
