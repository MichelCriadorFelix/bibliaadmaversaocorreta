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
import ttsHandler from './api/tts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middlewares básicos
  app.use(cors());
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

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

  // Rota para TTS de Devocional (Google GenAI)
  app.all('/api/narrar-biblia', async (req, res) => {
    try {
      await ttsHandler(req, res);
    } catch (error) {
      console.error('Error in /api/narrar-biblia:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- ROTA DE PRESENÇA EM TEMPO REAL (USUÁRIOS ONLINE NA BÍBLIA/APP) ---
  const activeSessions = new Map<string, {
    email: string;
    name: string;
    level: number;
    rankTitle: string;
    activity: string; // Ex: "Lendo Gênesis 8", "No Aplicativo"
    lastHeartbeat: number;
  }>();

  // Heartbeat ping (POST)
  app.post('/api/presence', (req, res) => {
    const { email, name, level, rankTitle, activity } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const cleanEmail = String(email).toLowerCase().trim();
    activeSessions.set(cleanEmail, {
      email: cleanEmail,
      name: name || cleanEmail.split('@')[0],
      level: Number(level) || 1,
      rankTitle: rankTitle || 'Estudante da Bíblia',
      activity: activity || 'Online no Aplicativo',
      lastHeartbeat: Date.now()
    });
    res.json({ status: 'ok', onlineCount: activeSessions.size });
  });

  // Obter usuários online (GET) - Expira após 45 segundos de inatividade
  app.get('/api/presence', (req, res) => {
    const now = Date.now();
    const TTL_MS = 45 * 1000; // 45 segundos
    const onlineList: any[] = [];

    for (const [key, session] of activeSessions.entries()) {
      if (now - session.lastHeartbeat <= TTL_MS) {
        onlineList.push({
          email: session.email,
          name: session.name,
          level: session.level,
          rankTitle: session.rankTitle,
          activity: session.activity,
          lastSeen: 'Online agora',
          isAvailable: true
        });
      } else {
        // Limpa sessões expiradas
        activeSessions.delete(key);
      }
    }

    res.json({
      onlineUsers: onlineList,
      totalOnline: onlineList.length
    });
  });

  // Desconectar sessão (DELETE)
  app.delete('/api/presence', (req, res) => {
    const { email } = req.body || {};
    if (email) {
      activeSessions.delete(String(email).toLowerCase().trim());
    }
    res.json({ status: 'disconnected' });
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
