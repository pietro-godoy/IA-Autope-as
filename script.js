const API_BASE_URL = window.API_CONFIG?.API_BASE_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:3000/api`
    : `${window.location.protocol}//${window.location.hostname}/api`);

const USER_KEY = "iauto_user";

function getCurrentUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setCurrentUser(userData) {
  if (!userData || !userData.id || !userData.username) return;
  localStorage.setItem(USER_KEY, JSON.stringify({
    id: userData.id,
    username: userData.username
  }));
}

function logoutCurrentUser() {
  localStorage.removeItem(USER_KEY);
}

async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return { ok: false, msg: 'Erro ao conectar com o servidor' };
  }
}

async function registerUser(username, password, email = '') {
  if (!username || username.trim().length < 3) {
    return { ok: false, msg: 'Usuário deve ter no mínimo 3 caracteres' };
  }
  if (!password || password.length < 6) {
    return { ok: false, msg: 'Senha deve ter no mínimo 6 caracteres' };
  }

  const result = await apiCall('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: username.trim(), password, email: email.trim() })
  });

  if (result.ok && result.usuario) {
    setCurrentUser(result.usuario);
  }

  return result;
}

async function loginUser(username, password) {
  if (!username || !password) {
    return { ok: false, msg: 'Usuário e senha são obrigatórios' };
  }

  const result = await apiCall('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: username.trim(), password })
  });

  if (result.ok && result.usuario) {
    setCurrentUser(result.usuario);
  }

  return result;
}

async function getSearchHistory() {
  const user = getCurrentUser();
  if (!user) return [];

  const result = await apiCall(`/historico?usuarioId=${user.id}`, { method: 'GET' });
  
  if (!result.ok) return [];
  
  return result.historico || [];
}

async function addSearchFor(termo) {
  if (!termo || !termo.trim()) {
    return { ok: false, msg: 'Termo inválido' };
  }

  const user = getCurrentUser();
  if (!user) {
    return { ok: false, msg: 'Não autenticado' };
  }

  const result = await apiCall('/historico', {
    method: 'POST',
    body: JSON.stringify({ usuarioId: user.id, termo: termo.trim() })
  });
  
  return result;
}

async function clearHistoryFor() {
  const user = getCurrentUser();
  if (!user) {
    return { ok: false, msg: 'Não autenticado' };
  }

  const result = await apiCall('/historico', { method: 'DELETE', body: JSON.stringify({ usuarioId: user.id }) });
  
  return result;
}

