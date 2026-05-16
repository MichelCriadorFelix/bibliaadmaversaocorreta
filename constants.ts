import { BibleBook, ReadingPlan } from './types';

export const CHURCH_NAME = "Assembleia de Deus Ministério Ágape";
export const CHURCH_INSTAGRAM = "@adma.vilardosteles";
export const PASTOR_PRESIDENT = "Pr. Daniel Barbosa";
export const APP_VERSION = "v11.5 - Edição Oficial (Universal)";

export const BIBLE_BOOKS: BibleBook[] = [
  { name: "Gênesis", abbrev: "gn", chapters: 50, testament: "old" },
  { name: "Êxodo", abbrev: "ex", chapters: 40, testament: "old" },
  { name: "Levítico", abbrev: "lv", chapters: 27, testament: "old" },
  { name: "Números", abbrev: "nm", chapters: 36, testament: "old" },
  { name: "Deuteronômio", abbrev: "dt", chapters: 34, testament: "old" },
  { name: "Josué", abbrev: "js", chapters: 24, testament: "old" },
  { name: "Juízes", abbrev: "jz", chapters: 21, testament: "old" },
  { name: "Rute", abbrev: "rt", chapters: 4, testament: "old" },
  { name: "1 Samuel", abbrev: "1sm", chapters: 31, testament: "old" },
  { name: "2 Samuel", abbrev: "2sm", chapters: 24, testament: "old" },
  { name: "1 Reis", abbrev: "1rs", chapters: 22, testament: "old" },
  { name: "2 Reis", abbrev: "2rs", chapters: 25, testament: "old" },
  { name: "1 Crônicas", abbrev: "1cr", chapters: 29, testament: "old" },
  { name: "2 Crônicas", abbrev: "2cr", chapters: 36, testament: "old" },
  { name: "Esdras", abbrev: "ed", chapters: 10, testament: "old" },
  { name: "Neemias", abbrev: "ne", chapters: 13, testament: "old" },
  { name: "Ester", abbrev: "et", chapters: 10, testament: "old" },
  { name: "Jó", abbrev: "job", chapters: 42, testament: "old" },
  { name: "Salmos", abbrev: "sl", chapters: 150, testament: "old" },
  { name: "Provérbios", abbrev: "pv", chapters: 31, testament: "old" },
  { name: "Eclesiastes", abbrev: "ec", chapters: 12, testament: "old" },
  { name: "Cantares", abbrev: "ct", chapters: 8, testament: "old" },
  { name: "Isaías", abbrev: "is", chapters: 66, testament: "old" },
  { name: "Jeremias", abbrev: "jr", chapters: 52, testament: "old" },
  { name: "Lamentações", abbrev: "lm", chapters: 5, testament: "old" },
  { name: "Ezequiel", abbrev: "ez", chapters: 48, testament: "old" },
  { name: "Daniel", abbrev: "dn", chapters: 12, testament: "old" },
  { name: "Oséias", abbrev: "os", chapters: 14, testament: "old" },
  { name: "Joel", abbrev: "jl", chapters: 3, testament: "old" },
  { name: "Amós", abbrev: "am", chapters: 9, testament: "old" },
  { name: "Obadias", abbrev: "ob", chapters: 1, testament: "old" },
  { name: "Jonas", abbrev: "jn", chapters: 4, testament: "old" },
  { name: "Miquéias", abbrev: "mq", chapters: 7, testament: "old" },
  { name: "Naum", abbrev: "na", chapters: 3, testament: "old" },
  { name: "Habacuque", abbrev: "hc", chapters: 3, testament: "old" },
  { name: "Sofonias", abbrev: "sf", chapters: 3, testament: "old" },
  { name: "Ageu", abbrev: "ag", chapters: 2, testament: "old" },
  { name: "Zacarias", abbrev: "zc", chapters: 14, testament: "old" },
  { name: "Malaquias", abbrev: "ml", chapters: 4, testament: "old" },
  { name: "Mateus", abbrev: "mt", chapters: 28, testament: "new" },
  { name: "Marcos", abbrev: "mc", chapters: 16, testament: "new" },
  { name: "Lucas", abbrev: "lc", chapters: 24, testament: "new" },
  { name: "João", abbrev: "jo", chapters: 21, testament: "new" },
  { name: "Atos", abbrev: "at", chapters: 28, testament: "new" },
  { name: "Romanos", abbrev: "rm", chapters: 16, testament: "new" },
  { name: "1 Coríntios", abbrev: "1co", chapters: 16, testament: "new" },
  { name: "2 Coríntios", abbrev: "2co", chapters: 13, testament: "new" },
  { name: "Gálatas", abbrev: "gl", chapters: 6, testament: "new" },
  { name: "Efésios", abbrev: "ef", chapters: 6, testament: "new" },
  { name: "Filipenses", abbrev: "fp", chapters: 4, testament: "new" },
  { name: "Colossenses", abbrev: "cl", chapters: 4, testament: "new" },
  { name: "1 Tessalonicenses", abbrev: "1ts", chapters: 5, testament: "new" },
  { name: "2 Tessalonicenses", abbrev: "2ts", chapters: 3, testament: "new" },
  { name: "1 Timóteo", abbrev: "1tm", chapters: 6, testament: "new" },
  { name: "2 Timóteo", abbrev: "2tm", chapters: 4, testament: "new" },
  { name: "Tito", abbrev: "tt", chapters: 3, testament: "new" },
  { name: "Filemom", abbrev: "fm", chapters: 1, testament: "new" },
  { name: "Hebreus", abbrev: "hb", chapters: 13, testament: "new" },
  { name: "Tiago", abbrev: "tg", chapters: 5, testament: "new" },
  { name: "1 Pedro", abbrev: "1pe", chapters: 5, testament: "new" },
  { name: "2 Pedro", abbrev: "2pe", chapters: 3, testament: "new" },
  { name: "1 João", abbrev: "1jo", chapters: 5, testament: "new" },
  { name: "2 João", abbrev: "2jo", chapters: 1, testament: "new" },
  { name: "3 João", abbrev: "3jo", chapters: 1, testament: "new" },
  { name: "Judas", abbrev: "jd", chapters: 1, testament: "new" },
  { name: "Apocalipse", abbrev: "ap", chapters: 22, testament: "new" }
];

