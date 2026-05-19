# 📚 Documentação Técnica - Cinema das Guria

Este documento contém o escopo técnico completo, arquitetura, diretrizes de deploy e histórico de desenvolvimento da plataforma.

---

## 🏛️ Arquitetura do Sistema

A aplicação é dividida em três pilares principais:

1.  **Frontend (Vanilla UI/UX):**
    *   Construído inteiramente em HTML5 e CSS3 (Variáveis globais, Flexbox, UI Responsiva).
    *   JavaScript Vanilla gerenciando a máquina de estados (Lobby, Playing, Voting, Podium).
    *   Uso extensivo de *Glassmorphism* (Backdrops, bordas translúcidas) sem dependências externas (como Tailwind).
    *   Renderizador dinâmico de vídeos (Iframes para YouTube/Shorts, e tags `<video>` nativas para MP4/Webm).

2.  **Backend (Node.js & Express):**
    *   Servidor HTTP simples integrado com o `Socket.io` para controle de estado centralizado em memória (variável `cinemaState`).
    *   Arquitetura **Dual-Mode** de Banco de Dados: O arquivo `src/index.js` interage com SQLite3 via módulo `better-sqlite3` para armazenamento rápido local. Quando a variável `APP_MODE` está setada para `online`, o tráfego de banco é redirecionado para a API REST e SDK do Supabase.

3.  **Real-Time (Socket.io):**
    *   Eventos principais: `join`, `syncState`, `stateChange`, `sendMessage`, `addVideo`, `syncTime`.
    *   A liderança é gerida pela tag booleana `isHost: true`. O primeiro usuário a entrar ganha a liderança, que é repassada automaticamente caso ele desconecte.
    *   Garantia de persistência de seção através de emissões silenciosas do evento `join` no trigger interno `connect` do Socket.

---

## 🔒 Autenticação e Banco de Dados (Dual-Mode)

O sistema foi desenhado para ser econômico. Plataformas como o *Render* (plano gratuito) deletam bancos locais como SQLite a cada deploy. Por isso, a plataforma conta com uma lógica inteligente de espelhamento em nuvem.

### Modo Offline (Ambiente de Desenvolvimento)
- `APP_MODE=offline`
- O sistema criará o arquivo `video.sqlite` na raiz.
- O registro local criptografa a senha com `sha256` na hora e faz a inserção.

### Modo Online (Produção Gratuita e Persistente)
- `APP_MODE=online`
- O login e registro conversam nativamente com a engine do **Supabase Auth** (`supabase.auth.signUp()` e `signInWithPassword()`).
- Os metadados, avatares, histórico e coleções (Tabelas: `users`, `rooms`, `history`, `acervo`) são lidos através da API oficial do SDK.
- *Fallback Inteligente:* Se uma conta já existia de um modo anterior onde o Auth nativo não era acionado, a API consulta a tabela pública `users` para garantir que ninguém fique trancado para fora.

---

## 🚀 Guia Oficial de Deploy (Supabase + Render)

Siga estas etapas cuidadosamente para obter um ambiente 100% online sem custos.

### Etapa 1: Banco de Dados na Nuvem (Supabase)
1. Acesse [Supabase.com](https://supabase.com) e crie um projeto novo.
2. Aguarde a inicialização do banco.
3. Vá no **SQL Editor** do Supabase e rode o script de criação oficial:

```sql
-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  avatar TEXT,
  bg_color TEXT DEFAULT '#0a0a0c',
  created_at TEXT
);

-- Tabela de acervo pessoal
CREATE TABLE IF NOT EXISTS acervo (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  url TEXT,
  title TEXT,
  thumbnail TEXT,
  created_at TEXT
);
```
4. **IMPORTANTE:** Vá na seção "Authentication" -> "Providers" do Supabase, certifique-se de que "Email" está ativo e **DESABILITE** a opção "Confirm email" se não quiser obrigar confirmação de e-mail ao criar conta.
5. Em **Project Settings > API**, copie a sua `Project URL`, a sua `anon key` e a sua `service_role secret`.

### Etapa 2: Hospedagem Gratuita Node.js (Render.com)
1. Faça o upload do seu código (sem o `node_modules` nem o `.env`) para o **GitHub**.
2. Crie uma conta no [Render](https://render.com) e conecte seu GitHub.
3. Clique em **New +** e selecione **Web Service**.
4. Selecione seu repositório do "Cinema das Guria".
5. Configure:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. Role a página e adicione as **Environment Variables** (Variáveis de Ambiente):
   - `PORT`: `10000`
   - `APP_MODE`: `online`
   - `SUPABASE_URL`: (Sua Project URL do Supabase)
   - `SUPABASE_ANON_KEY`: (Sua anon key)
   - `SUPABASE_SERVICE_ROLE_KEY`: (Sua service_role key, que permite contornar regras rígidas de segurança (RLS) no backend, evitando o erro de inserção 500 ao tentar criar novos usuários).
7. Clique em **Deploy**! A plataforma subirá e gerará uma URL automática em HTTPS.

---

## 🗺️ Mapa de Tarefas (Kanban Histórico)
As seguintes features estão em andamento ou foram finalizadas na versão atual:

- ✅ **[TK-06 & TK-07] Persistência de Sessão & Arquitetura de Login:** Implementado login com gravação no `localStorage` (`cinema_das_guria_user`). O fluxo garante que recarregar a página mantém as cores e sessões ativas (Sessão Fantasma resolvida via listener do evento `connect`).
- ✅ **[TK-09] Módulo de Chat Dinâmico:** Chat global integrado. Inclui parser automático que renderiza blocos de `<img>` caso a URL detectada seja de GIFs hospedados no Giphy.
- ✅ **[TK-01] Máquina de Estados:** Controle centralizado. Sempre que o usuário avança (LOBBY > PLAYING), a tela troca. Sincronização estrita de player baseada no ID host (Se o host já está rodando, novas instâncias não recriam o `renderVideoPlayer` se não houver troca de vídeos).
- ⬜ **[TK-02] Placeholder:** Preparação para Sistema de Votos. (Lógica de blefe em standby na base original).
- ⬜ **[TK-11] Ranking e Resultados:** Pódio final ao esgotar fila.
