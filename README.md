# Cinema das Guria 🎬
**Uma plataforma premium e imersiva para exibição sincronizada de vídeos em tempo real.**

## 🚀 O que é?
O **Cinema das Guria** é uma aplicação web de consumo de vídeo sincronizado (Watch Party) ideal para grupos de amigos assistirem a conteúdos do YouTube, MP4 e outras plataformas de forma perfeitamente sincronizada em tempo real. Com uma interface moderna, chat ao vivo e sistema de perfil, a plataforma traz a experiência do cinema para dentro da sua sala virtual.

## ✨ Funcionalidades Principais
- **Sincronização Perfeita (Watch Party):** O vídeo, play/pause e tempo de reprodução são perfeitamente sincronizados entre todos os membros da sala, sob a liderança do Host.
- **Design Premium & Glassmorphism:** Uma interface moderna, escura (Dark Mode), minimalista e 100% responsiva (Mobile-First) com efeitos de vidro, desfoque e tipografia elegante.
- **Autenticação Dupla (Dual-Mode):** Sistema híbrido de contas. Usa SQLite no modo offline/desenvolvimento e migra de forma totalmente transparente para o **Supabase Auth** no modo online/produção.
- **Chat ao Vivo com Giphy:** Bate-papo em tempo real equipado com suporte a envio de links diretos e conversão automática de GIFs para imagens renderizadas in-line.
- **Personalização de Perfil:** Os usuários podem definir cores temáticas, envio de avatares com compressão do lado do cliente e nomes personalizados para aparecerem em destaque na sala.
- **Acervo Pessoal:** Biblioteca pessoal embutida, permitindo que cada usuário armazene e acesse rapidamente seus links favoritos para adicionar na fila do cinema.

## 🛠️ Tecnologias Utilizadas
- **Frontend:** HTML5, Vanilla JavaScript, CSS Puro (Custom Variables e Flexbox/Grid).
- **Backend:** Node.js, Express.js.
- **Tempo Real:** Socket.io (Comunicação de eventos, sincronização do player e chat).
- **Bancos de Dados:** SQLite (Offline/Local) & Supabase PostgreSQL (Produção).
- **Tratamento de Imagem:** Canvas API (Compressão de avatares direto no navegador).

## 🚀 Instalação e Execução (Local)

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/seu-usuario/video.git
   cd video
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as Variáveis de Ambiente:**
   Renomeie o arquivo `.env.exemple` para `.env` e ajuste:
   ```env
   PORT=3000
   APP_MODE=offline
   ```

4. **Inicie o servidor:**
   ```bash
   npm run dev
   ```
   Acesse em `http://localhost:3000`.

## ☁️ Deploy de Produção (Render + Supabase)

O aplicativo foi projetado para rodar gratuitamente na nuvem. Consulte o arquivo `DOCUMENTATION.md` para visualizar o guia completo de deploy contendo instruções de configuração no Supabase (Banco e Auth) e hospedagem no Render.

---
*Feito por [@enrique.json](https://instagram.com/enrique.json)*
