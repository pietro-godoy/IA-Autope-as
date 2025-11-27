const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const app = express();

const PORT = 3000;
const JWT_SECRET = 'sua_chave_secreta_super_segura_aqui';
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
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'iautopecas',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const verificarToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ ok: false, msg: 'Token não fornecido' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuarioId = decoded.usuarioId;
    req.username = decoded.username;
    next();
  } catch (err) {
    res.status(401).json({ ok: false, msg: 'Token inválido' });
  }
};

app.post('/api/auth/register', async (req, res) => {
  const { username, password, email } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ ok: false, msg: 'Usuário e senha são obrigatórios' });
  }

  try {
    const connection = await pool.getConnection();
    const [usuarios] = await connection.execute(
      'SELECT id FROM usuarios WHERE username = ? OR email = ?',
      [username, email || null]
    );
    if (usuarios.length > 0) {
      connection.release();
      return res.status(400).json({ ok: false, msg: 'Usuário ou email já existe' });
    }
    const senhaHash = await bcrypt.hash(password, 10);
    const [result] = await connection.execute(
      'INSERT INTO usuarios (username, senha, email) VALUES (?, ?, ?)',
      [username, senhaHash, email || null]
    );
    connection.release();
    const usuarioId = result.insertId;
    const token = jwt.sign({ usuarioId, username }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      ok: true,
      msg: 'Cadastro realizado com sucesso',
      token,
      usuario: { id: usuarioId, username }
    });
  } catch (error) {
    console.error('Erro ao registrar:', error);
    res.status(500).json({ ok: false, msg: 'Erro ao registrar' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ ok: false, msg: 'Usuário/Email e senha são obrigatórios' });
  }

  try {
    const connection = await pool.getConnection();
    const [usuarios] = await connection.execute(
      'SELECT id, username, senha FROM usuarios WHERE username = ? OR email = ?',
      [username, username]
    );
    connection.release();
    if (usuarios.length === 0) {
      return res.status(401).json({ ok: false, msg: 'Usuário ou email não encontrado', usuarioNaoExiste: true });
    }

    const usuario = usuarios[0];
    const senhaCorreta = await bcrypt.compare(password, usuario.senha);
    if (!senhaCorreta) {
      return res.status(401).json({ ok: false, msg: 'Senha incorreta' });
    }

    const token = jwt.sign({ usuarioId: usuario.id, username: usuario.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      ok: true,
      msg: 'Login bem-sucedido',
      token,
      usuario: { id: usuario.id, username: usuario.username }
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({ ok: false, msg: 'Erro ao fazer login' });
  }
});

app.get('/api/historico', verificarToken, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [buscas] = await connection.execute(
      'SELECT id, termo, data_busca FROM historico_buscas WHERE usuario_id = ? ORDER BY data_busca DESC LIMIT 50',
      [req.usuarioId]
    );
    connection.release();
    res.json({ ok: true, buscas });
  } catch (error) {
    console.error('Erro ao obter histórico:', error);
    res.status(500).json({ ok: false, msg: 'Erro ao obter histórico' });
  }
});

app.post('/api/historico', verificarToken, async (req, res) => {
  const { termo } = req.body;

  if (!termo) {
    return res.status(400).json({ ok: false, msg: 'Termo de busca obrigatório' });
  }

  try {
    const connection = await pool.getConnection();
    const [existing] = await connection.execute(
      'SELECT id FROM historico_buscas WHERE usuario_id = ? AND LOWER(termo) = LOWER(?)',
      [req.usuarioId, termo]
    );
    if (existing.length > 0) {
      await connection.execute(
        'UPDATE historico_buscas SET data_busca = NOW() WHERE id = ?',
        [existing[0].id]
      );
    } else {
      await connection.execute(
        'INSERT INTO historico_buscas (usuario_id, termo) VALUES (?, ?)',
        [req.usuarioId, termo]
      );
    }
    connection.release();
    res.status(201).json({
      ok: true,
      msg: 'Busca salva com sucesso'
    });
  } catch (error) {
    console.error('Erro ao salvar busca:', error);
    res.status(500).json({ ok: false, msg: 'Erro ao salvar busca' });
  }
});

app.delete('/api/historico', verificarToken, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    await connection.execute(
      'DELETE FROM historico_buscas WHERE usuario_id = ?',
      [req.usuarioId]
    );
    connection.release();
    res.json({ ok: true, msg: 'Histórico limpo com sucesso' });
  } catch (error) {
    console.error('Erro ao limpar histórico:', error);
    res.status(500).json({ ok: false, msg: 'Erro ao limpar histórico' });
  }
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

app.post('/api/pecas/buscar', verificarToken, async (req, res) => {
  const { carroNome } = req.body;

  if (!carroNome) {
    return res.status(400).json({ ok: false, msg: 'Nome do carro é obrigatório' });
  }

  try {
    if (!checkRateLimit(req.usuarioId)) {
      return res.status(429).json({ 
        ok: false, 
        msg: 'Limite de requisições excedido. Máximo 10 buscas por minuto. Aguarde um momento.' 
      });
    }

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

app.listen(PORT, () => {
  console.log(`\n✅ Servidor IAuto Peças rodando em http://localhost:${PORT}\n`);
  console.log('Endpoints disponíveis:');
  console.log('  POST   /api/auth/register');
  console.log('  POST   /api/auth/login');
  console.log('  GET    /api/historico');
  console.log('  POST   /api/historico');
  console.log('  DELETE /api/historico');
  console.log('  GET    /api/pecas');
  console.log('  GET    /api/health\n');
});
