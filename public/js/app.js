const socket = io();

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
    color: ''
};

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const tiktokUrlInput = document.getElementById('tiktok-url');
const addVideoBtn = document.getElementById('add-video-btn');
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
const logoutBtn = document.getElementById('logout-btn');

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

// Toggle between Login and Register Overlays
linkToRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginOverlay.classList.add('hidden');
    registerOverlay.classList.remove('hidden');
});

linkToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerOverlay.classList.add('hidden');
    loginOverlay.classList.remove('hidden');
});

// Submit Register Form
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
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        
        if (data.error) {
            alert(data.error);
        } else if (data.success) {
            completeLogin(data.user.name, data.user.id);
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
            completeLogin(data.user.name, data.user.id);
        }
    } catch (err) {
        console.error(err);
        alert('Erro ao realizar login. Tente novamente!');
    }
});

// --- SESSION CONTROL (TK-06 & TK-07) ---
const savedUser = localStorage.getItem('tiktok_cinema_user');
if (savedUser) {
    try {
        myUser = JSON.parse(savedUser);
        completeLogin(myUser.name, myUser.id);
    } catch (err) {
        console.error('Falha ao restaurar sessão de usuário:', err);
        loginOverlay.classList.remove('hidden');
    }
} else {
    loginOverlay.classList.remove('hidden');
}

// Evento de clique para Logout
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('tiktok_cinema_user');
    window.location.reload();
});

function completeLogin(name, id) {
    myUser.name = name;
    if (id) {
        myUser.id = id;
    } else if (!myUser.id) {
        myUser.id = 'usr_' + Math.random().toString(36).substr(2, 9);
    }
    if (!myUser.color) {
        myUser.color = '#' + Math.floor(Math.random()*16777215).toString(16);
    }

    localStorage.setItem('tiktok_cinema_user', JSON.stringify(myUser));
    socket.emit('join', myUser);

    loginOverlay.style.opacity = '0';
    registerOverlay.style.opacity = '0';
    setTimeout(() => {
        loginOverlay.classList.add('hidden');
        registerOverlay.classList.add('hidden');
    }, 300);

    updateCurrentUserTag();
}

function updateCurrentUserTag() {
    const tag = document.getElementById('current-user-tag');
    if (tag) {
        tag.innerHTML = myUser.name;
        tag.style.background = myUser.color;
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
    
    // 1. TikTok
    if (url.includes('tiktok.com') || url.includes('v.douyin.com')) {
        const blockquote = document.createElement('blockquote');
        blockquote.className = 'tiktok-embed';
        blockquote.cite = url;
        blockquote.setAttribute('data-video-id', extractVideoId(url));
        blockquote.style.maxWidth = '100%';
        blockquote.style.height = '100%';
        
        const section = document.createElement('section');
        blockquote.appendChild(section);
        videoWrapper.appendChild(blockquote);
        
        // Evita duplicar tag de script do SDK do TikTok na memória
        let script = document.getElementById('tiktok-embed-script');
        if (!script) {
            script = document.createElement('script');
            script.id = 'tiktok-embed-script';
            script.src = 'https://www.tiktok.com/embed.js';
            script.async = true;
            document.body.appendChild(script);
        } else {
            // Se o script já está no documento, chama o renderizador para reprocessar a blockquote
            if (window.tiktok && window.tiktok.embed) {
                window.tiktok.embed.render();
            }
        }
    } 
    // 2. YouTube & YouTube Shorts
    else if (url.includes('youtube.com') || url.includes('youtu.be')) {
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

function extractVideoId(url) {
    const match = url.match(/\/video\/(\d+)/);
    return match ? match[1] : '';
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
    console.log('Sincronização de Estado recebida:', state);
    
    const serverMe = state.users.find(u => u.id === myUser.id);
    if (serverMe) {
        myUser.isHost = serverMe.isHost;
    }

    // Toggle start game button inside Header (Top) exclusively for Host
    if (state.status === 'LOBBY' && myUser.isHost) {
        startGameBtn.style.display = 'block';
    } else {
        startGameBtn.style.display = 'none';
    }

    // Block video additions outside lobby
    if (state.status === 'LOBBY') {
        tiktokUrlInput.disabled = false;
        addVideoBtn.disabled = false;
    } else {
        tiktokUrlInput.disabled = true;
        addVideoBtn.disabled = true;
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
    }

    // Sync playlist count indicator inside Chat Header Slim
    document.getElementById('queue-count').innerText = state.playlist.length;
    
    // Sync simplified playlist queue list
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

    // Sync online users count in top banner
    document.getElementById('online-count').innerText = `${state.users.length} online`;

    // Sync live chat logs
    chatMessages.innerHTML = '';
    state.chatHistory.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message';
        div.innerHTML = `<span class="msg-user" style="color:${msg.color}">${msg.user}:</span> <span class="msg-text">${msg.text}</span>`;
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

// --- LIVE CHAT SENDER & MESSAGES ---
sendChatBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = chatInput.value.trim();
    if (text) {
        socket.emit('sendMessage', text);
        chatInput.value = '';
    }
}

socket.on('newMessage', (msg) => {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<span class="msg-user" style="color:${msg.color}">${msg.user}:</span> <span class="msg-text">${msg.text}</span>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Standard Alert messages
socket.on('errorMsg', (msg) => {
    alert(msg);
});
