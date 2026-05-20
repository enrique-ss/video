const socket = io();

const SESSION_STORAGE_KEY = 'cinema_das_guria_user';

function applyUserTheme(bgColor) {
    const color = bgColor || '#0a0a0c';
    document.documentElement.style.setProperty('--bg-dark', color);
}

function saveUserSession(user) {
    if (!user || !user.id) return;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
}

function clearUserSession() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem('cinema_das_guria_bg');
}

function getAuthHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (myUser && myUser.token) {
        headers['Authorization'] = `Bearer ${myUser.token}`;
    }
    return headers;
}

async function refreshUserFromServer() {
    if (!myUser || !myUser.id) return false;
    try {
        const headers = getAuthHeaders();
        if (runtimeNeedsToken() && !myUser.token) return false;

        const profileUrl = runtimeNeedsToken()
            ? '/api/profile'
            : `/api/profile?user_id=${encodeURIComponent(myUser.id)}`;
        const res = await fetch(profileUrl, { headers });
        const data = await res.json();
        if (!res.ok || !data.success || !data.user) {
            if (res.status === 401) {
                handleSessionExpired(data.error);
            }
            return false;
        }

        applyServerUser(data.user);
        return true;
    } catch (err) {
        console.error('Erro ao sincronizar perfil do servidor:', err);
        return false;
    }
}

function runtimeNeedsToken() {
    return ENV.APP_MODE === 'online';
}

function applyServerUser(serverUser) {
    myUser.id = serverUser.id;
    myUser.name = serverUser.name;
    myUser.avatar = serverUser.avatar || null;
    myUser.bg_color = serverUser.bg_color || '#0a0a0c';
    if (serverUser.token) myUser.token = serverUser.token;
    if (serverUser.acervo) myUser.acervo = serverUser.acervo;

    applyUserTheme(myUser.bg_color);
    saveUserSession(myUser);
    updateCurrentUserTag();
}

function handleSessionExpired(message) {
    clearUserSession();
    myUser = {
        id: '',
        name: '',
        socketId: '',
        isHost: false,
        color: '',
        avatar: null,
        bg_color: '#0a0a0c',
        acervo: []
    };
    if (loginOverlay) {
        loginOverlay.classList.remove('hidden');
        loginOverlay.style.opacity = '1';
    }
    switchToTab('login');
    if (message) alert(message);
}

async function saveProfileToServer(profileData) {
    const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
    if (runtimeNeedsToken() && !myUser.token) {
        throw new Error('Sessão inválida. Faça login novamente.');
    }

    const payload = { ...profileData };
    if (!runtimeNeedsToken()) {
        payload.user_id = myUser.id;
    }

    const res = await fetch('/api/profile', {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
        throw new Error(data.error || 'Não foi possível salvar o perfil.');
    }
    applyServerUser(data.user);
    return data.user;
}

const ENV = window.ENV || { APP_MODE: 'offline' };

let myUser = {
    id: '',
    name: '',
    socketId: '',
    isHost: false,
    color: '',
    avatar: null,
    bg_color: '#0a0a0c',
    token: null,
    acervo: []
};

const loginOverlay = document.getElementById('login-overlay');
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

    const card = document.querySelector('.auth-card');
    if (card) {
        if (tab === 'login') {
            card.style.height = '430px';
        } else {
            card.style.height = '595px';
        }
    }
}

if (tabLoginBtn) {
    tabLoginBtn.addEventListener('click', () => switchToTab('login'));
}
if (tabRegisterBtn) {
    tabRegisterBtn.addEventListener('click', () => switchToTab('register'));
}

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

// Comprime avatar antes do upload (evita payload grande na API)
function compressImageFile(file, maxWidth, maxHeight, quality, callback) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

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

            const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            callback(compressedBase64);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

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
            completeLogin(data.user.name, data.user.id, data.user.avatar, null, data.user.bg_color, data.user.token, data.user.acervo);
        }
    } catch (err) {
        console.error(err);
        alert('Erro ao registrar usuário. Tente novamente!');
    }
});

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
            completeLogin(data.user.name, data.user.id, data.user.avatar, null, data.user.bg_color, data.user.token, data.user.acervo);
        }
    } catch (err) {
        console.error(err);
        alert('Erro ao realizar login. Tente novamente!');
    }
});

