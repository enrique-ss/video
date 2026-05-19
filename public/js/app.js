const socket = io();

// Load saved custom background color immediately
const savedBg = localStorage.getItem('cinema_das_guria_bg');
if (savedBg) {
    document.documentElement.style.setProperty('--bg-dark', savedBg);
}

// Configurações globais
const ENV = window.ENV || { TIKTOK_LOGIN_ENABLED: false };

// Estrutura de dados do usuário (User)
let myUser = {
    id: '',
    name: '',
    socketId: '',
    isHost: false,
    authMethod: 'guest',
    tiktokHandle: '',
    color: '',
    avatar: null
};

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const tiktokUrlInput = document.getElementById('tiktok-url');
const addVideoBtn = document.getElementById('add-video-btn');
const headerInputWrapper = document.querySelector('.header-input-wrapper');
const videoWrapper = document.getElementById('video-wrapper');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const playlistItems = document.getElementById('playlist-items');
const votingOverlay = document.getElementById('voting-overlay');
const resultsOverlay = document.getElementById('results-overlay');
const votingOptions = document.getElementById('voting-options');
const votingStatus = document.getElementById('voting-status');
const startGameBtn = document.getElementById('start-game-btn');
const playAgainBtn = document.getElementById('play-again-btn');
const currentUserTag = document.getElementById('current-user-tag');

// --- DUAL AUTH (LOGIN / REGISTER) ELEMENTS ---
const registerOverlay = document.getElementById('register-overlay');

const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const btnSubmitLogin = document.getElementById('btn-submit-login');
const linkToRegister = document.getElementById('link-to-register');

const registerName = document.getElementById('register-name');
const registerEmail = document.getElementById('register-email');
const registerPassword = document.getElementById('register-password');
const btnSubmitRegister = document.getElementById('btn-submit-register');
const linkToLogin = document.getElementById('link-to-login');

// Sliding tabs elements
const tabLoginBtn = document.getElementById('tab-login-btn');
const tabRegisterBtn = document.getElementById('tab-register-btn');
const authTabSlider = document.getElementById('auth-tab-slider');
const authFormsSlider = document.getElementById('auth-forms-slider');

function switchToTab(tab) {
    if (tab === 'login') {
        if (authTabSlider) authTabSlider.style.transform = 'translateX(0)';
        if (authFormsSlider) authFormsSlider.style.transform = 'translateX(0)';
        if (tabLoginBtn) tabLoginBtn.classList.add('active');
        if (tabRegisterBtn) tabRegisterBtn.classList.remove('active');
    } else {
        if (authTabSlider) authTabSlider.style.transform = 'translateX(100%)';
        if (authFormsSlider) authFormsSlider.style.transform = 'translateX(-50%)';
        if (tabLoginBtn) tabLoginBtn.classList.remove('active');
        if (tabRegisterBtn) tabRegisterBtn.classList.add('active');
    }

    // Dynamic height transition (Safe, pre-calculated values to avoid DOM layout offset squishing)
    const card = document.querySelector('.auth-card');
    if (card) {
        if (tab === 'login') {
            card.style.height = '350px';
        } else {
            card.style.height = '500px';
        }
    }
}

if (tabLoginBtn) {
    tabLoginBtn.addEventListener('click', () => switchToTab('login'));
}
if (tabRegisterBtn) {
    tabRegisterBtn.addEventListener('click', () => switchToTab('register'));
}

// Toggle between Login and Register Overlays (Slide effect)
if (linkToRegister) {
    linkToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        switchToTab('register');
    });
}

if (linkToLogin) {
    linkToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        switchToTab('login');
    });
}

// Função para reduzir o tamanho e comprimir fotos de perfil antes de enviar
function compressImageFile(file, maxWidth, maxHeight, quality, callback) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Mantém a proporção da imagem ao redimensionar
            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Transforma em JPEG compactado de tamanho reduzido (menos de 5KB-10KB)
            const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            callback(compressedBase64);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Helper para gerar o HTML do avatar (tanto emoji quanto imagem em base64/URL)
function getAvatarHtml(avatar, color) {
    if (!avatar) {
        return `<span style="flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: rgba(255,255,255,0.05); border-radius: 50%; border: 1.5px solid ${color || '#00f2ea'};"></span>`;
    }
    const isImage = avatar.startsWith('http') || avatar.startsWith('data:image');
    if (isImage) {
        return `<img src="${avatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1.5px solid ${color || '#00f2ea'}; flex-shrink: 0;">`;
    } else {
        return `<span style="font-size: 1.4rem; line-height: 1; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: rgba(255,255,255,0.05); border-radius: 50%; border: 1.5px solid ${color || '#00f2ea'};">${avatar}</span>`;
    }
}

// Submit Register Form
let registrationAvatar = null;

const registerAvatarPreview = document.getElementById('register-avatar-preview');
const registerAvatarFile = document.getElementById('register-avatar-file');
const btnTriggerRegisterFile = document.getElementById('btn-trigger-register-file');
const registerPreviewPlaceholder = document.getElementById('register-preview-placeholder');
const registerPreviewImg = document.getElementById('register-preview-img');

