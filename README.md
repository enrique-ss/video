# Cinema das Guria

Plataforma de watch party em tempo real para assistir a vídeos de forma sincronizada. Conta com sala de exibição integrada com suporte a links do YouTube, TikTok e arquivos MP4, chat interativo com reações e busca de GIFs via API do Giphy, acervo pessoal de mídias e suporte a operação híbrida (offline via SQLite ou online via Supabase).

## Como rodar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Crie o arquivo `.env` a partir do modelo:
   ```env
   APP_MODE=offline
   PORT=3002
   ```
3. Inicialize o banco de dados e rode a aplicação:
   ```bash
   npm run setup
   npm run dev
   ```
4. Abra `http://localhost:3002` no navegador.

## Scripts

- `npm run setup`: Reseta o banco de dados SQLite local.
- `npm run dev`: Inicia a aplicação em modo de desenvolvimento.
- `npm start`: Inicia o servidor em modo de produção.

## Documentação e Stack

### Tecnologias
- **Backend:** Node.js, Express.js, Socket.io, SQLite / Supabase Client.
- **Frontend:** HTML5, CSS3, JavaScript puro, API do Giphy.

### Documentação Adicional
Consulte o arquivo [DOCUMENTATION.md](DOCUMENTATION.md) para obter detalhes de implantação e arquitetura.