socket.on('connect', () => {
    if (myUser?.id) {
        socket.emit('join', {
            id: myUser.id,
            token: myUser.token || null,
            name: myUser.name,
            avatar: myUser.avatar,
            bg_color: myUser.bg_color
        });
    }
});

socket.on('forceLogout', (msg) => {
    handleSessionExpired(msg || 'Sua sessão expirou. Faça login novamente.');
});

socket.on('profileUpdated', (profile) => {
    if (!profile || profile.id !== myUser.id) return;
    myUser.name = profile.name;
    myUser.avatar = profile.avatar || null;
    myUser.bg_color = profile.bg_color || '#0a0a0c';
    applyUserTheme(myUser.bg_color);
    saveUserSession(myUser);
    updateCurrentUserTag();
});

socket.on('profileError', (msg) => {
    alert(msg || 'Erro ao salvar perfil.');
});

(async function restoreSession() {
    const savedUser = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!savedUser) {
        if (loginOverlay) loginOverlay.classList.remove('hidden');
        switchToTab('login');
        return;
    }

    try {
        myUser = JSON.parse(savedUser);
        applyUserTheme(myUser.bg_color);
        completeLogin(
            myUser.name,
            myUser.id,
            myUser.avatar,
            myUser.color,
            myUser.bg_color,
            myUser.token,
            myUser.acervo,
            false
        );

        const synced = await refreshUserFromServer();
        if (synced) {
            socket.emit('join', myUser);
            getAcervo().then(() => renderAcervo());
        } else if (runtimeNeedsToken() && !myUser.token) {
            handleSessionExpired('Sessão expirada. Faça login novamente.');
        }
    } catch (err) {
        console.error('Falha ao restaurar sessão de usuário:', err);
        clearUserSession();
        if (loginOverlay) loginOverlay.classList.remove('hidden');
        switchToTab('login');
    }
})();

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

function completeLogin(name, id, avatar, color, bg_color, token, acervo, emitJoin = true) {
    myUser.name = name;
    if (id) {
        myUser.id = id;
    }
    myUser.avatar = avatar || null;
    if (color) {
        myUser.color = color;
    } else if (!myUser.color) {
        myUser.color = '#' + Math.floor(Math.random()*16777215).toString(16);
    }
    myUser.bg_color = bg_color || '#0a0a0c';
    if (token) {
        myUser.token = token;
    }
    if (acervo) {
        myUser.acervo = acervo;
    } else if (!myUser.acervo) {
        myUser.acervo = [];
    }

    applyUserTheme(myUser.bg_color);
    saveUserSession(myUser);

    if (emitJoin) {
        socket.emit('join', myUser);
    }

    if (myUser.id) {
        getAcervo().then(() => renderAcervo());
    }

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
                ? ''
                : `<span style="font-size: 0.75rem; margin-right: 4px;">${myUser.avatar}</span>`) 
            : '';
        currentUserTag.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; gap: 4px;">${avatarHtml}<span>${myUser.name}</span></div>`;
    }
}

addVideoBtn.addEventListener('click', () => {
    const url = tiktokUrlInput.value.trim();
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        socket.emit('addVideo', url);
        tiktokUrlInput.value = '';
    } else {
        alert('Por favor, insira um link de vídeo válido (http:// ou https://)!');
    }
});