if (registerAvatarPreview) {
    registerAvatarPreview.addEventListener('click', () => registerAvatarFile.click());
}
if (btnTriggerRegisterFile) {
    btnTriggerRegisterFile.addEventListener('click', () => registerAvatarFile.click());
}

if (registerAvatarFile) {
    registerAvatarFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        compressImageFile(file, 128, 128, 0.7, (base64Url) => {
            registrationAvatar = base64Url;

            // Atualiza miniatura de visualização
            registerPreviewImg.src = base64Url;
            registerPreviewImg.style.display = 'block';
            registerPreviewPlaceholder.style.display = 'none';
        });
    });
}


btnSubmitRegister.addEventListener('click', async () => {
    const name = registerName.value.trim();
    const email = registerEmail.value.trim();
    const password = registerPassword.value;

    if (!name || !email || !password) {
        alert('Por favor, preencha todos os campos!');
        return;
    }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, avatar: registrationAvatar })
        });
        const data = await res.json();
        
        if (data.error) {
            alert(data.error);
        } else if (data.success) {
            completeLogin(data.user.name, data.user.id, data.user.avatar, null, data.user.bg_color);
        }
    } catch (err) {
        console.error(err);
        alert('Erro ao registrar usuário. Tente novamente!');
    }
});

// Submit Login Form
btnSubmitLogin.addEventListener('click', async () => {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!email || !password) {
        alert('Por favor, preencha e-mail e senha!');
        return;
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (data.error) {
            alert(data.error);
        } else if (data.success) {
            completeLogin(data.user.name, data.user.id, data.user.avatar, null, data.user.bg_color);
        }
    } catch (err) {
        console.error(err);
        alert('Erro ao realizar login. Tente novamente!');
    }
});

// --- SESSION CONTROL (TK-06 & TK-07) ---
const savedUser = localStorage.getItem('cinema_das_guria_user');
if (savedUser) {
    try {
        myUser = JSON.parse(savedUser);
        completeLogin(myUser.name, myUser.id, myUser.avatar, myUser.color, myUser.bg_color);
    } catch (err) {
        console.error('Falha ao restaurar sessão de usuário:', err);
        loginOverlay.classList.remove('hidden');
        switchToTab('login');
    }
} else {
    loginOverlay.classList.remove('hidden');
    switchToTab('login');
}

// Evento de clique no nome do usuário para abrir o menu de opções
if (currentUserTag) {
    currentUserTag.addEventListener('click', () => {
        const modal = document.getElementById('options-modal');
        if (modal) {
            modal.classList.remove('hidden');
            const mainMenu = document.getElementById('options-main-menu');
            const acervoPanel = document.getElementById('options-acervo-panel');
            const editPanel = document.getElementById('options-edit-panel');
            const card = document.getElementById('options-modal-card');
            if (mainMenu) mainMenu.classList.remove('hidden');
            if (acervoPanel) acervoPanel.classList.add('hidden');
            if (editPanel) editPanel.classList.add('hidden');
            if (card) card.style.width = '180px';
        }
    });
}

function completeLogin(name, id, avatar, color, bg_color) {
    myUser.name = name;
    if (id) {
        myUser.id = id;
    } else if (!myUser.id) {
        myUser.id = 'usr_' + Math.random().toString(36).substr(2, 9);
    }
    if (avatar) {
        myUser.avatar = avatar;
    }
    if (color) {
        myUser.color = color;
    } else if (!myUser.color) {
        myUser.color = '#' + Math.floor(Math.random()*16777215).toString(16);
    }
    if (bg_color) {
        myUser.bg_color = bg_color;
    } else if (!myUser.bg_color) {
        myUser.bg_color = '#0a0a0c';
    }

    localStorage.setItem('cinema_das_guria_user', JSON.stringify(myUser));
    
    // Aplicar a cor de fundo do site de cada usuário
    document.documentElement.style.setProperty('--bg-dark', myUser.bg_color);
    localStorage.setItem('cinema_das_guria_bg', myUser.bg_color);

    socket.emit('join', myUser);

    if (loginOverlay) loginOverlay.style.opacity = '0';
    if (registerOverlay) registerOverlay.style.opacity = '0';
    setTimeout(() => {
        if (loginOverlay) loginOverlay.classList.add('hidden');
        if (registerOverlay) registerOverlay.classList.add('hidden');
    }, 300);

    updateCurrentUserTag();
}

function updateCurrentUserTag() {
    if (currentUserTag) {
        const isImage = myUser.avatar && (myUser.avatar.startsWith('http') || myUser.avatar.startsWith('data:image'));
        const avatarHtml = myUser.avatar 
            ? (isImage 
                ? '' // Fotos do dispositivo/link não aparecem no cabeçalho
                : `<span style="font-size: 0.75rem; margin-right: 4px;">${myUser.avatar}</span>`) 
            : '';
        currentUserTag.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; gap: 4px;">${avatarHtml}<span>${myUser.name}</span></div>`;
    }
}

// --- VIDEO FORM SUBMISSION ---
addVideoBtn.addEventListener('click', () => {
    const url = tiktokUrlInput.value.trim();
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        socket.emit('addVideo', url);
        tiktokUrlInput.value = '';
    } else {
        alert('Por favor, insira um link de vídeo válido (http:// ou https://)!');
    }
});

