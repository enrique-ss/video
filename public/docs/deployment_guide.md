# 🌐 TikTok Cinema - Guia de Deploy e Compartilhamento Online

Este guia apresenta as duas melhores formas de colocar o seu projeto do **TikTok Cinema** online para jogar com seus amigos: **instantaneamente para testes rápidos** ou de forma **definitiva e gratuita na nuvem**.

---

## ⚡ Opção 1: Compartilhamento Instantâneo (Para Jogar Agora com Amigos)
Esta é a forma mais rápida de testar. Você roda o servidor na sua máquina e gera um link seguro temporário para seus amigos entrarem (pelo celular ou computador deles), sem precisar criar contas em plataformas de nuvem ou subir código para o GitHub.

### Passo a Passo:
1. Mantenha o seu servidor rodando no terminal normalmente com:
   ```bash
   npm run dev
   ```
2. Abra **um novo terminal** na mesma pasta do projeto e execute o comando abaixo (usando o `localtunnel` grátis):
   ```bash
   npx localtunnel --port 3002
   ```
3. O terminal gerará um link público parecido com:
   `https://curious-cats-jump.loca.lt`
4. **Pronto!** Envie esse link para seus amigos. Eles poderão acessar o jogo diretamente de seus celulares e interagir com o chat e o player em tempo real.

> [!TIP]
> Caso o localtunnel peça uma senha/IP para liberar o acesso, informe o seu IP público externo (que pode ser encontrado digitando "meu ip" no Google).
>
> Alternativamente, você pode usar o **ngrok** rodando:
> `npx ngrok http 3002`

---

## 🚀 Opção 2: Deploy Definitivo na Nuvem (Render.com - Grátis)
O Render é uma plataforma de nuvem fantástica que suporta Node.js e WebSockets nativamente em sua camada gratuita. Como o projeto já possui o arquivo `infra/render.yaml` configurado, o deploy é praticamente automático!

### Passo 1: Subir o Código para o GitHub
1. Inicialize o repositório Git local e faça o commit das suas alterações:
   ```bash
   git init
   git add .
   git commit -m "feat: login, cadastro em sqlite e layout mobile-first"
   ```
2. Crie um novo repositório **privado ou público** no seu [GitHub](https://github.com).
3. Vincule o repositório local ao GitHub e envie o código:
   ```bash
   git remote add origin <URL-DO-SEU-REPOSITORIO-NO-GITHUB>
   git branch -M main
   git push -u origin main
   ```

### Passo 2: Criar a Conta e Fazer o Deploy no Render
1. Acesse o site do [Render.com](https://render.com) e crie uma conta (de preferência fazendo login com o seu GitHub).
2. No painel do Render, clique no botão **New +** no canto superior direito e selecione **Blueprint**.
   *(O Render Blueprint lerá o arquivo `infra/render.yaml` e criará todos os recursos configurados de uma vez só!)*
3. Conecte sua conta do GitHub e selecione o repositório do seu projeto.
4. Dê um nome ao seu blueprint (ex: `tiktok-cinema`) e clique em **Apply**.
5. O Render começará a compilar e colocar a sua aplicação online. Ao final, ele gerará uma URL definitiva grátis com suporte HTTPS (SSL)!

---

## 💾 Nota Importante sobre Persistência de Dados (Supabase vs SQLite)

* **No Computador Local**: O SQLite (`video.sqlite`) é excelente porque grava os arquivos localmente no seu disco de forma permanente.
* **Na Nuvem (Render Grátis)**: Os servidores do plano gratuito do Render possuem discos *efêmeros* (temporários). Isso significa que toda vez que a aplicação reiniciar (por exemplo, após um tempo inativa ou a cada novo deploy), o arquivo `video.sqlite` será resetado e as contas de usuário serão limpas.

### 💡 A Solução Definitiva (Grátis):
Para ter persistência permanente na nuvem sem gastar nada, utilize o **Supabase** (que já está 100% suportado no código!).
1. Crie um projeto gratuito no [Supabase](https://supabase.com).
2. Pegue a `SUPABASE_URL` e a `SUPABASE_ANON_KEY` no painel de configurações de API do Supabase.
3. No painel do Render, vá nas configurações do seu Web Service, acesse a aba **Environment** e adicione essas chaves como variáveis de ambiente, além de definir `APP_MODE = online`.
4. O servidor fará a transição automática para salvar os dados de forma permanente no banco de dados na nuvem!
