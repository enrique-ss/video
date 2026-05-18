# 🎬 TikTok Cinema - Planejamento de Desenvolvimento (Estilo Gartic Phone)

Este documento contém o planejamento estruturado para a criação do ecossistema do **TikTok Cinema**, dimensionado para rodar como um projeto de pequeno porte com suporte a no máximo **20 usuários simultâneos**. O fluxo é focado na experiência de um grupo de amigos enviando vídeos anonimamente e pontuando através de palpites, com chat integrado e persistente.

---

## 📊 Quadro Kanban Geral

| 🔴 A Fazer (Backlog) | 🟡 Em Progresso | 🔵 Em Testes / Validação | 🟢 Concluído |
| :--- | :--- | :--- | :--- |
| [TK-01] Sincronização Completa de Estado no Join <br> *(Crítico)* | Nenhuma tarefa em progresso. | Nenhuma tarefa em validação. | Nenhuma tarefa concluída. |
| [TK-02] Controle do Player e Inicialização (Host) <br> *(Crítico)* | | | |
| [TK-03] Tela de Votação e Restrição para o Autor <br> *(Crítico)* | | | |
| [TK-04] Sistema de Pontuação Secreta e Blefe <br> *(Crítico)* | | | |
| [TK-05] Resiliência de Votação (User Disconnect) <br> *(Alto)* | | | |
| [TK-06] Fluxo de Login Estilo Gartic Phone <br> *(Alto)* | | | |
| [TK-07] Persistência de Sessão (LocalStorage) <br> *(Alto)* | | | |
| [TK-08] Limites da Fila e de Acessos Simultâneos <br> *(Médio)* | | | |
| [TK-09] Módulo de Chat Persistente e Modo Silencioso <br> *(Médio)* | | | |
| [TK-10] Ativação e Integração com Banco de Dados <br> *(Médio)* | | | |
| [TK-11] Timer de Votação (15s) e Tela de Rank Final <br> *(Baixo)* | | | |

---

## 🏗️ Estruturas de Dados OBRIGATÓRIAS (Modelos do Sistema)

Para garantir a consistência entre o Frontend e o Backend, a IA desenvolvedora deve seguir estritamente os seguintes contratos de dados:

### 👤 Objeto do Usuário (User)
```json
User {
  "id": "string (uuid ou socket.id original para reconexão)",
  "name": "string (definido obrigatoriamente no input de convidado)",
  "socketId": "string (ID do socket ativo atual, atualizado no reconect)",
  "isHost": "boolean (true apenas para o primeiro usuário da sala)",
  "authMethod": "string ('guest' ou 'tiktok')",
  "tiktokHandle": "string (opcional para futura integração)"
}
```

### 📹 Objeto do Vídeo (Video)
```json
Video {
  "id": "string (uuid ou hash único gerado no backend)",
  "url": "string (link completo do TikTok)",
  "addedBy": "string (userId do participante que enviou o vídeo)",
  "played": "boolean (controle de exibição)"
}
```

> [!IMPORTANT]
> **REGRA DE SEGURANÇA CRÍTICA:** O backend NUNCA deve enviar a propriedade `addedBy` nas emissões de playlist ou de vídeo atual (`syncState`, `currentVideo`). O dono do vídeo deve ser uma informação exclusiva da memória do servidor até a revelação no pódio final.

---

## ⚙️ Máquina de Estados do Jogo (Game States)

O ciclo de vida do servidor deve transitar estritamente entre os seguintes quatro estados:
1. **LOBBY**: Fase inicial. Os usuários entram na sala, conversam no chat livremente e podem adicionar até 5 vídeos cada. O jogo ainda não começou.
2. **PLAYING**: Um vídeo da playlist é reproduzido na tela de todos simultaneamente. O chat continua livre.
3. **VOTING**: Disparado imediatamente após o término do vídeo. Abre o cronômetro de 15 segundos na tela. Os usuários votam em quem acham que enviou o vídeo. O chat entra em "Modo Silencioso".
4. **PODIUM**: Ativado quando todos os vídeos da playlist chegam ao fim. O backend consolida e envia o ranking de pontos. O Host ganha o botão de resetar para o estado de LOBBY.

---

## 🎯 Detalhamento dos Cards

### 🔴 EPIC 1: Regras de Negócio e Segurança de Fluxo (Críticos)

#### 🎫 [TK-01] Sincronização Completa de Estado no Join
* **Descrição:** Sincronizar o estado completo da partida ao conectar ou recarregar a página.
* **Tarefas Técnicas:**
  - [ ] Implementar o listener `socket.on('syncState', (state) => { ... })` no `public/js/app.js`.
  - [ ] Se `state.currentVideo` existir, renderizar o player com o vídeo correspondente.
  - [ ] Se `state.voting.active` for verdadeiro, renderizar a tela de votação com as opções e tempo restante correspondente.
  - [ ] Atualizar a lista de usuários online, o histórico do chat global e a playlist no frontend com os dados recebidos.