// Universal Media Player (TK-02)
function renderVideoPlayer(url, isHost) {
    videoWrapper.innerHTML = '';
    
    // 1. YouTube & YouTube Shorts
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        let videoId = '';
        if (url.includes('shorts/')) {
            const match = url.match(/\/shorts\/([^"&?\/\s]{11})/);
            videoId = match ? match[1] : '';
        } else if (url.includes('youtu.be/')) {
            const match = url.match(/youtu\.be\/([^"&?\/\s]{11})/);
            videoId = match ? match[1] : '';
        } else {
            const match = url.match(/[?&]v=([^"&?\/\s]{11})/);
            videoId = match ? match[1] : '';
        }
        
        if (videoId) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&controls=1`;
            iframe.width = '100%';
            iframe.height = '100%';
            iframe.style.borderRadius = '14px';
            iframe.style.border = 'none';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            iframe.allowFullscreen = true;
            videoWrapper.appendChild(iframe);
        } else {
            renderGenericIframe(url);
        }
    } 
    // 3. Native MP4 Video File
    else if (url.match(/\.(mp4|webm|ogg|mov)(?:$|\?)/i)) {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.autoplay = true;
        video.loop = true;
        // Playsinline para rodar sem abrir em tela cheia nativa no iOS Safari (Crucial para Mobile-First!)
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.borderRadius = '14px';
        videoWrapper.appendChild(video);
    } 
    // 4. Fallback Generic Iframe Embed
    else {
        renderGenericIframe(url);
    }

    // Skip/Trigger Voting button exclusively shown to the Host (TK-02)
    if (isHost) {
        const finishBtn = document.createElement('button');
        finishBtn.innerText = 'Próximo / Iniciar Votação ➔';
        finishBtn.className = 'finish-video-btn';
        finishBtn.onclick = () => socket.emit('videoEnded');
        videoWrapper.appendChild(finishBtn);
    }
}

function renderGenericIframe(url) {
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.gap = '10px';
    container.style.padding = '10px';
    container.style.textAlign = 'center';

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.width = '100%';
    iframe.style.height = '70%';
    iframe.style.borderRadius = '10px';
    iframe.style.border = 'none';
    iframe.allowFullscreen = true;
    
    const fallbackText = document.createElement('p');
    fallbackText.innerHTML = `Player externo carregado. Caso dê erro, clique abaixo:`;
    fallbackText.style.fontSize = '0.65rem';
    fallbackText.style.opacity = '0.6';
    
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.innerText = 'Abrir vídeo ➔';
    link.style.display = 'inline-block';
    link.style.padding = '6px 12px';
    link.style.background = 'var(--accent-cyan)';
    link.style.color = '#000';
    link.style.fontWeight = '700';
    link.style.borderRadius = '6px';
    link.style.textDecoration = 'none';
    link.style.fontSize = '0.75rem';
    
    container.appendChild(iframe);
    container.appendChild(fallbackText);
    container.appendChild(link);
    videoWrapper.appendChild(container);
}



// --- HOST START & RESET PARTY COMMANDS ---
startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

playAgainBtn.addEventListener('click', () => {
    socket.emit('resetGame');
});

// --- STATE MACHINE SYNCING SYSTEM (TK-01) ---
socket.on('syncState', (state) => {
    // console.log('Sincronização de Estado recebida:', state);
    
    const serverMe = state.users.find(u => u.id === myUser.id);
    if (serverMe) {
        myUser.isHost = serverMe.isHost;
        myUser.color = serverMe.color;
        myUser.name = serverMe.name;
        myUser.avatar = serverMe.avatar || null;
        updateCurrentUserTag();
    }

    // Toggle start game button inside Header (Top) exclusively for Host
    if (state.status === 'LOBBY' && myUser.isHost) {
        startGameBtn.style.display = 'block';
    } else {
        startGameBtn.style.display = 'none';
    }

    // Oculta a opção de Acervo quando a partida já começou
    if (openAcervoBtn) {
        if (state.status === 'LOBBY') {
            openAcervoBtn.style.display = 'flex';
        } else {
            openAcervoBtn.style.display = 'none';
            // Se o usuário estiver com o acervo aberto quando o host inicia, fecha o modal
            if (optionsModal && !optionsModal.classList.contains('hidden') && optionsAcervoPanel && !optionsAcervoPanel.classList.contains('hidden')) {
                optionsModal.classList.add('hidden');
            }
        }
    }

    // Block video additions outside lobby and hide it during active game states
    if (state.status === 'LOBBY') {
        tiktokUrlInput.disabled = false;
        addVideoBtn.disabled = false;
        if (headerInputWrapper) headerInputWrapper.style.display = 'flex';
    } else if (state.status === 'PODIUM') {
        tiktokUrlInput.disabled = true;
        addVideoBtn.disabled = true;
        if (headerInputWrapper) headerInputWrapper.style.display = 'flex';
    } else {
        tiktokUrlInput.disabled = true;
        addVideoBtn.disabled = true;
        if (headerInputWrapper) headerInputWrapper.style.display = 'none';
    }

    // Overlays triggers
    if (state.status === 'VOTING') {
        votingOverlay.classList.remove('hidden');
    } else {
        votingOverlay.classList.add('hidden');
    }

    if (state.status === 'PODIUM') {
        resultsOverlay.classList.remove('hidden');
        if (myUser.isHost) {
            playAgainBtn.style.display = 'block';
        }
    } else {
        resultsOverlay.classList.add('hidden');
        playAgainBtn.style.display = 'none';
    }

    // Video Player execution
    if (state.status === 'PLAYING' && state.currentVideo) {
        renderVideoPlayer(state.currentVideo.url, myUser.isHost);
    } else if (state.status === 'LOBBY') {
        videoWrapper.innerHTML = `
            <div id="video-placeholder">
                <p>Aguardando cinema iniciar...</p>
                <small>Adicione links no cabeçalho acima!</small>
            </div>
        `;
    } else if (state.status === 'VOTING') {
        videoWrapper.innerHTML = `
            <div id="video-placeholder">
                <p>Fase de Palpites! 🤫</p>
                <small>Quem você acha que escolheu o último vídeo?</small>
            </div>
        `;
    } else if (state.status === 'PODIUM') {
        videoWrapper.innerHTML = `
            <div id="video-placeholder">
                <p>Cinema Encerrado 🏆</p>
                <small>Confira os vencedores no pódio final!</small>
            </div>
        `;
    }

    // Sync playlist count indicator inside Chat Header Slim
    document.getElementById('queue-count').innerText = state.playlist.length;
    
    // Sync simplified playlist queue list
    if (playlistItems) {
        playlistItems.innerHTML = '';
        if (state.playlist.length === 0) {
            playlistItems.innerHTML = '<li class="empty-list">Fila de reprodução vazia</li>';
        } else {
            state.playlist.forEach((item, index) => {
                const li = document.createElement('li');
                li.innerHTML = `<span>🎬 Vídeo #${index + 1} na Fila</span> <span>Pronto</span>`;
                playlistItems.appendChild(li);
            });
        }
    }

    // Sync online users count in top banner
    document.getElementById('online-count').innerText = `${state.users.length} online`;

    // Sync host indicator next to online status
    const hostUser = state.users.find(u => u.isHost);
    const hostIndicator = document.getElementById('host-indicator');
    if (hostIndicator) {
        if (hostUser) {
            hostIndicator.innerHTML = `👑 ${hostUser.name}`;
            hostIndicator.style.display = 'inline';
        } else {
            hostIndicator.style.display = 'none';
        }
    }

    // Sync live chat logs
    chatMessages.innerHTML = '';
    state.chatHistory.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message';
        div.style.marginBottom = '10px';
        div.style.display = 'flex';
        div.style.alignItems = 'flex-start';
        div.style.gap = '8px';

        const avatarHtml = getAvatarHtml(msg.avatar, msg.color);

        // Mesma lógica do newMessage: detecta GIF e renderiza como imagem
        let contentHtml = '';
        const trimmedText = msg.text.trim();
        if (trimmedText.startsWith('http') && (trimmedText.includes('giphy.com') || trimmedText.includes('.gif'))) {
            contentHtml = `<img src="${trimmedText}" alt="GIF" style="max-width: 140px; max-height: 140px; border-radius: 8px; margin-top: 4px; border: 1px solid var(--card-border); box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: block;">`;
        } else {
            contentHtml = `<span class="msg-text" style="word-break: break-all; font-size: 0.72rem; line-height: 1.4; color: #e4e4e7;">${msg.text}</span>`;
        }

        div.innerHTML = `
            ${avatarHtml}
            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left;">
                <span class="msg-user" style="color:${msg.color}; font-weight: 700; font-size: 0.72rem; line-height: 1.1; margin-top: 1px;">${msg.user}</span>
                ${contentHtml}
            </div>
        `;
        chatMessages.appendChild(div);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// State triggers re-join State Sync
socket.on('stateChange', (state) => {
    socket.emit('join', myUser); 
});

// --- VOTING SYSTEM AND SILENT CHAT (TK-03, TK-04 & TK-09) ---
socket.on('startVoting', ({ timer, authorId, options }) => {
    votingOverlay.classList.remove('hidden');
    votingOptions.innerHTML = '';
    votingStatus.innerText = 'Aguardando palpites...';

    // Blur chat log stream
    chatMessages.classList.add('silent');

    // Block video owner from voting
    if (myUser.id === authorId) {
        votingStatus.innerHTML = '<strong style="color: #ff0050; font-size:0.75rem;">Você enviou este vídeo! Aguardando o palpite dos amigos... 🤫</strong>';
        return;
    }

    // Draw choices buttons
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'vote-btn';
        btn.innerText = opt.name;
        btn.onclick = () => {
            socket.emit('castVote', opt.id);
            votingOptions.querySelectorAll('button').forEach(b => b.disabled = true);
            votingStatus.innerText = 'Votado em ' + opt.name + '!';

            // Unblur chat for voting player immediately
            chatMessages.classList.remove('silent');
        };
        votingOptions.appendChild(btn);
    });
});

// Sync countdown timer tick
socket.on('votingTick', (time) => {
    const timerFill = document.querySelector('.timer-fill');
    if (timerFill) {
        const percentage = (time / 15) * 100;
        timerFill.style.width = percentage + '%';
    }
});

// Update vote completion progress
socket.on('votingProgress', ({ votesReceived, totalUsers }) => {
    if (votingOverlay.classList.contains('hidden')) return;
    const statusText = document.getElementById('voting-status');
    if (statusText && !statusText.innerHTML.includes('enviou este vídeo')) {
        statusText.innerText = `Aguardando palpites... (${votesReceived}/${totalUsers})`;
    }
});

// Display final scores on podium
socket.on('gameFinished', (sortedRanking) => {
    votingOverlay.classList.add('hidden');
    resultsOverlay.classList.remove('hidden');

    chatMessages.classList.remove('silent');

    const winnerReveal = document.getElementById('winner-reveal');
    winnerReveal.innerHTML = '';

    sortedRanking.forEach((player, index) => {
        const playerRow = document.createElement('div');
        playerRow.className = index === 0 ? 'podium-row first-place' : 'podium-row';
        
        let medal = '';
        if (index === 0) medal = '🥇 ';
        else if (index === 1) medal = '🥈 ';
        else if (index === 2) medal = '🥉 ';
        else medal = `${index + 1}. `;

        playerRow.innerHTML = `
            <span>${medal}${player.name}</span>
            <strong>${player.points} pts</strong>
        `;
        winnerReveal.appendChild(playerRow);
    });

    if (myUser.isHost) {
        playAgainBtn.style.display = 'block';
    }
});

// Clear rounds triggers
socket.on('gameReset', () => {
    resultsOverlay.classList.add('hidden');
    playAgainBtn.style.display = 'none';
    chatMessages.innerHTML = '<div class="system-msg">Nova rodada iniciada pelo Host!</div>';
});

// Listener de Reações Flutuantes no Chat
socket.on('newReaction', (emoji) => {
    createFloatingEmoji(emoji);
});

function createFloatingEmoji(emoji) {
    if (!chatMessages) return;

    const span = document.createElement('span');
    span.innerText = emoji;
    span.style.position = 'absolute';
    span.style.bottom = '10px';
    span.style.fontSize = '1.8rem';
    span.style.pointerEvents = 'none';
    span.style.zIndex = '100';
    span.style.transition = 'transform 4.5s cubic-bezier(0.1, 0.4, 0.2, 1), opacity 4.5s ease-out';
    span.style.opacity = '1';
    span.style.transform = 'translateY(0) scale(1)';

    // Posição horizontal randômica de spawn no chat (10% a 90%)
    const randomLeft = Math.floor(Math.random() * 80) + 10;
    span.style.left = `${randomLeft}%`;

    chatMessages.appendChild(span);

    // Inicia a animação no próximo frame
    setTimeout(() => {
        const randomDriftX = Math.floor(Math.random() * 100) - 50; // Desvio horizontal mais fluido
        span.style.transform = `translate(${randomDriftX}px, -280px) scale(1.5)`;
        span.style.opacity = '0';
    }, 50);

    // Remove do DOM após completar a animação
    setTimeout(() => {
        span.remove();
    }, 4600);
}

// --- LIVE CHAT SENDER & MESSAGES ---
sendChatBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = chatInput.value.trim();
    if (text) {
        socket.emit('sendMessage', text.substring(0, 200));
        chatInput.value = '';
    }
}

socket.on('newMessage', (msg) => {
    const div = document.createElement('div');
    div.className = 'message';
    div.style.marginBottom = '10px';
    div.style.display = 'flex';
    div.style.alignItems = 'flex-start';
    div.style.gap = '8px';

    const avatarHtml = getAvatarHtml(msg.avatar, msg.color);

    let contentHtml = '';
    const trimmedText = msg.text.trim();
    if (trimmedText.startsWith('http') && (trimmedText.includes('giphy.com') || trimmedText.includes('.gif'))) {
        contentHtml = `<img src="${trimmedText}" alt="GIF" style="max-width: 140px; max-height: 140px; border-radius: 8px; margin-top: 4px; border: 1px solid var(--card-border); box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: block;">`;
    } else {
        contentHtml = `<span class="msg-text" style="word-break: break-all; font-size: 0.72rem; line-height: 1.4; color: #e4e4e7;">${msg.text}</span>`;
    }

    div.innerHTML = `
        ${avatarHtml}
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left;">
            <span class="msg-user" style="color:${msg.color}; font-weight: 700; font-size: 0.72rem; line-height: 1.1; margin-top: 1px;">${msg.user}</span>
            ${contentHtml}
        </div>
    `;

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Standard Alert messages
socket.on('errorMsg', (msg) => {
    alert(msg);
});

// --- MENU DE OPÇÕES E ACERVO (LOCAL STORAGE) ---
const optionsModal = document.getElementById('options-modal');
const optionsModalCard = document.getElementById('options-modal-card');
const optionsMainMenu = document.getElementById('options-main-menu');
const optionsAcervoPanel = document.getElementById('options-acervo-panel');
const openAcervoBtn = document.getElementById('open-acervo-btn');
const modalLogoutBtn = document.getElementById('modal-logout-btn');
const backToMenuBtn = document.getElementById('back-to-menu-btn');

const acervoInput = document.getElementById('acervo-input');
const saveAcervoBtn = document.getElementById('save-acervo-btn');
const acervoList = document.getElementById('acervo-list');

// Fecha o modal ao clicar fora do card de opções
if (optionsModal) {
    optionsModal.addEventListener('click', (e) => {
        if (e.target === optionsModal) {
            optionsModal.classList.add('hidden');
        }
    });
}

function extractYoutubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

async function getAcervo() {
    if (!myUser || !myUser.id) return [];
    try {
        const res = await fetch(`/api/acervo?user_id=${myUser.id}`);
        const data = await res.json();
        return data.list || [];
    } catch(err) {
        console.error('Erro ao buscar acervo:', err);
        return [];
    }
}

async function addAcervoItem(url, title, thumbnail) {
    if (!myUser || !myUser.id) return;
    try {
        await fetch('/api/acervo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: myUser.id, url, title, thumbnail })
        });
    } catch(err) {
        console.error('Erro ao salvar no acervo:', err);
    }
}

async function deleteAcervoItem(url) {
    if (!myUser || !myUser.id) return;
    try {
        await fetch('/api/acervo', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: myUser.id, url })
        });
    } catch(err) {
        console.error('Erro ao deletar do acervo:', err);
    }
}

async function renderAcervo() {
    if (!acervoList) return;
    acervoList.innerHTML = '';
    const list = await getAcervo();
    
    if (list.length === 0) {
        acervoList.innerHTML = `<p style="font-size: 0.75rem; color: var(--text-dim); text-align: center; padding: 12px; margin: 0;">Seu acervo está vazio!</p>`;
        return;
    }
    
    list.forEach((item) => {
        const div = document.createElement('div');
        div.style.width = '100%';
        
        div.innerHTML = `
            <div class="acervo-item" style="display: flex; gap: 8px; align-items: center; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 10px; padding: 6px; width: 100%; box-sizing: border-box; margin-bottom: 6px;">
                <img src="${item.thumbnail}" style="width: 54px; height: 36px; border-radius: 6px; object-fit: cover; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.05);" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2290%22 viewBox=%220 0 120 90%22><defs><linearGradient id=%22g%22 x1=%220%25%22 y1=%220%25%22 x2=%22100%25%22 y2=%22100%25%22><stop offset=%220%25%22 stop-color=%22%231e1e24%22/><stop offset=%22100%25%22 stop-color=%22%230f0f12%22/></linearGradient></defs><rect width=%22120%22 height=%2290%22 rx=%2210%22 fill=%22url(%23g)%22/><polygon points=%2250,35 75,45 50,55%22 fill=%22%2300f2ea%22/></svg>'">
                <div style="display: flex; flex-direction: column; flex-grow: 1; min-width: 0; gap: 4px; text-align: left;">
                    <span style="font-size: 0.72rem; font-weight: 600; color: var(--text-main); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${item.title}">${item.title}</span>
                    <div style="display: flex; gap: 4px;">
                        <button class="use-acervo-btn" data-url="${item.url}" style="background: var(--accent-cyan); color: #000; border: none; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 700; cursor: pointer; transition: transform 0.1s ease;">Fila</button>
                        <button class="delete-acervo-btn" data-url="${item.url}" style="background: rgba(255,0,0,0.1); color: var(--accent-pink); border: 1px solid rgba(255,0,0,0.1); padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; cursor: pointer; transition: transform 0.1s ease;">🗑️</button>
                    </div>
                </div>
            </div>
        `;
        
        // Wire add to queue button click
        div.querySelector('.use-acervo-btn').addEventListener('click', (e) => {
            const url = e.target.getAttribute('data-url');
            socket.emit('addVideo', url);
            if (optionsModal) optionsModal.classList.add('hidden');
        });
        
        // Wire delete button click
        div.querySelector('.delete-acervo-btn').addEventListener('click', async (e) => {
            const url = e.currentTarget.getAttribute('data-url');
            await deleteAcervoItem(url);
            renderAcervo();
        });
        
        acervoList.appendChild(div);
    });
}

if (openAcervoBtn) {
    openAcervoBtn.addEventListener('click', () => {
        if (optionsMainMenu) optionsMainMenu.classList.add('hidden');
        if (optionsAcervoPanel) optionsAcervoPanel.classList.remove('hidden');
        if (optionsModalCard) optionsModalCard.style.width = '300px';
        renderAcervo();
    });
}

if (backToMenuBtn) {
    backToMenuBtn.addEventListener('click', () => {
        if (optionsMainMenu) optionsMainMenu.classList.remove('hidden');
        if (optionsAcervoPanel) optionsAcervoPanel.classList.add('hidden');
        if (optionsModalCard) optionsModalCard.style.width = '180px';
    });
}

if (modalLogoutBtn) {
    modalLogoutBtn.addEventListener('click', () => {
        localStorage.removeItem('cinema_das_guria_user');
        window.location.reload();
    });
}

if (saveAcervoBtn) {
    saveAcervoBtn.addEventListener('click', async () => {
        const url = acervoInput.value.trim();
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            const currentList = await getAcervo();
            if (currentList.some(item => item.url === url)) {
                alert('Esse link já está no seu acervo!');
                return;
            }

            saveAcervoBtn.innerText = '...';
            saveAcervoBtn.disabled = true;

            // Fallback padrão
            let title = 'Vídeo (' + new URL(url).hostname + ')';
            const ytId = extractYoutubeId(url);
            let thumbnail = ytId
                ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`
                : `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%231e1e24"/><stop offset="100%" stop-color="%230f0f12"/></linearGradient></defs><rect width="120" height="90" rx="10" fill="url(%23g)"/><polygon points="50,35 75,45 50,55" fill="%2300f2ea"/></svg>`;

            if (ytId) {
                title = 'Vídeo do YouTube';
            } else {
                try {
                    const parsed = new URL(url);
                    const parts = parsed.pathname.split('/');
                    const filename = parts[parts.length - 1];
                    if (filename) title = decodeURIComponent(filename);
                } catch(e) {}
            }

            // Tenta obter oEmbed CORS-free com noembed
            try {
                const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.title) title = data.title;
                    if (data.thumbnail_url) thumbnail = data.thumbnail_url;
                }
            } catch(err) {
                console.log('Sem oEmbed, usando fallbacks locais:', err);
            }

            // Salvar no banco do usuário
            await addAcervoItem(url, title, thumbnail);

            acervoInput.value = '';
            saveAcervoBtn.innerText = 'Salvar';
            saveAcervoBtn.disabled = false;
            renderAcervo();
        } else {
            alert('Por favor, digite um link de vídeo válido (começando com http/https).');
        }
    });
}