export const TOTAL_CHAPTERS = 1189;

// Identifica livros de 1 capítulo (Exportado para uso no BibleReader)
export const ONE_CHAPTER_BOOKS = BIBLE_BOOKS.filter(b => b.chapters === 1).map(b => b.name);

export const READING_PLANS: ReadingPlan[] = [
  { 
    id: "pentateuco", 
    name: "Pentateuco", 
    books: ["Gênesis", "Êxodo", "Levítico", "Números", "Deuteronômio"],
    description: "Os cinco livros de Moisés (A Lei).",
    estimatedDays: 60
  },
  { 
    id: "historicos", 
    name: "Livros Históricos", 
    books: ["Josué", "Juízes", "Rute", "1 Samuel", "2 Samuel", "1 Reis", "2 Reis", "1 Crônicas", "2 Crônicas", "Esdras", "Neemias", "Ester"],
    description: "A história da nação de Israel.",
    estimatedDays: 90
  },
  { 
    id: "poeticos", 
    name: "Livros Poéticos", 
    books: ["Jó", "Salmos", "Provérbios", "Eclesiastes", "Cantares"],
    description: "Sabedoria, adoração e louvor.",
    estimatedDays: 75
  },
  { 
    id: "profetas_maiores", 
    name: "Profetas Maiores", 
    books: ["Isaías", "Jeremias", "Lamentações", "Ezequiel", "Daniel"],
    description: "As grandes profecias messiânicas e de juízo.",
    estimatedDays: 60
  },
  { 
    id: "profetas_menores", 
    name: "Profetas Menores", 
    books: ["Oséias", "Joel", "Amós", "Obadias", "Jonas", "Miquéias", "Naum", "Habacuque", "Sofonias", "Ageu", "Zacarias", "Malaquias"],
    description: "Os doze profetas finais do AT.",
    estimatedDays: 30
  },
  { 
    id: "evangelhos", 
    name: "Evangelhos", 
    books: ["Mateus", "Marcos", "Lucas", "João"],
    description: "A vida e ministério de Jesus Cristo.",
    estimatedDays: 30
  },
  { 
    id: "atos", 
    name: "Atos dos Apóstolos", 
    books: ["Atos"],
    description: "O nascimento e expansão da Igreja.",
    estimatedDays: 14
  },
  { 
    id: "cartas_paulinas", 
    name: "Cartas Paulinas", 
    books: ["Romanos", "1 Coríntios", "2 Coríntios", "Gálatas", "Efésios", "Filipenses", "Colossenses", "1 Tessalonicenses", "2 Tessalonicenses", "1 Timóteo", "2 Timóteo", "Tito", "Filemom"],
    description: "As epístolas do Apóstolo Paulo.",
    estimatedDays: 45
  },
  { 
    id: "cartas_gerais", 
    name: "Cartas Gerais", 
    books: ["Hebreus", "Tiago", "1 Pedro", "2 Pedro", "1 João", "2 João", "3 João", "Judas"],
    description: "Epístolas universais para a igreja.",
    estimatedDays: 21
  },
  { 
    id: "apocalipse", 
    name: "Apocalipse", 
    books: ["Apocalipse"],
    description: "A revelação dos últimos dias.",
    estimatedDays: 14
  },
  { 
    id: "livros_curtos", 
    name: "Livros de Capítulo Único", 
    books: ONE_CHAPTER_BOOKS,
    description: "Leitura rápida: Todos os livros com apenas 1 capítulo.",
    estimatedDays: 7
  },
  { 
    id: "novo_testamento", 
    name: "Novo Testamento Completo", 
    books: BIBLE_BOOKS.filter(b => b.testament === "new").map(b => b.name),
    description: "Todo o Novo Testamento.",
    estimatedDays: 90
  },
  { 
    id: "antigo_testamento", 
    name: "Antigo Testamento Completo", 
    books: BIBLE_BOOKS.filter(b => b.testament === "old").map(b => b.name),
    description: "Todo o Antigo Testamento.",
    estimatedDays: 270
  }
];

export const generateChapterKey = (book: string, chapter: number) => {
  return `${book.toLowerCase().replace(/\s/g, '_')}_${chapter}`;
};

export const generateVerseKey = (book: string, chapter: number, verse: number) => {
  return `${book.toLowerCase().replace(/\s/g, '_')}_${chapter}_${verse}`;
};