---

#### 🎫 [TK-02] Restrição de Controle do Player e Inicialização da Partida (Host)
* **Descrição:** Garantir que apenas o Host (primeiro usuário conectado) possa iniciar a partida e que as permissões de vídeo fiquem bloqueadas ao iniciar.
* **Tarefas Técnicas:**
  - [ ] No backend (`src/index.js`), definir o primeiro usuário a se conectar à sala (`Object.keys(cinemaState.users)[0]`) como o "Host" e atribuir uma propriedade `isHost: true`.
  - [ ] Renderizar o botão "Iniciar Jogo" exclusivamente na interface do Host.
  - [ ] Bloquear o envio de novos vídeos no backend através do evento `addVideo` assim que o Host disparar o evento `startGame`.
  - [ ] Permitir que novos usuários (até o limite de 20) entrem na sala após o jogo começar, sincronizando-os diretamente no estado atual de exibição ou votação, mas sem direito a adicionar vídeos para a rodada em andamento.

---

#### 🎫 [TK-03] Tela de Votação e Restrição para o Autor do Vídeo
* **Descrição:** Controlar a integridade da votação, impedindo votos múltiplos e impedindo o autor do vídeo de votar.
* **Tarefas Técnicas:**
  - [ ] Alterar `cinemaState.voting` no backend para incluir um objeto de rastreamento: `votesTrack: {}` (mapeando `userId` de quem votou para o `votedForUserId` escolhido).
  - [ ] No evento `socket.on('castVote', (votedUserId))` no backend, verificar se o `userId` associado ao socket atual já está presente em `votesTrack` para ignorar votos duplicados.
  - [ ] No momento em que a tela de votação de 15 segundos for ativada, o backend deve verificar quem é o dono do vídeo atual (`video.addedBy`).
  - [ ] Enviar um estado de bloqueio para o frontend do autor do vídeo com a mensagem "Aguardando os outros jogadores...". Ele fica impedido de interagir, clicar nos botões, votar ou pontuar nessa rodada específica.

---

#### 🎫 [TK-04] Sistema de Pontuação Secreta e Bônus de Blefe
* **Descrição:** Mapear a pontuação de forma oculta durante as rodadas e bonificar autores por blefes bem-sucedidos.
* **Tarefas Técnicas:**
  - [ ] Criar uma estrutura de pontuação oculta no estado do servidor: `cinemaState.scores: {}` (mapeando `userId` para `points`).
  - [ ] Ao encerrar o timer de 15 segundos de cada vídeo, o backend deve processar as respostas comparando o `votedForUserId` de cada palpite com o `video.addedBy` real.
  - [ ] Para cada amigo que acertar o palpite, somar `+1` ponto em sua respectiva chave em `scores`. Não enviar nenhum feedback de acerto/erro para o frontend neste momento.
  - [ ] Contabilizar quantos jogadores erraram o palpite (votaram em qualquer outra pessoa além do dono real). Converter essa soma de erros em pontos de bônus (`+1` ponto por erro) e adicionar diretamente para a pontuação do dono do vídeo (`video.addedBy`).
  - [ ] Reter todo o placar e ranking no backend, liberando os dados para a sala apenas quando a playlist de vídeos da rodada for completamente esgotada.

---

### 🟡 EPIC 2: Resiliência & Sincronização em Tempo Real (Altos)

#### 🎫 [TK-05] Resiliência de Votação (User Disconnect)
* **Descrição:** Lidar de forma elegante com a desconexão de usuários e alternância de Hosts no jogo.
* **Tarefas Técnicas:**
  - [ ] Criar uma função unificada de validação de término de voto no backend: `checkVotingCompletion()`.
  - [ ] No evento `disconnect` do socket, se o usuário que saiu for o Host, transferir a propriedade `isHost: true` automaticamente para o próximo usuário da lista e notificar a sala via socket.
  - [ ] Chamar `checkVotingCompletion()` na desconexão para recalcular o total de usuários ativos e encerrar a votação imediatamente se todos os usuários restantes na sala já tiverem votado dentro do tempo de 15 segundos.

---

#### 🎫 [TK-06] Fluxo de Login Estilo Gartic Phone (Visitante vs. TikTok por último)
* **Descrição:** Criar uma tela/modal de login inicial onde o nome de convidado é obrigatório para participar da sala.
* **Tarefas Técnicas:**
  - [ ] Criar uma tela/modal de login (`#login-screen`) que bloqueia a interface principal até que a identificação seja realizada.
  - [ ] Desenvolver prioritariamente a opção "Entrar como Convidado" disponibilizando um campo de texto (input) onde o preenchimento de um nome seja obrigatório para liberar o acesso.
  - [ ] Estruturar a arquitetura para receber futuramente a opção "Entrar com TikTok" (fazer por último), deixando o objeto do usuário preparado com as propriedades `authMethod: 'guest' | 'tiktok'` e `tiktokHandle: string`.
  - [ ] Atribuir ao objeto do usuário os campos necessários para o jogo (`points: 0`, `isHost: false`) e repassar esses dados estruturados al backend no momento do join.