function renderVideoPlayer(url, isHost) {
    videoWrapper.innerHTML = '';
    
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
    else if (url.includes('tiktok.com')) {
        const match = url.match(/\/video\/(\d+)/) || 
                      url.match(/\/v\/(\d+)/) || 
                      url.match(/\/embed\/(\d+)/) || 
                      url.match(/\/embed\/v2\/(\d+)/) ||
                      url.match(/\/player\/v1\/(\d+)/);
        const videoId = match ? match[1] : null;

        if (videoId) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.tiktok.com/player/v1/${videoId}?music_info=1&description=1`;
            iframe.width = '100%';
            iframe.height = '100%';
            iframe.style.borderRadius = '14px';
            iframe.style.border = 'none';
            iframe.allow = 'autoplay; clipboard-write; encrypted-media; picture-in-picture; accelerometer; gyroscope';
            iframe.allowFullscreen = true;
            videoWrapper.appendChild(iframe);
        } else {
            renderGenericIframe(url);
        }
    }
    else if (url.match(/\.(mp4|webm|ogg|mov)(?:$|\?)/i)) {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.autoplay = true;
        video.loop = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.borderRadius = '14px';
        videoWrapper.appendChild(video);
    } 
    else {
        renderGenericIframe(url);
    }

    if (isHost) {
        const finishBtn = document.createElement('button');
        const isAssistir = window.currentGameMode === 'ASSISTIR';
        finishBtn.innerText = isAssistir ? 'Próximo Vídeo ➔' : 'Próximo / Iniciar Votação ➔';
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



const gameModeModal = document.getElementById('game-mode-modal');
const modePalpitarBtn = document.getElementById('mode-palpitar-btn');
const modeAssistirBtn = document.getElementById('mode-assistir-btn');

if (startGameBtn) {
    startGameBtn.addEventListener('click', () => {
        if (gameModeModal) {
            gameModeModal.classList.remove('hidden');
        }
    });
}

if (modePalpitarBtn) {
    modePalpitarBtn.addEventListener('click', () => {
        socket.emit('startGame', { mode: 'PALPITAR' });
        if (gameModeModal) gameModeModal.classList.add('hidden');
    });
}

if (modeAssistirBtn) {
    modeAssistirBtn.addEventListener('click', () => {
        socket.emit('startGame', { mode: 'ASSISTIR' });
        if (gameModeModal) gameModeModal.classList.add('hidden');
    });
}

if (gameModeModal) {
    gameModeModal.addEventListener('click', (e) => {
        if (e.target === gameModeModal) {
            gameModeModal.classList.add('hidden');
        }
    });
}

if (playAgainBtn) {
    playAgainBtn.addEventListener('click', () => {
        socket.emit('resetGame');
    });
}

socket.on('syncState', (state) => {
    window.currentGameMode = state.gameMode || 'PALPITAR';
    
    const serverMe = state.users.find(u => u.id === myUser.id);
    if (serverMe) {
        myUser.isHost = serverMe.isHost;
        myUser.color = serverMe.color;
        
        myUser.name = serverMe.name;
        myUser.avatar = serverMe.avatar;
        myUser.bg_color = serverMe.bg_color || '#0a0a0c';

        applyUserTheme(myUser.bg_color);
        saveUserSession(myUser);
        updateCurrentUserTag();
    }

    if (state.status === 'LOBBY' && myUser.isHost) {
        startGameBtn.style.display = 'block';
    } else {
        startGameBtn.style.display = 'none';
    }

    if (openAcervoBtn) {
        const allowAcervo = state.status === 'LOBBY' || (state.status === 'PLAYING' && state.gameMode === 'ASSISTIR');
        if (allowAcervo) {
            openAcervoBtn.style.display = 'flex';
        } else {
            openAcervoBtn.style.display = 'none';
            if (optionsModal && !optionsModal.classList.contains('hidden') && optionsAcervoPanel && !optionsAcervoPanel.classList.contains('hidden')) {
                optionsModal.classList.add('hidden');
            }
        }
    }

    const allowVideoAddition = state.status === 'LOBBY' || (state.status === 'PLAYING' && state.gameMode === 'ASSISTIR');

    if (allowVideoAddition) {
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

    if (state.status === 'VOTING') {
        votingOverlay.classList.remove('hidden');
    } else {
        votingOverlay.classList.add('hidden');
        chatMessages.classList.remove('silent');
    }

    if (state.status === 'PODIUM') {
        resultsOverlay.classList.remove('hidden');
        if (myUser.isHost) {
            playAgainBtn.style.display = 'block';
        } else {
            playAgainBtn.style.display = 'none';
        }
    } else {
        resultsOverlay.classList.add('hidden');
        playAgainBtn.style.display = 'none';
    }

    if (state.status === 'PLAYING' && state.currentVideo) {
        if (window.currentRenderedVideoUrl !== state.currentVideo.url) {
            window.currentRenderedVideoUrl = state.currentVideo.url;
            renderVideoPlayer(state.currentVideo.url, myUser.isHost);
        } else {
            let finishBtn = videoWrapper.querySelector('.finish-video-btn');
            if (myUser.isHost) {
                if (!finishBtn) {
                    finishBtn = document.createElement('button');
                    const isAssistir = window.currentGameMode === 'ASSISTIR';
                    finishBtn.innerText = isAssistir ? 'Próximo Vídeo ➔' : 'Próximo / Iniciar Votação ➔';
                    finishBtn.className = 'finish-video-btn';
                    finishBtn.onclick = () => socket.emit('videoEnded');
                    videoWrapper.appendChild(finishBtn);
                }
            } else {
                if (finishBtn) {
                    finishBtn.remove();
                }
            }
        }
    } else {
        window.currentRenderedVideoUrl = null;
        if (state.status === 'LOBBY') {
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
    }

    document.getElementById('queue-count').innerText = state.playlist.length;

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

    document.getElementById('online-count').innerText = `${state.users.length} online`;

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

    chatMessages.innerHTML = '';
    state.chatHistory.forEach(msg => {
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
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('stateChange', (state) => {
    socket.emit('join', myUser); 
});

socket.on('startVoting', ({ timer, authorId, options }) => {
    votingOverlay.classList.remove('hidden');
    votingOptions.innerHTML = '';
    votingStatus.innerText = 'Aguardando palpites...';

    if (myUser.id === authorId) {
        votingStatus.innerHTML = '<strong style="color: #ff0050; font-size:0.75rem;">Você enviou este vídeo! Aguardando o palpite dos amigos... 🤫</strong>';
        chatMessages.classList.remove('silent');
        return;
    }

    chatMessages.classList.add('silent');

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'vote-btn';
        btn.innerText = opt.name;
        btn.onclick = () => {
            socket.emit('castVote', opt.id);
            votingOptions.querySelectorAll('button').forEach(b => b.disabled = true);
            votingStatus.innerText = 'Votado em ' + opt.name + '!';

            chatMessages.classList.remove('silent');
        };
        votingOptions.appendChild(btn);
    });
});

socket.on('votingTick', (time) => {
    const timerFill = document.getElementById('voting-timer-fill');
    if (timerFill) {
        const percentage = (time / 15) * 100;
        timerFill.style.width = percentage + '%';
    }
});

socket.on('podiumTick', (time) => {
    const timerFill = document.getElementById('podium-timer-fill');
    if (timerFill) {
        const percentage = (time / 15) * 100;
        timerFill.style.width = percentage + '%';
    }
    const statusText = document.getElementById('podium-timer-status');
    if (statusText) {
        statusText.innerText = `Retornando ao lobby em ${time}s...`;
    }
});

socket.on('votingProgress', ({ votesReceived, totalUsers }) => {
    if (votingOverlay.classList.contains('hidden')) return;
    const statusText = document.getElementById('voting-status');
    if (statusText && !statusText.innerHTML.includes('enviou este vídeo')) {
        statusText.innerText = `Aguardando palpites... (${votesReceived}/${totalUsers})`;
    }
});

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

socket.on('gameReset', () => {
    resultsOverlay.classList.add('hidden');
    playAgainBtn.style.display = 'none';
    chatMessages.innerHTML = '<div class="system-msg">Nova rodada iniciada pelo Host!</div>';
});

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

    const randomLeft = Math.floor(Math.random() * 80) + 10;
    span.style.left = `${randomLeft}%`;

    chatMessages.appendChild(span);

    setTimeout(() => {
        const randomDriftX = Math.floor(Math.random() * 100) - 50;
        span.style.transform = `translate(${randomDriftX}px, -280px) scale(1.5)`;
        span.style.opacity = '0';
    }, 50);

    setTimeout(() => span.remove(), 4600);
}

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

socket.on('errorMsg', (msg) => {
    alert(msg);
});

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
        const url = runtimeNeedsToken()
            ? `/api/acervo?_=${Date.now()}`
            : `/api/acervo?user_id=${encodeURIComponent(myUser.id)}&_=${Date.now()}`;
        const res = await fetch(url, { headers: getAuthHeaders() });
        if (!res.ok) {
            const errData = await res.json();
            console.error('Erro de API ao buscar acervo:', errData.error);
            return myUser.acervo || [];
        }
        const data = await res.json();
        const list = data.list || [];
        
        myUser.acervo = list;
        saveUserSession(myUser);
        
        return list;
    } catch(err) {
        console.error('Erro ao buscar acervo:', err);
        return myUser.acervo || [];
    }
}

async function addAcervoItem(url) {
    if (!myUser || !myUser.id) return;
    try {
        const body = { url };
        if (!runtimeNeedsToken()) body.user_id = myUser.id;
        const res = await fetch('/api/acervo', {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert('Erro ao salvar no acervo: ' + (data.error || 'Erro desconhecido'));
            return;
        }
        if (data.list) {
            myUser.acervo = data.list;
            saveUserSession(myUser);
        }
    } catch(err) {
        console.error('Erro ao salvar no acervo:', err);
        alert('Erro de conexão ao salvar no acervo.');
    }
}

async function deleteAcervoItem(url) {
    if (!myUser || !myUser.id) return;
    try {
        const body = { url };
        if (!runtimeNeedsToken()) body.user_id = myUser.id;
        const res = await fetch('/api/acervo', {
            method: 'DELETE',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert('Erro ao deletar do acervo: ' + (data.error || 'Erro desconhecido'));
            return;
        }
        if (data.list) {
            myUser.acervo = data.list;
            saveUserSession(myUser);
        } else {
            await getAcervo();
        }
    } catch(err) {
        console.error('Erro ao deletar do acervo:', err);
        alert('Erro de conexão ao deletar do acervo.');
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
        
        let displayTitle = item.title && item.title.trim() ? item.title : item.url;
        if (displayTitle === 'url' || !displayTitle) {
            try {
                const ytId = extractYoutubeId(item.url);
                if (ytId) {
                    displayTitle = 'Vídeo do YouTube';
                } else {
                    const parsed = new URL(item.url);
                    const parts = parsed.pathname.split('/');
                    const filename = parts.filter(Boolean).pop();
                    displayTitle = filename ? decodeURIComponent(filename) : 'Vídeo (' + parsed.hostname + ')';
                }
            } catch (e) {
                displayTitle = item.url || 'Vídeo Salvo';
            }
        }

        const safeThumb = item.thumbnail ? item.thumbnail.replace(/"/g, "'") : '';
        
        div.innerHTML = `
            <div class="acervo-item" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.015); border: 1px solid var(--card-border); border-radius: 8px; padding: 4px 8px; width: 100%; box-sizing: border-box; margin-bottom: 4px; gap: 8px; transition: background 0.2s ease;">
                <div style="display: flex; align-items: center; gap: 8px; flex-grow: 1; min-width: 0;">
                    ${safeThumb ? `<img src="${safeThumb}" alt="thumb" style="width: 36px; height: 24px; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0;">` : ''}
                    <span style="font-size: 0.7rem; font-weight: 500; color: var(--text-main); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; text-align: left; flex-grow: 1;" title="${displayTitle}">${displayTitle}</span>
                </div>
                <div style="display: flex; gap: 4px; flex-shrink: 0;">
                    <button class="use-acervo-btn" data-url="${item.url}" style="background: var(--accent-cyan); color: #000; border: none; padding: 2px 6px; border-radius: 4px; font-size: 0.62rem; font-weight: 700; cursor: pointer; transition: transform 0.1s ease;">Fila</button>
                    <button class="delete-acervo-btn" data-url="${item.url}" style="background: rgba(255,0,0,0.1); color: var(--accent-pink); border: 1px solid rgba(255,0,0,0.1); padding: 2px 4px; border-radius: 4px; font-size: 0.62rem; cursor: pointer; transition: transform 0.1s ease;">🗑️</button>
                </div>
            </div>
        `;
        
        div.querySelector('.use-acervo-btn').addEventListener('click', (e) => {
            const url = e.target.getAttribute('data-url');
            socket.emit('addVideo', url);
            if (optionsModal) optionsModal.classList.add('hidden');
        });
        
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
        clearUserSession();
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

            await addAcervoItem(url);

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

const openEditBtn = document.getElementById('open-edit-btn');
const optionsEditPanel = document.getElementById('options-edit-panel');
const editBackToMenuBtn = document.getElementById('edit-back-to-menu-btn');
const editAvatarPreview = document.getElementById('edit-avatar-preview');
const editAvatarFile = document.getElementById('edit-avatar-file');
const btnTriggerEditFile = document.getElementById('btn-trigger-edit-file');
const editPreviewPlaceholder = document.getElementById('edit-preview-placeholder');
const editPreviewImg = document.getElementById('edit-preview-img');
const saveProfileBtn = document.getElementById('save-profile-btn');
const editBgColor = document.getElementById('edit-bg-color');

let selectedAvatarEmoji = null;

if (openEditBtn) {
    openEditBtn.addEventListener('click', () => {
        if (optionsMainMenu) optionsMainMenu.classList.add('hidden');
        if (optionsEditPanel) optionsEditPanel.classList.remove('hidden');
        if (optionsModalCard) optionsModalCard.style.width = '300px';

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

        editBgColor.value = myUser.bg_color || '#0a0a0c';
    });
}

if (editBackToMenuBtn) {
    editBackToMenuBtn.addEventListener('click', () => {
        if (optionsMainMenu) optionsMainMenu.classList.remove('hidden');
        if (optionsEditPanel) optionsEditPanel.classList.add('hidden');
        if (optionsModalCard) optionsModalCard.style.width = '180px';
    });
}

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

            editPreviewImg.src = base64Url;
            editPreviewImg.style.display = 'block';
            editPreviewPlaceholder.style.display = 'none';
        });
    });
}


if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
        const newAvatar = selectedAvatarEmoji || null;
        const newBg = editBgColor.value;

        saveProfileBtn.disabled = true;
        const originalLabel = saveProfileBtn.innerText;
        saveProfileBtn.innerText = 'Salvando...';

        try {
            await saveProfileToServer({
                name: myUser.name,
                avatar: newAvatar,
                bg_color: newBg
            });

            socket.emit('updateProfile', {
                name: myUser.name,
                avatar: myUser.avatar,
                bg_color: myUser.bg_color
            });

            if (optionsModal) optionsModal.classList.add('hidden');
        } catch (err) {
            alert(err.message || 'Erro ao salvar perfil.');
        } finally {
            saveProfileBtn.disabled = false;
            saveProfileBtn.innerText = originalLabel;
        }
    });
}

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
        if (gifMenu) gifMenu.classList.add('hidden');
    });
}

if (gifToggleBtn && gifMenu) {
    gifToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        gifMenu.classList.toggle('hidden');
        if (reactionMenu) reactionMenu.classList.add('hidden');

        if (!gifMenu.classList.contains('hidden') && gifResultsGrid && gifResultsGrid.children.length === 0) {
            loadGifs('');
        }
    });
}

document.addEventListener('click', (e) => {
    if (reactionMenu && !reactionMenu.contains(e.target) && e.target !== reactionToggleBtn) {
        reactionMenu.classList.add('hidden');
    }
    if (gifMenu && !gifMenu.contains(e.target) && e.target !== gifToggleBtn) {
        gifMenu.classList.add('hidden');
    }
});

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
                    socket.emit('sendMessage', gif.url);
                    if (gifMenu) gifMenu.classList.add('hidden');
                });
                
                gifResultsGrid.appendChild(img);
            });
            
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

const resizer = document.getElementById('resizer-handle');
const videoWrapperElement = document.getElementById('video-wrapper');

if (resizer && videoWrapperElement) {
    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    const startDrag = (e) => {
        isDragging = true;
        resizer.classList.add('dragging');
        startY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        startHeight = videoWrapperElement.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    };

    const doDrag = (e) => {
        if (!isDragging) return;
        if (e.cancelable) e.preventDefault();
        const currentY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        const diffY = currentY - startY;
        
        let newHeight = startHeight + diffY;
        const minHeight = 120;
        const maxHeight = window.innerHeight * 0.7;
        
        if (newHeight < minHeight) newHeight = minHeight;
        if (newHeight > maxHeight) newHeight = maxHeight;

        videoWrapperElement.style.height = `${newHeight}px`;
    };

    const stopDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        localStorage.setItem('cinema_das_guria_player_height', videoWrapperElement.style.height);
    };

    resizer.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);

    resizer.addEventListener('touchstart', startDrag, { passive: true });
    window.addEventListener('touchmove', doDrag, { passive: false });
    window.addEventListener('touchend', stopDrag);

    const savedHeight = localStorage.getItem('cinema_das_guria_player_height');
    if (savedHeight) {
        videoWrapperElement.style.height = savedHeight;
    }
}

