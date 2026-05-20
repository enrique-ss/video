# Cinema das Guria

Plataforma de **watch party** em tempo real: fila de vídeos sincronizada, chat, perfil personalizado, acervo pessoal e modos de jogo (Palpitar / Assistir).

---

## Modos de operação

O mesmo código roda em dois modos. Você escolhe pelo arquivo `.env`:

| | **Offline** (teste local) | **Online** (produção) |
|---|---------------------------|------------------------|
| **Quando usar** | Desenvolver e testar na sua máquina | Render, VPS ou qualquer servidor público |
| **Variável** | `APP_MODE=offline` | `APP_MODE=online` |
| **Banco de dados** | SQLite em `data/video.sqlite` | Supabase (PostgreSQL) |
| **Login / senha** | App grava hash SHA256 no SQLite | Supabase Auth (e-mail + senha na nuvem) |
| **ID do usuário** | `usr_a1b2c3...` (gerado localmente) | UUID do Supabase Auth |
| **Sessão na API** | `user_id` na query/body | Header `Authorization: Bearer <token>` |
| **Internet** | Não precisa de Supabase | Precisa de Supabase + deploy |
| **Arquivo de exemplo** | `.env.offline.exemple` | `.env.exemple` (seção online) |

A sala ao vivo (Socket.io), o player, o chat e a votação funcionam **igual nos dois modos**. Só mudam **onde** perfil, senha e acervo são guardados.

Documentação completa: **[DOCUMENTATION.md](./DOCUMENTATION.md)**

---

## Rodar offline (100% local)

Ideal para testar cadastro, perfil, acervo e sala **antes** de publicar.

```powershell
cd video
npm install
copy .env.offline.exemple .env
```

Confirme no `.env`:

```env
APP_MODE=offline
PORT=3002
```

Não preencha `SUPABASE_URL` nem chaves do Supabase.

```powershell
npm rebuild better-sqlite3   # só se o SQLite não subir
npm run dev
```

Abra **http://localhost:3002**. No terminal:

```text
Cinema das Guria → http://localhost:3002 (offline / SQLite)
Banco local: ...\data\video.sqlite
```

- Zerar banco local: `npm run db:reset`
- Dados ficam só no seu PC (arquivo `data/video.sqlite`)

---

## Rodar online (Supabase + servidor)

1. Crie projeto no [Supabase](https://supabase.com).
2. Cole o SQL de **`supabase/schema.sql`** no SQL Editor (uma vez).
3. Em **Authentication → Providers**, ative **Email** (desative confirmação de e-mail se quiser cadastro imediato).
4. Copie **Project URL**, **anon key** e **service_role key** (Settings → API).
5. Configure `.env` ou variáveis no Render:

```env
APP_MODE=online
PORT=3002
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

6. Local com nuvem:

```powershell
npm start
```

7. Produção: faça deploy no [Render](https://render.com) (ou similar) com as mesmas variáveis. Build: `npm install` · Start: `npm start`.

Guia passo a passo: **[DOCUMENTATION.md § Deploy](./DOCUMENTATION.md#deploy-online-render--supabase)**

---

## Funcionalidades

- Watch party sincronizada (host controla a fila)
- YouTube, TikTok e MP4 na fila
- Chat, reações e GIFs (Giphy ou fallback)
- Perfil: avatar (compressão no navegador) e cor de fundo por usuário
- Acervo pessoal de links (persistente por conta)
- Modos **Palpitar** (votação / blefe) e **Assistir** (só fila)
- Até 15 usuários na sala

---

## Estrutura rápida

```
video/
├── supabase/schema.sql   # SQL oficial (Supabase)
├── data/video.sqlite     # Banco offline (criado automaticamente)
├── src/db.js             # Toda leitura/gravação de users + acervo
├── public/js/app.js      # Interface
└── DOCUMENTATION.md      # Detalhes técnicos online × offline
```

---

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor com reload (`--watch`) |
| `npm start` | Produção / teste simples |
| `npm run db:reset` | Apaga e recria SQLite (só offline) |
| `npm run setup` | Alias para reset do SQLite |

---

## Variáveis de ambiente

| Variável | Offline | Online |
|----------|---------|--------|
| `APP_MODE` | `offline` | `online` |
| `PORT` | opcional (padrão `3002`) | idem |
| `SUPABASE_URL` | vazio | obrigatório |
| `SUPABASE_ANON_KEY` | vazio | obrigatório |
| `SUPABASE_SERVICE_ROLE_KEY` | vazio | **obrigatório** no Render (evita erro de RLS em `users`) |
| `GIPHY_API_KEY` | opcional | opcional |

Se `APP_MODE=online` mas faltar URL/chaves do Supabase, o app **cai para offline** automaticamente.

---

*Feito por [@enrique.json](https://instagram.com/enrique.json)*