document.addEventListener("DOMContentLoaded", () => {
  const current = getCurrentUser();
  const currentUsername = current?.username || null;
  
  // Verificar se está na página de busca e se não está logado
  const searchContent = document.getElementById("searchContent");
  const loginRequired = document.getElementById("loginRequired");
  
  if (searchContent && loginRequired) {
    // Página de busca detectada
    if (!currentUsername) {
      // Usuário não está logado - mostrar tela de login
      loginRequired.style.display = "flex";
      searchContent.style.display = "none";
      return;
    } else {
      // Usuário está logado - mostrar conteúdo
      loginRequired.style.display = "none";
      searchContent.style.display = "block";
    }
  }
  
  // Gerenciar navbar (login/logout)
  const navAuth = document.getElementById("navAuth");
  if (navAuth) {
    if (currentUsername) {
      // Usuário logado - mostrar nome e botão de sair
      navAuth.innerHTML = `
        <span style="color: white; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
          👤 ${currentUsername}
        </span>
        <button id="navLogout" class="btn-ghost" style="margin: 0; padding: 0.6rem 1.2rem;">
          Sair
        </button>
      `;
      
      const navLogout = document.getElementById("navLogout");
      if (navLogout) {
        navLogout.addEventListener("click", () => {
          logoutCurrentUser();
          showSuccess("Você saiu da conta com sucesso!", "Até logo!", () => {
            window.location.href = "index.html";
          });
        });
      }
    } else {
      // Usuário não logado - mostrar link de login
      navAuth.innerHTML = `<a href="login.html" id="nav-login">Fazer Login</a>`;
    }
  }

  // Controlar botão "Buscar Peças" - requer login
  const btnBuscar = document.getElementById("btnBuscar");
  if (btnBuscar) {
    btnBuscar.addEventListener("click", (e) => {
      if (!currentUsername) {
        e.preventDefault();
        showWarning("Você precisa estar logado para buscar peças. Faça login ou cadastre-se.", "Login Necessário");
        return false;
      }
    });
  }

  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const toggleBtn = document.getElementById("toggleBtn");
  const formTitle = document.getElementById("formTitle");
  const toggleText = document.getElementById("toggleText");
  const authMsg = document.getElementById("authMsg");

  // Campos de login
  const loginUserInput = document.getElementById("loginUser");
  const loginPassInput = document.getElementById("loginPass");

  // Campos de cadastro
  const registerUsername = document.getElementById("registerUsername");
  const registerEmail = document.getElementById("registerEmail");
  const registerPass = document.getElementById("registerPass");
  const registerPassConfirm = document.getElementById("registerPassConfirm");

  let modeRegister = false;

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      modeRegister = !modeRegister;
      if (modeRegister) {
        formTitle.textContent = "Cadastre-se";
        toggleBtn.textContent = "Já tenho conta";
        toggleText.textContent = "Já tem conta?";
        authMsg.textContent = "";
        loginForm.style.display = "none";
        registerForm.style.display = "flex";
        // Limpar campos
        registerUsername.value = "";
        registerEmail.value = "";
        registerPass.value = "";
        registerPassConfirm.value = "";
        registerUsername.focus();
      } else {
        formTitle.textContent = "Fazer Login";
        toggleBtn.textContent = "Cadastre-se";
        toggleText.textContent = "Não tem conta?";
        authMsg.textContent = "";
        loginForm.style.display = "flex";
        registerForm.style.display = "none";
        // Limpar campos
        loginUserInput.value = "";
        loginPassInput.value = "";
        loginUserInput.focus();
      }
    });
  }

  // Validação de email
  function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  // Formulário de Login
  if (loginForm && loginUserInput && loginPassInput) {
    loginForm.style.display = "flex";
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = loginUserInput.value.trim();
      const password = loginPassInput.value.trim();
      
      if (!username) {
        showWarning("Por favor, insira seu usuário ou email.", "Campo obrigatório");
        loginUserInput.focus();
        return;
      }
      
      if (!password) {
        showWarning("Por favor, insira sua senha.", "Campo obrigatório");
        loginPassInput.focus();
        return;
      }

      const res = await loginUser(username, password);
      if (res.ok) {
        showSuccess("Login realizado com sucesso!", "Bem-vindo!", () => {
          window.location.href = "index.html";
        });
      } else {
        if (res.usuarioNaoExiste) {
          showError("Usuário ou email '" + username + "' não foi encontrado no sistema.", "Não encontrado");
        } else {
          showError(res.msg || "Erro ao fazer login", "Erro no login");
        }
      }
    });
  }

  // Formulário de Cadastro
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = registerUsername.value.trim();
      const email = registerEmail.value.trim();
      const password = registerPass.value;
      const passwordConfirm = registerPassConfirm.value;

      // Validações
      if (!username) {
        showWarning("Por favor, insira um nome de usuário.", "Campo obrigatório");
        registerUsername.focus();
        return;
      }

      if (username.length < 3) {
        showWarning("O nome de usuário deve ter no mínimo 3 caracteres.", "Nome de usuário curto");
        registerUsername.focus();
        return;
      }

      if (!email) {
        showWarning("Por favor, insira seu email.", "Campo obrigatório");
        registerEmail.focus();
        return;
      }

      if (!isValidEmail(email)) {
        showWarning("Por favor, insira um email válido.", "Email inválido");
        registerEmail.focus();
        return;
      }

      if (!password) {
        showWarning("Por favor, insira uma senha.", "Campo obrigatório");
        registerPass.focus();
        return;
      }

      if (password.length < 6) {
        showWarning("A senha deve ter no mínimo 6 caracteres.", "Senha curta");
        registerPass.focus();
        return;
      }

      if (!passwordConfirm) {
        showWarning("Por favor, confirme sua senha.", "Campo obrigatório");
        registerPassConfirm.focus();
        return;
      }

      if (password !== passwordConfirm) {
        showWarning("As senhas não conferem. Por favor, tente novamente.", "Senhas diferentes");
        registerPass.value = "";
        registerPassConfirm.value = "";
        registerPass.focus();
        return;
      }

      // Chamar função de registro
      const res = await registerUser(username, password, email);
      if (res.ok) {
        showSuccess("Cadastro realizado com sucesso! Você foi logado automaticamente.", "Bem-vindo!", () => {
          window.location.href = "index.html";
        });
      } else {
        showError(res.msg || "Erro ao cadastrar", "Erro no cadastro");
      }
    });
  }

  const buscaForm = document.getElementById("buscaForm");
  const modeloInput = document.getElementById("modelo");
  const historyList = document.getElementById("historyList");
  const clearHistoryBtn = document.getElementById("clearHistory");
  const userArea = document.getElementById("userArea");

  async function renderHistoryFor() {
    if (!historyList) return;
    historyList.innerHTML = "";
    
    if (!currentUsername) {
      historyList.innerHTML = '<li style="background:transparent;color:#666;text-align:center;padding:1rem;">Faça login para salvar seu histórico.</li>';
      if (clearHistoryBtn) clearHistoryBtn.style.display = 'none';
      return;
    }

    const buscas = await getSearchHistory();
    if (buscas.length === 0) {
      historyList.innerHTML = '<li style="background:transparent;color:#999;text-align:center;padding:1rem;font-style:italic;">Nenhuma busca ainda.</li>';
      if (clearHistoryBtn) clearHistoryBtn.style.display = 'none';
      return;
    }

    buscas.forEach((item) => {
      const d = new Date(item.data_busca);
      const li = document.createElement("li");
      li.innerHTML = `<span>${item.termo}</span><span style="font-size:0.8rem;opacity:0.85">${d.toLocaleString()}</span>`;
      li.addEventListener("click", () => {
        modeloInput.value = item.termo;
      });
      historyList.appendChild(li);
    });

    // Mostrar botão "Limpar histórico" apenas se houver buscas
    if (clearHistoryBtn) {
      clearHistoryBtn.style.display = 'block';
    }
  }

  if (userArea) {
    if (currentUsername) {
      userArea.innerHTML = `<div style="display:flex;gap:10px;align-items:center;"><strong>Olá, ${currentUsername}</strong><button id="btnLogout2" class="btn-ghost" style="margin-left:8px">Sair</button></div>`;
      const btnLogout2 = document.getElementById("btnLogout2");
      btnLogout2.addEventListener("click", () => {
        logoutCurrentUser();
        showSuccess("Você saiu da conta com sucesso!", "Logout", () => {
          window.location.href = "index.html";
        });
      });
    } else {
      userArea.innerHTML = '<div style="font-size:0.95rem;opacity:0.95">Você não está logado. <a href="login.html" style="color: #ffd; text-decoration:underline;">Entrar / Cadastar</a></div>';
    }
  }

  if (buscaForm) {
    renderHistoryFor();

    buscaForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const termo = modeloInput.value.trim();
      if (!termo) {
        showWarning("Digite o modelo e ano do veículo.", "Campo obrigatório");
        return;
      }

      if (currentUsername) {
        await addSearchFor(termo);
        renderHistoryFor();
      }

      // Mostrar loading
      const loadingSpinner = document.getElementById('loadingSpinner');
      if (loadingSpinner) loadingSpinner.style.display = 'flex';
      
      const result = await buscarPecasComChatGPT(termo);
      
      // Ocultar loading
      if (loadingSpinner) loadingSpinner.style.display = 'none';
      
      if (result.ok && result.pecas) {
        exibirPecas(result.pecas, result.carro);
        modeloInput.value = "";
      } else {
        // Quando há erro, não renderiza nada - apenas mostra mensagem de erro
        showError(result.msg || "Erro ao buscar peças", "Erro na busca");
        const pecasComponent = document.getElementById('pecasComponent');
        if (pecasComponent) pecasComponent.style.display = 'none';
        return;
      }
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", async () => {
      if (!currentUsername) {
        showWarning("Faça login para limpar o histórico.", "Não autenticado");
        return;
      }
      showConfirm(
        "Deseja realmente limpar seu histórico de buscas? Esta ação não pode ser desfeita.",
        async () => {
          await clearHistoryFor();
          renderHistoryFor();
          showSuccess("Histórico limpo com sucesso!", "Concluído");
        },
        null,
        "Limpar histórico?"
      );
    });
  }

  const btnClosePecas = document.getElementById("btnClosePecas");
  if (btnClosePecas) {
    btnClosePecas.addEventListener("click", () => {
      const pecasComponent = document.getElementById('pecasComponent');
      if (pecasComponent) {
        pecasComponent.style.display = 'none';
        modeloInput.value = "";
        modeloInput.focus();
      }
    });
  }
});

