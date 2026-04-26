const socket = io();

// Configurações globais vindas do servidor
const ENV = window.ENV || { TIKTOK_LOGIN_ENABLED: true };

// State
let myUser = {
    id: Math.random().toString(36).substr(2, 9),
    name: '',
    avatar: '',
    color: '#' + Math.floor(Math.random()*16777215).toString(16),
    tiktokLoggedIn: false
};

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const tiktokLoginBtn = document.getElementById('tiktok-login-btn');
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
const suggestedSection = document.getElementById('suggested-videos-section');
const suggestedList = document.getElementById('suggested-list');
const syncLikesBtn = document.getElementById('sync-likes-btn');

// Login manual
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (name) {
        completeLogin(name);
    }
});

// Login com TikTok
tiktokLoginBtn.addEventListener('click', () => {
    const width = 600, height = 800;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;
    window.open('/auth/tiktok', 'TikTok Login', `width=${width},height=${height},left=${left},top=${top}`);
});

window.addEventListener('message', (event) => {
    if (event.data.type === 'tiktok_login') {
        const user = event.data.user;
        myUser.name = user.display_name;
        myUser.avatar = user.avatar_url;
        myUser.tiktokLoggedIn = true;
        completeLogin(user.display_name);
        fetchLikedVideos();
    }
});

function completeLogin(name) {
    myUser.name = name;
    socket.emit('join', myUser);
    loginOverlay.style.opacity = '0';
    setTimeout(() => loginOverlay.classList.add('hidden'), 300);
    
    const tag = document.getElementById('current-user-tag');
    tag.innerHTML = myUser.avatar ? `<img src="${myUser.avatar}" class="avatar-sm"> ${name}` : name;
    tag.style.background = myUser.color;
}

// Video Management
addVideoBtn.addEventListener('click', () => {
    const url = tiktokUrlInput.value.trim();
    if (url && (url.includes('tiktok.com') || url.includes('v.douyin.com'))) {
        socket.emit('addVideo', url);
        tiktokUrlInput.value = '';
    }
});

async function fetchLikedVideos() {
    if (!myUser.tiktokLoggedIn) return;
    
    suggestedSection.classList.remove('hidden');
    suggestedList.innerHTML = '<p>Buscando curtidos...</p>';
    
    try {
        const response = await fetch('/api/tiktok/liked-videos');
        const videos = await response.json();
        
        suggestedList.innerHTML = '';
        videos.forEach(video => {
            const card = document.createElement('div');
            card.className = 'suggested-card';
            card.innerHTML = `
                <div class="card-info">
                    <strong>${video.title}</strong>
                    <span>TikTok Video</span>
                </div>
                <button class="add-suggested-btn">+</button>
            `;
            card.querySelector('button').onclick = () => {
                socket.emit('addVideo', video.url);
                card.classList.add('added');
                card.querySelector('button').disabled = true;
            };
            suggestedList.appendChild(card);
        });
    } catch (err) {
        suggestedList.innerHTML = '<p>Erro ao sincronizar curtidos.</p>';
    }
}

syncLikesBtn.addEventListener('click', fetchLikedVideos);

function embedTikTok(url) {
    videoWrapper.innerHTML = '';
    
    const blockquote = document.createElement('blockquote');
    blockquote.className = 'tiktok-embed';
    blockquote.cite = url;
    blockquote.setAttribute('data-video-id', extractVideoId(url));
    blockquote.style.maxWidth = '605px';
    blockquote.style.minWidth = '325px';
    
    const section = document.createElement('section');
    blockquote.appendChild(section);
    videoWrapper.appendChild(blockquote);
    
    // Força recarregamento do embed
    if (window.twttr) { /* Just in case of confusion with twitter */ }
    const script = document.createElement('script');
    script.src = 'https://www.tiktok.com/embed.js';
    script.async = true;
    document.body.appendChild(script);

    const finishBtn = document.createElement('button');
    finishBtn.innerText = 'Próximo / Iniciar Votação';
    finishBtn.className = 'finish-video-btn';
    finishBtn.style.marginTop = '10px';
    finishBtn.onclick = () => socket.emit('videoEnded');
    videoWrapper.appendChild(finishBtn);
}

function extractVideoId(url) {
    const match = url.match(/\/video\/(\d+)/);
    return match ? match[1] : '';
}

// Socket Events
socket.on('playVideo', (video) => {
    embedTikTok(video.url);
});

socket.on('stopVideo', () => {
    videoWrapper.innerHTML = `
        <div id="video-placeholder">
            <p>Nenhum vídeo sendo reproduzido</p>
            <small>Adicione um link do TikTok para começar</small>
        </div>
    `;
});

socket.on('updatePlaylist', (playlist) => {
    playlistItems.innerHTML = '';
    if (playlist.length === 0) {
        playlistItems.innerHTML = '<li class="empty-list">A fila está vazia</li>';
    } else {
        playlist.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<span>Vídeo de ${item.addedByName}</span>`;
            playlistItems.appendChild(li);
        });
    }
});

socket.on('newMessage', (msg) => {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<span class="msg-user" style="color:${msg.color}">${msg.user}:</span> <span class="msg-text">${msg.text}</span>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('updateUsers', (users) => {
    document.getElementById('online-count').innerText = `${users.length} online`;
});

// Voting Logic
socket.on('startVoting', ({ users }) => {
    votingOverlay.classList.remove('hidden');
    resultsOverlay.classList.add('hidden');
    votingOptions.innerHTML = '';
    votingStatus.innerText = 'Aguardando votos...';

    users.forEach(user => {
        const btn = document.createElement('button');
        btn.className = 'vote-btn';
        btn.innerHTML = user.avatar ? `<img src="${user.avatar}" class="avatar-xs"> ${user.name}` : user.name;
        btn.onclick = () => {
            socket.emit('castVote', user.id);
            votingOptions.querySelectorAll('button').forEach(b => b.disabled = true);
            votingStatus.innerText = 'Você votou em ' + user.name;
        };
        votingOptions.appendChild(btn);
    });
});

socket.on('revealResult', ({ correctUserId, correctUserName, results }) => {
    votingOverlay.classList.add('hidden');
    resultsOverlay.classList.remove('hidden');
    
    document.getElementById('result-title').innerText = 'O autor era...';
    document.getElementById('winner-reveal').innerText = correctUserName;
    
    const statsContainer = document.getElementById('voting-stats');
    statsContainer.innerHTML = '<h4>Votos recebidos:</h4>';
    for (let userId in results) {
        const count = results[userId];
        const p = document.createElement('p');
        p.innerText = `${count} voto(s)`;
        statsContainer.appendChild(p);
    }

    setTimeout(() => {
        resultsOverlay.classList.add('hidden');
    }, 4500);
});

// Chat Actions
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