---

#### 🎫 [TK-07] Persistência de Sessão (LocalStorage / Cookies)
* **Descrição:** Garantir a persistência da identidade do usuário através de F5 e oscilações de rede.
* **Tarefas Técnicas:**
  - [ ] Modificar a geração do usuário no frontend para verificar primeiro se existem dados salvos no `localStorage` (ex: `localStorage.getItem('tiktok_cinema_user')`).
  - [ ] Caso exista, carregar a sessão salva e pular a tela de login. Caso contrário, exibir o modal de login para seleção de nome de convidado.
  - [ ] No backend, permitir que o mesmo `userId` se reconecte sob um novo `socket.id` sem perder seus pontos acumulados em `cinemaState.scores`, apenas atualizando o mapeamento de socket ativo.

---

### 🔵 EPIC 3: Banco de Dados, Infraestrutura, Chat & Limites (Médios)

#### 🎫 [TK-08] Limitação da Fila (Até 5 Vídeos) e Controle de Usuários Simultâneos
* **Descrição:** Impor restrições de escala e de quantidade de vídeos para garantir a integridade da sala.
* **Tarefas Técnicas:**
  - [ ] Definir uma constante `MAX_SIMULTANEOUS_USERS = 20` no backend. No evento de conexão inicial (`connection`), validar a quantidade de usuários online. Se atingir o limite, barrar a nova conexão, emitindo um alerta de "sala cheia" e desconectando o socket.
  - [ ] Implementar uma constante `MAX_VIDEOS_PER_USER = 5` no backend.
  - [ ] No evento `addVideo`, verificar se o status do jogo está em "lobby" (não iniciado). Se o jogo já começou, rejeitar o vídeo imediatamente.
  - [ ] Validar se o usuário já atingiu o limite de 5 vídeos enviados na rodada atual antes de inserir a URL na fila de reprodução.

---

#### 🎫 [TK-09] Módulo de Chat Persistente e Modo Silencioso
* **Descrição:** Integração e controle do chat ao vivo, silenciando palpites durante a tela de votação de 15 segundos.
* **Tarefas Técnicas:**
  - [ ] Implementar um container visual fixo para o chat na interface que permaneça visível e ativo durante todas as fases do jogo.
  - [ ] Criar o evento `socket.on('sendMessage', ...)` com validação básica de caracteres no backend e replicação via `io.emit('newMessage')`.
  - [ ] Implementar a lógica do silenciador: No frontend, se a tela de votação de 15 segundos estiver ativa, aplicar uma classe CSS (ex: `filter: blur(4px)`) ou ocultar novas mensagens recebidas no container de chat.
  - [ ] Remover o bloqueio/desfocar o chat para o usuário imediatamente após ele disparar o evento `castVote`, ou de forma geral assim que o timer de 15 segundos zerar.
  - [ ] Armazenar um histórico das últimas 50 mensagens em um array na memória do backend para sincronização no `syncState`.

---

#### 🎫 [TK-10] Ativação e Integração com Banco de Dados (SQLite/Supabase)
* **Descrição:** Salvar o histórico de pontuações de partidas passadas.
* **Tarefas Técnicas:**
  - [ ] Integrar as rotas e eventos de WebSocket para espelhar e inserir dados no banco offline (SQLite) ou online (Supabase) conforme a configuração do ambiente.
  - [ ] Salvar o ranking final consolidado de pontos na tabela correspondente ao término de cada ciclo de jogo para fins de histórico geral de vitórias.

---

### 🟢 EPIC 4: UI/UX, Ciclo do Jogo & Polimento (Baixo)

#### 🎫 [TK-11] Interface do Timer de Votação (15 Segundos) e Tela de Rank Final
* **Descrição:** Exibição elegante do timer e do pódio final de pontuações.
* **Tarefas Técnicas:**
  - [ ] Criar no backend uma contagem regressiva rigorosa de 15 segundos acionada automaticamente pelo evento `videoEnded`. Emitir um tick por segundo para todos os clientes atualizarem uma barra visual de tempo (`timer-fill`).
  - [ ] Durante os 15 segundos, renderizar na tela de votação botões/cards contendo os nomes de todos os usuários da sala que adicionaram vídeos na rodada como opções de voto.
  - [ ] Após o término do último vídeo da playlist, processar o encerramento do ciclo do jogo e emitir o evento `gameFinished` enviando o objeto completo de `scores` ordenado do maior para o menor.
  - [ ] Renderizar um overlay de pódio/ranking final polido com as pontuações e liberar um botão "Jogar Novamente" apenas para o Host, que ao ser clicado limpa as listas de vídeos, zera os scores e reinicia o loop para o estado de lobby.