async function buscarPecasComChatGPT(carroNome) {
  if (!carroNome || carroNome.trim().length === 0) {
    return { ok: false, msg: 'Digite o nome do carro' };
  }

  try {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const pecasContainer = document.getElementById('pecasContainer');
    if (loadingSpinner) loadingSpinner.style.display = 'flex';
    if (pecasContainer) pecasContainer.innerHTML = '';

    const result = await apiCall('/pecas/buscar', {
      method: 'POST',
      body: JSON.stringify({ carroNome: carroNome.trim() })
    });
    
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    
    return result;
  } catch (error) {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    
    return { ok: false, msg: 'Erro ao buscar peças' };
  }
}

function exibirPecas(pecas, carroNome) {
  const container = document.getElementById('pecasContainer');
  const pecasComponent = document.getElementById('pecasComponent');
  
  if (!container || !pecasComponent) return;

  if (!pecas || pecas.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">Nenhuma peça encontrada</p>';
    pecasComponent.style.display = 'block';
    return;
  }

  let html = `
    <div style="margin-bottom: 30px;">
      <h2 style="margin: 0 0 5px 0; font-size: 28px; color: #333;">Peças para ${carroNome}</h2>
      <p style="color: #999; margin: 0; font-size: 14px;">Principais peças de manutenção recomendadas</p>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px;">
  `;

  pecas.forEach((peca, index) => {
    html += `
      <div style="
        background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
        border: 1px solid #e0e0e0;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        transition: all 0.3s ease;
        display: flex;
        flex-direction: column;
      " 
      onmouseover="this.style.boxShadow='0 8px 24px rgba(0, 0, 0, 0.12)'; this.style.transform='translateY(-4px)'"
      onmouseout="this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.08)'; this.style.transform='translateY(0)'">
        <div style="
          background: linear-gradient(135deg, var(--vermelho) 0%, #d63031 100%);
          padding: 16px;
          color: white;
        ">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="
              background: rgba(255,255,255,0.3);
              padding: 4px 10px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: bold;
            ">#${index + 1}</span>
            <span style="font-size: 12px; opacity: 0.9;">Peça essencial</span>
          </div>
          <h3 style="margin: 0; font-size: 18px; font-weight: 700;">${peca.nome}</h3>
        </div>
        
        <div style="padding: 16px; flex-grow: 1; display: flex; flex-direction: column;">
          <p style="
            margin: 0 0 16px 0;
            color: #666;
            font-size: 13px;
            line-height: 1.5;
          ">${peca.descricao}</p>
          
          <div style="margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <p style="margin: 0 0 4px 0; color: #999; font-size: 12px;">Preço médio</p>
              <span style="
                font-size: 24px;
                font-weight: 700;
                color: var(--vermelho);
                background: linear-gradient(135deg, var(--vermelho), #d63031);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
              ">R$ ${peca.preco_medio?.toFixed(2) || '0.00'}</span>
            </div>
            <button 
              onclick="adicionarAoCarrinho(${peca.id}, '${peca.nome}')" 
              style="
                padding: 10px 16px;
                background: linear-gradient(135deg, var(--vermelho) 0%, #d63031 100%);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                font-size: 12px;
                transition: all 0.3s ease;
              "
              onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 12px rgba(220, 48, 49, 0.4)'"
              onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'"
            >
              + Adicionar
            </button>
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
  pecasComponent.style.display = 'block';
}

function adicionarAoCarrinho(id, nome) {
  showSuccess(`${nome} adicionado ao carrinho!`, 'Sucesso');
}