if (acervoInput) {
    acervoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (saveAcervoBtn) saveAcervoBtn.click();
        }
    });
}

// --- CONTROLE DE EDIÇÃO DE PERFIL ---
const openEditBtn = document.getElementById('open-edit-btn');
const optionsEditPanel = document.getElementById('options-edit-panel');
const editBackToMenuBtn = document.getElementById('edit-back-to-menu-btn');
const editNameInput = document.getElementById('edit-name-input');
const editAvatarPreview = document.getElementById('edit-avatar-preview');
const editAvatarFile = document.getElementById('edit-avatar-file');
const btnTriggerEditFile = document.getElementById('btn-trigger-edit-file');
const editPreviewPlaceholder = document.getElementById('edit-preview-placeholder');
const editPreviewImg = document.getElementById('edit-preview-img');
const saveProfileBtn = document.getElementById('save-profile-btn');
const presetAvatarsGrid = document.getElementById('preset-avatars-grid');
const editBgColor = document.getElementById('edit-bg-color');

let selectedAvatarEmoji = null;

if (openEditBtn) {
    openEditBtn.addEventListener('click', () => {
        if (optionsMainMenu) optionsMainMenu.classList.add('hidden');
        if (optionsEditPanel) optionsEditPanel.classList.remove('hidden');
        if (optionsModalCard) optionsModalCard.style.width = '300px';

        // Carregar valores atuais
        editNameInput.value = myUser.name || '';
        
        const currentAvatar = myUser.avatar || '';
        if (currentAvatar.startsWith('data:image') || currentAvatar.startsWith('http')) {
            editPreviewImg.src = currentAvatar;
            editPreviewImg.style.display = 'block';
            editPreviewPlaceholder.style.display = 'none';
            selectedAvatarEmoji = currentAvatar;
        } else {
            editPreviewImg.style.display = 'none';
            editPreviewPlaceholder.textContent = currentAvatar || '';
            editPreviewPlaceholder.style.display = 'block';
            selectedAvatarEmoji = currentAvatar || null;
        }

        // Carregar cor de fundo atual no input color
        const currentBg = localStorage.getItem('cinema_das_guria_bg') || '#0a0a0c';
        editBgColor.value = currentBg;
    });
}

