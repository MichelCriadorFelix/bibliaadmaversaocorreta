# Product Requirements Document (PRD) - ADMA & Felix & Castro App

## 1. Visão Geral do Produto
O sistema é uma plataforma híbrida avançada que atende a dois propósitos principais:
1. **Sistema de Gestão Jurídica (Felix & Castro Advocacia)**: Uma suíte completa para gestão de clientes, cálculos trabalhistas/previdenciários, geração de petições com IA e busca jurisprudencial baseada em RAG.
2. **ADMA - Panorama Bíblico (Educação Teológica)**: Uma plataforma educacional impulsionada por IA (Gemini) para geração, atualização e curadoria de estudos bíblicos, cartilhas e apostilas teológicas com parâmetros avançados de controle.

## 2. Perfis de Usuário
- **Advogado/Sócio**: Acessa gestão de clientes, calculadoras jurídicas, assistentes de IA especializados (Dr. Michel e Dra. Luana) e editor de petições.
- **Professor/Teólogo (Admin - Editor Chefe)**: Acessa o Painel ADMA para gerenciar a Bíblia, configurar múltiplas chaves de API (Monitor de Chaves), gerar e atualizar conteúdo de estudos bíblicos e gerenciar usuários alunos.
- **Aluno (EBD)**: Acessa os estudos gerados, apostilas e consome o conteúdo de forma otimizada para leitura.

## 3. Funcionalidades Core (Escopo Jurídico)

### 3.1. Gestão de Clientes e Contratos
- CRUD completo de clientes integrado ao Supabase.
- Armazenamento de dados sensíveis e históricos de processos.

### 3.2. Calculadoras Jurídicas
- **Cálculo Trabalhista**: Interface para simulação e cálculo de verbas rescisórias e direitos trabalhistas.
- **Cálculo Previdenciário**: Cálculo baseado em tabelas de salário mínimo atualizadas para estimativas de aposentadoria/benefícios.

### 3.3. Inteligência Artificial Jurídica e RAG
- **RAG (Retrieval-Augmented Generation)**: Busca semântica (vetorial via pgvector no Supabase) em bases de legislação e jurisprudência, usando `gemini-text-embedding-004`.
- **Assistentes Especializados**:
  - **Dr. Michel Felix**: IA focada em Direito Civil, Trabalhista e Geral.
  - **Dra. Luana Castro**: IA focada em Direito Previdenciário.
- **Memória de Draft (Contexto Longo)**: A IA mantém uma memória contínua de até 40 mensagens (compressHistory) e salva drafts de petições (até 40k+ caracteres) de forma invisível para não perder o contexto durante a lapidação da peça.
- **Editor de Petições**: Geração, edição e exportação rica de peças jurídicas para o formato DOCX.

## 4. Funcionalidades Core (Escopo Teológico / Panorama Bíblico)

### 4.1. Geração de Conteúdo (Panorama Bíblico)
- Geração de estudos de capítulos bíblicos via Gemini (ex: "Panorama Bíblico - 1 Samuel 1").
- **Parâmetros de Controle**:
  - **Nível de Profundidade**: Padrão, Estendido, Profundo.
  - **Nível de Raciocínio (Gemini Thinking)**: Mínimo, Baixo, Médio, Máximo.
  - **Tamanho da Aula**: Slider (2 a 10 páginas) para definir metas rígidas de volume de palavras.
  - **Instruções Customizadas**: Input para diretrizes específicas (ex: "Foque em arqueologia").
- **Mecanismo de Atualização (Upgrade)**: Ferramenta cirúrgica para pegar um estudo existente e atualizá-lo (adicionar glossário, pérolas de ouro) respeitando rigorosamente o limite de palavras selecionado (com "gordura" de tolerância).

### 4.2. Painel do Editor Chefe (Admin ADMA)
- **Monitor de Chaves API**: Gestão de um pool de chaves API (ex: 43 chaves) com sistema de fallback/rotação automática em caso de erro 429 (Resource Exhausted).
- **Gerador em Lote**: Interface para gerar conteúdos de capítulos inteiros de forma automatizada.
- **Gestão de Usuários**: Visualização de alunos cadastrados, status e permissões.
- **Exportação**: Geração de livro/apostila completa em formato Markdown (.md) para os alunos.

## 5. Requisitos Não Funcionais (Arquitetura e Integração)
- **Banco de Dados e Storage**: Supabase Pro (PostgreSQL, pgvector para RAG, Auth, Storage).
- **Hospedagem Frontend/Backend**: Vercel Pro (Deployment principal).
- **IA e LLM**: Integração primária com `gemini-3.5-flash` via `@google/genai` (SSR streaming) com prompt engineering avançado e controle de output tokens (`maxOutputTokens: 16383`). Integração secundária com OpenRouter para modelos de fallback.
- **Confiabilidade**: O fluxo de geração de conteúdo teológico não pode travar a aplicação, rotacionando chaves conforme a taxa de limite do Google for atingida.

## 6. Casos de Teste Sugeridos (Test Cases)

### 6.1. Fluxo Jurídico
1. **TC01**: Criar um novo cliente e contrato, validando a persistência no Supabase.
2. **TC02**: Executar um cálculo trabalhista preenchendo datas e salários, verificando os resultados gerados.
3. **TC03**: Enviar um PDF longo (OCR) no chat do Dr. Michel e solicitar a elaboração de uma petição. Validar se o draft inicial é salvo corretamente no banco (Memória de Draft).
4. **TC04**: Pedir ao Dr. Michel para alterar uma cláusula na petição recém-gerada, verificando se o contexto anterior é mantido perfeitamente sem cortes abruptos.

### 6.2. Fluxo Panorama Bíblico
5. **TC05**: Acessar o Gerador de Panorama Bíblico e criar um conteúdo inédito selecionando 3 páginas e nível "Profundo". Validar se o tamanho final obedece ao mandato estabelecido.
6. **TC06**: Pegar um texto existente de 2500 palavras, definir no slider para 2400 palavras (3 páginas) e clicar em "Atualizar IA". Validar se a IA compacta o texto, insere as melhorias e entrega o conteúdo estritamente abaixo do limite de 3000 palavras (2400 + gordura de tolerância).
7. **TC07**: Acessar o Painel do Editor Chefe, monitorar as chaves API, disparar a geração de lote e forçar um erro 429 para verificar se o sistema rotaciona para a próxima chave válida de forma silenciosa.
8. **TC08**: Gerar e baixar um livro compilado em Markdown a partir do painel de exportação.

## 7. Premissas de Resiliência e Segurança
- Todos os segredos de API (chaves do Supabase, chaves do Gemini, OpenRouter) não devem ser vazados ao frontend.
- O sistema de OCR de OCR via base64 para PDFs densos deve rodar com estabilidade para documentos processuais extensos.
- O controle de RAG deve retornar sempre o chunk vetorizado mais condizente para embasar a petição com jurisprudência real.
