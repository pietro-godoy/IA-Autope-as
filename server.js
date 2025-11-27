const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const app = express();

const PORT = process.env.PORT || 3000;
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
  console.log(`\n✅ Servidor IAuto Peças rodando em http://localhost:${PORT}\n`);
  console.log('Endpoints disponíveis:');
  console.log('  POST   /api/pecas/buscar');
  console.log('  GET    /api/pecas');
  console.log('  GET    /api/health\n');
});