if (editBackToMenuBtn) {
    editBackToMenuBtn.addEventListener('click', () => {
        if (optionsMainMenu) optionsMainMenu.classList.remove('hidden');
        if (optionsEditPanel) optionsEditPanel.classList.add('hidden');
        if (optionsModalCard) optionsModalCard.style.width = '180px';
    });
}

// Disparador de Seleção de Imagem do Dispositivo
if (editAvatarPreview) {
    editAvatarPreview.addEventListener('click', () => editAvatarFile.click());
}
if (btnTriggerEditFile) {
    btnTriggerEditFile.addEventListener('click', () => editAvatarFile.click());
}

if (editAvatarFile) {
    editAvatarFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        compressImageFile(file, 128, 128, 0.7, (base64Url) => {
            selectedAvatarEmoji = base64Url;

            // Atualiza a visualização
            editPreviewImg.src = base64Url;
            editPreviewImg.style.display = 'block';
            editPreviewPlaceholder.style.display = 'none';
        });
    });
}


// Salvar as Alterações de Perfil
if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', () => {
        const newName = editNameInput.value.trim();
        if (!newName) {
            alert('Por favor, insira um nome de usuário válido!');
            return;
        }

        let newAvatar = selectedAvatarEmoji || null;

        // Salvar nas configurações locais do usuário
        myUser.name = newName;
        myUser.avatar = newAvatar;
        const newBg = editBgColor.value;
        myUser.bg_color = newBg;
        localStorage.setItem('cinema_das_guria_user', JSON.stringify(myUser));

        // Aplicar e salvar a cor de fundo do site
        document.documentElement.style.setProperty('--bg-dark', newBg);
        localStorage.setItem('cinema_das_guria_bg', newBg);

        // Notificar servidor via Websocket
        socket.emit('updateProfile', {
            name: newName,
            avatar: newAvatar,
            bg_color: newBg
        });

        updateCurrentUserTag();

        // Fechar modal
        if (optionsModal) optionsModal.classList.add('hidden');
    });
}

