export const fixBiblePronunciation = (text: string): string => {
    if (!text) return '';
    let processed = text;

    // 1. Abreviações Teológicas
    processed = processed.replace(/\bAT\b/g, 'Antigo Testamento');
    processed = processed.replace(/\bNT\b/g, 'Novo Testamento');

    // 2. Livros Numerados (Femininos: Cartas)
    processed = processed.replace(/\b1\s+(João|Pedro|Coríntios|Tessalonicenses|Timóteo)\b/gi, 'Primeira $1');
    processed = processed.replace(/\b2\s+(João|Pedro|Coríntios|Tessalonicenses|Timóteo)\b/gi, 'Segunda $1');
    processed = processed.replace(/\b3\s+(João)\b/gi, 'Terceira $1');

    // 3. Livros Numerados (Masculinos: Históricos)
    processed = processed.replace(/\b1\s+(Reis|Crônicas|Samuel|Macabeus)\b/gi, 'Primeiro $1');
    processed = processed.replace(/\b2\s+(Reis|Crônicas|Samuel|Macabeus)\b/gi, 'Segundo $1');

    // 4. Referências Bíblicas com Capítulos, Versículos e Intervalos
    // Ex: 8:1-4 ou 8:1 a 4 -> capítulo 8, versículos 1 a 4
    processed = processed.replace(/(\d+):(\d+)\s*-\s*(\d+)/g, 'capítulo $1, versículos $2 a $3');
    processed = processed.replace(/(\d+):(\d+)\s*a\s*(\d+)/gi, 'capítulo $1, versículos $2 a $3');
    
    // Ex: 3:16 -> capítulo 3, versículo 16
    processed = processed.replace(/(\d+):(\d+)/g, 'capítulo $1, versículo $2');

    // 5. Séculos (Romanos básicos)
    processed = processed.replace(/\bSéculo I\b/gi, 'Século um');
    processed = processed.replace(/\bSéculo II\b/gi, 'Século dois');
    processed = processed.replace(/\bSéculo III\b/gi, 'Século três');
    processed = processed.replace(/\bSéculo IV\b/gi, 'Século quatro');
    processed = processed.replace(/\bSéculo V\b/gi, 'Século cinco');
    processed = processed.replace(/\bSéculo X\b/gi, 'Século dez');
    processed = processed.replace(/\bSéculo XV\b/gi, 'Século quinze');
    processed = processed.replace(/\bSéculo XIX\b/gi, 'Século dezenove');
    processed = processed.replace(/\bSéculo XX\b/gi, 'Século vinte');
    processed = processed.replace(/\bSéculo XXI\b/gi, 'Século vinte e um');

    return processed;
};
