const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const app = express();

const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}/api`;
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const pecasCache = new Map();
const userRequests = new Map();

function getFromCache(key) {
  const cached = pecasCache.get(key);
  if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
    return cached.data;
  }
  return null;
}

function saveToCache(key, data) {
  pecasCache.set(key, { data, timestamp: Date.now() });
}

function checkRateLimit(userId) {
  const now = Date.now();
  const userKey = `user_${userId}`;
  if (!userRequests.has(userKey)) {
    userRequests.set(userKey, []);
  }
  const requests = userRequests.get(userKey).filter(time => now - time < 60000);
  if (requests.length >= 10) {
    return false;
  }
  requests.push(now);
  userRequests.set(userKey, requests);
  return true;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'iautopecas',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Rota para servir configuração dinâmica
app.get('/config.js', (req, res) => {
  const configJs = `window.API_CONFIG = { API_BASE_URL: "${API_BASE_URL}" };`;
  res.type('application/javascript').send(configJs);
});

app.post('/api/pecas/buscar', async (req, res) => {
  const { carroNome } = req.body;

  if (!carroNome) {
    return res.status(400).json({ ok: false, msg: 'Nome do carro é obrigatório' });
  }

  try {
    const cacheKey = carroNome.toLowerCase().trim();
    const cached = getFromCache(cacheKey);
    if (cached) {
      return res.json({
        ok: true,
        carro: carroNome,
        pecas: cached,
        fonte: 'cache'
      });
    }

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      
      const prompt = `Você é um especialista em peças automotivas. Liste as 10 peças mais comuns para manutenção de um ${carroNome}. 
      Para cada peça, forneça:
      - nome: nome da peça
      - descricao: descrição breve
      - preco_medio: preço estimado em reais (use números como 45.50, não texto)
      
      Retorne APENAS um JSON válido sem explicações com esta estrutura exata: 
      [{"nome":"nome da peça","descricao":"descrição breve","preco_medio":número}]
      Retorne APENAS o JSON, nada mais.`;
      const result = await model.generateContent(prompt);
      let pecasText = result.response.text().trim();
      
      // Remover markdown se existir
      if (pecasText.startsWith('```json')) {
        pecasText = pecasText.replace('```json\n', '').replace('\n```', '');
      } else if (pecasText.startsWith('```')) {
        pecasText = pecasText.replace('```\n', '').replace('\n```', '');
      }

      let pecas = JSON.parse(pecasText);
      if (!Array.isArray(pecas)) pecas = [pecas];
      
      // Salvar no cache para futuras requisições
      saveToCache(cacheKey, pecas);

      // Adicionar IDs
      pecas = pecas.map((peca, index) => {
        return {
          ...peca,
          id: index + 1
        };
      });

      res.json({
        ok: true,
        carro: carroNome,
        pecas: pecas,
        fonte: 'gemini'
      });

    } catch (apiError) {
      res.status(500).json({
        ok: false, 
        msg: 'Erro ao buscar peças: ' + apiError.message,
        dica: 'Verifique sua chave GOOGLE_API_KEY no arquivo .env'
      });
    }

  } catch (error) {
    res.status(500).json({
      ok: false, 
      msg: 'Erro ao buscar peças: ' + error.message
    });
  }
});

// Rota de Registro
app.post('/api/auth/register', async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || username.trim().length < 3) {
    return res.status(400).json({ ok: false, msg: 'Usuário deve ter no mínimo 3 caracteres' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ ok: false, msg: 'Senha deve ter no mínimo 6 caracteres' });
  }

  try {
    const connection = await pool.getConnection();
    
    // Verificar se usuário já existe
    const [usuarios] = await connection.execute(
      'SELECT id FROM usuarios WHERE username = ? OR email = ?',
      [username.trim(), email?.trim() || '']
    );

    if (usuarios.length > 0) {
      connection.release();
      return res.status(409).json({ ok: false, msg: 'Usuário ou email já existe' });
    }

    // Inserir novo usuário com senha em texto simples
    const [result] = await connection.execute(
      'INSERT INTO usuarios (username, password, email) VALUES (?, ?, ?)',
      [username.trim(), password, email?.trim() || null]
    );

    const usuarioId = result.insertId;
    connection.release();

    res.json({
      ok: true,
      msg: 'Usuário registrado com sucesso',
      usuario: {
        id: usuarioId,
        username: username.trim()
      }
    });

  } catch (error) {
    console.error('Erro ao registrar:', error);
    res.status(500).json({ ok: false, msg: 'Erro ao registrar usuário' });
  }
});

// Rota de Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ ok: false, msg: 'Usuário e senha são obrigatórios' });
  }

  try {
    const connection = await pool.getConnection();

    // Buscar usuário
    const [usuarios] = await connection.execute(
      'SELECT id, username FROM usuarios WHERE username = ? AND password = ?',
      [username.trim(), password]
    );

    connection.release();

    if (usuarios.length === 0) {
      return res.status(401).json({ ok: false, msg: 'Usuário ou senha incorretos' });
    }

    const usuario = usuarios[0];

    res.json({
      ok: true,
      msg: 'Login realizado com sucesso',
      usuario: {
        id: usuario.id,
        username: usuario.username
      }
    });

  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({ ok: false, msg: 'Erro ao fazer login' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, msg: 'Servidor rodando' });
});

app.get('/api/pecas', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [pecas] = await connection.execute(
      'SELECT id, nome, fabricante, modelo_carro, ano_inicio, ano_fim, preco, estoque FROM pecas'
    );
    connection.release();
    res.json({ ok: true, pecas });
  } catch (error) {
    console.error('Erro ao obter peças:', error);
    res.status(500).json({ ok: false, msg: 'Erro ao obter peças' });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Servidor IAuto Peças rodando em ${API_BASE_URL}\n`);
  console.log('Endpoints disponíveis:');
  console.log('  POST   /api/pecas/buscar');
  console.log('  GET    /api/pecas');
  console.log('  GET    /api/health\n');
});