// Toggle menu de reações e cliques fora dele
const reactionToggleBtn = document.getElementById('reaction-toggle-btn');
const reactionMenu = document.getElementById('reaction-menu');
const gifToggleBtn = document.getElementById('gif-toggle-btn');
const gifMenu = document.getElementById('gif-menu');
const gifSearchInput = document.getElementById('gif-search-input');
const gifResultsGrid = document.getElementById('gif-results-grid');
const gifHintText = document.getElementById('gif-hint-text');

if (reactionToggleBtn && reactionMenu) {
    reactionToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        reactionMenu.classList.toggle('hidden');
        if (gifMenu) gifMenu.classList.add('hidden'); // fecha o outro
    });
}

if (gifToggleBtn && gifMenu) {
    gifToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        gifMenu.classList.toggle('hidden');
        if (reactionMenu) reactionMenu.classList.add('hidden'); // fecha o outro
        
        // Se abriu o menu e está vazio, carrega os trending/padrão
        if (!gifMenu.classList.contains('hidden') && gifResultsGrid && gifResultsGrid.children.length === 0) {
            loadGifs('');
        }
    });
}

// Fechar menus de popover ao clicar fora
document.addEventListener('click', (e) => {
    if (reactionMenu && !reactionMenu.contains(e.target) && e.target !== reactionToggleBtn) {
        reactionMenu.classList.add('hidden');
    }
    if (gifMenu && !gifMenu.contains(e.target) && e.target !== gifToggleBtn) {
        gifMenu.classList.add('hidden');
    }
});

