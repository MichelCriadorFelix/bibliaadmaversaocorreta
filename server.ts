import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

// Importar os handlers das funções serverless
import geminiHandler from './api/gemini.js';
import keysStatusHandler from './api/keys-status.js';
import storageHandler from './api/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middlewares básicos
  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // --- ROTAS DE API (Emulando Vercel Serverless Functions) ---
  
  // Rota para Gemini
  app.all('/api/gemini', async (req, res) => {
    try {
      await geminiHandler(req, res);
    } catch (error) {
      console.error('Error in /api/gemini:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Rota para Status das Chaves
  app.all('/api/keys-status', async (req, res) => {
    try {
      await keysStatusHandler(req, res);
    } catch (error) {
      console.error('Error in /api/keys-status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Rota para Storage (Supabase)
  app.all('/api/storage', async (req, res) => {
    try {
      await storageHandler(req, res);
    } catch (error) {
      console.error('Error in /api/storage:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Em produção, servir arquivos estáticos
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('--- Verificação de Credenciais ---');
    console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL ? 'Configurado ✅' : 'AUSENTE ❌');
    console.log('SUPABASE_KEY:', process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Configurado ✅' : 'AUSENTE ❌');
    console.log('GEMINI_API_KEY:', process.env.API_KEY ? 'Configurado ✅' : 'AUSENTE ❌');
    console.log('---------------------------------');
  });
}

startServer().catch((err) => {
  console.error('Error starting server:', err);
});