// Função para buscar e renderizar os GIFs da nossa API com debounce
let gifDebounceTimeout;
if (gifSearchInput) {
    gifSearchInput.addEventListener('input', (e) => {
        clearTimeout(gifDebounceTimeout);
        gifDebounceTimeout = setTimeout(() => {
            loadGifs(e.target.value.trim());
        }, 300);
    });
}

async function loadGifs(searchTerm) {
    if (!gifResultsGrid) return;
    
    gifResultsGrid.innerHTML = '<div style="grid-column: span 2; text-align: center; font-size: 0.65rem; color: #a1a1aa; padding: 10px;">Carregando...</div>';
    
    try {
        const res = await fetch(`/api/gifs?q=${encodeURIComponent(searchTerm)}`);
        const data = await res.json();
        
        if (data.success && data.gifs && data.gifs.length > 0) {
            gifResultsGrid.innerHTML = '';
            data.gifs.forEach(gif => {
                const img = document.createElement('img');
                img.src = gif.url;
                img.alt = gif.title;
                img.style.width = '100%';
                img.style.height = '60px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '6px';
                img.style.cursor = 'pointer';
                img.style.transition = 'transform 0.15s ease';
                
                img.addEventListener('mouseenter', () => img.style.transform = 'scale(1.05)');
                img.addEventListener('mouseleave', () => img.style.transform = 'scale(1)');
                
                img.addEventListener('click', () => {
                    // Envia o link do GIF diretamente no chat
                    socket.emit('sendMessage', gif.url);
                    if (gifMenu) gifMenu.classList.add('hidden');
                });
                
                gifResultsGrid.appendChild(img);
            });
            
            // Exibir a dica amigável caso esteja usando os fallbacks
            if (gifHintText) {
                if (data.isFallback) {
                    gifHintText.innerHTML = 'Dica: Adicione <strong style="color: #6366f1;">GIPHY_API_KEY</strong> no seu arquivo .env para pesquisar milhões de GIFs reais!';
                } else {
                    gifHintText.innerText = 'Via Giphy API';
                }
            }
        } else {
            gifResultsGrid.innerHTML = '<div style="grid-column: span 2; text-align: center; font-size: 0.65rem; color: #a1a1aa; padding: 10px;">Nenhum GIF encontrado.</div>';
        }
    } catch (err) {
        console.error('Erro ao buscar GIFs:', err);
        gifResultsGrid.innerHTML = '<div style="grid-column: span 2; text-align: center; font-size: 0.65rem; color: #ef4444; padding: 10px;">Erro ao carregar GIFs.</div>';
    }
}

// Ativar as Reações Flutuantes no Clique
document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const emoji = e.currentTarget.getAttribute('data-emoji');
        if (emoji) {
            socket.emit('sendReaction', emoji);
        }
        if (reactionMenu) {
            reactionMenu.classList.add('hidden');
        }
    });
});
