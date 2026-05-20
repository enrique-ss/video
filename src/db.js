const crypto = require('crypto');
const { isOnline, isOffline, supabase, tableClient, sqlite, DEFAULT_BG } = require('./config');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function toPublicUser(row, token, acervo = []) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: row.avatar || null,
    bg_color: row.bg_color || DEFAULT_BG,
    token: token || null,
    acervo
  };
}

function sanitizeProfile({ name, avatar, bg_color }) {
  const out = {};
  if (name !== undefined && String(name).trim()) {
    out.name = String(name).trim().slice(0, 80);
  }
  if (avatar !== undefined) {
    out.avatar = avatar || null;
    if (out.avatar && out.avatar.length > 500000) {
      return { error: 'A imagem de perfil é muito grande.' };
    }
  }
  if (bg_color !== undefined) {
    const c = String(bg_color).trim();
    out.bg_color = /^#[0-9A-Fa-f]{6}$/.test(c) ? c : DEFAULT_BG;
  }
  return { data: out };
}

// ─── Leitura / escrita de perfil ───────────────────────────────────────────

async function findUserById(userId, token = null) {
  if (isOnline) {
    const { data, error } = await tableClient(token).from('users').select('*').eq('id', userId).maybeSingle();
    if (error) {
      console.error('findUserById:', error.message);
      return null;
    }
    return data;
  }
  if (sqlite) {
    return sqlite.prepare('SELECT * FROM users WHERE id = ?').get(userId) || null;
  }
  return null;
}

async function upsertUser(row, token = null) {
  if (isOnline) {
    const { error } = await tableClient(token).from('users').upsert(row);
    if (error) throw new Error(error.message);
    return findUserById(row.id, token);
  }
  if (sqlite) {
    const exists = sqlite.prepare('SELECT id FROM users WHERE id = ?').get(row.id);
    const now = new Date().toISOString();
    if (exists) {
      sqlite.prepare(`
        UPDATE users SET name = ?, email = ?, avatar = ?, bg_color = ?, updated_at = ?
        WHERE id = ?
      `).run(row.name, row.email, row.avatar ?? null, row.bg_color ?? DEFAULT_BG, now, row.id);
    } else {
      sqlite.prepare(`
        INSERT INTO users (id, name, email, password_hash, avatar, bg_color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.name, row.email, row.password_hash || hashPassword('local'),
        row.avatar ?? null, row.bg_color ?? DEFAULT_BG, row.created_at || now, now
      );
    }
    return findUserById(row.id);
  }
  throw new Error('Banco não configurado.');
}

async function ensureProfile(auth, patch = {}) {
  const existing = await findUserById(auth.id, auth.token);
  let email = (patch.email || existing?.email || auth.email || '').toLowerCase();

  if (!email && auth.token && isOnline) {
    const { data } = await supabase.auth.getUser(auth.token);
    email = data?.user?.email?.toLowerCase() || '';
  }

  if (!email) return existing;

  return upsertUser({
    id: auth.id,
    name: patch.name ?? existing?.name ?? auth.name ?? 'Usuário',
    email,
    password_hash: existing?.password_hash,
    avatar: patch.avatar !== undefined ? patch.avatar : (existing?.avatar ?? null),
    bg_color: patch.bg_color !== undefined ? patch.bg_color : (existing?.bg_color ?? DEFAULT_BG),
    created_at: existing?.created_at
  }, auth.token);
}

async function updateProfile(auth, fields) {
  const clean = sanitizeProfile(fields);
  if (clean.error) return { ok: false, error: clean.error };
  if (!Object.keys(clean.data).length) {
    return { ok: false, error: 'Nada para salvar.' };
  }
  await ensureProfile(auth, clean.data);
  return { ok: true };
}

async function loadFullUser(auth, token) {
  let profile = await findUserById(auth.id, token);
  if (!profile) profile = await ensureProfile(auth);
  const acervo = await listAcervo(auth.id, token);
  return toPublicUser(profile, token, acervo);
}

// ─── Acervo ────────────────────────────────────────────────────────────────

async function listAcervo(userId, token = null) {
  if (isOnline) {
    const { data, error } = await tableClient(token)
      .from('acervo')
      .select('*')
      .eq('user_id', userId)
      .order('id', { ascending: false });
    if (error) {
      console.error('listAcervo:', error.message);
      return [];
    }
    return data || [];
  }
  if (sqlite) {
    return sqlite.prepare('SELECT * FROM acervo WHERE user_id = ? ORDER BY id DESC').all(userId);
  }
  return [];
}

async function addToAcervo(userId, item, token = null) {
  if (isOnline) {
    const { error } = await tableClient(token).from('acervo').insert({
      user_id: userId,
      url: item.url,
      title: item.title,
      thumbnail: item.thumbnail,
      created_at: new Date().toISOString()
    });
    if (error) throw new Error(error.message);
    return listAcervo(userId, token);
  }
  if (sqlite) {
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO acervo (user_id, url, title, thumbnail, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, item.url, item.title, item.thumbnail, now);
    return listAcervo(userId);
  }
  throw new Error('Banco não configurado.');
}

async function removeFromAcervo(userId, url, token = null) {
  if (isOnline) {
    const { error } = await tableClient(token).from('acervo').delete().eq('user_id', userId).eq('url', url);
    if (error) throw new Error(error.message);
    return listAcervo(userId, token);
  }
  if (sqlite) {
    sqlite.prepare('DELETE FROM acervo WHERE user_id = ? AND url = ?').run(userId, url);
    return listAcervo(userId);
  }
  throw new Error('Banco não configurado.');
}

// ─── Auth (HTTP) ───────────────────────────────────────────────────────────

async function parseAuth(req) {
  if (isOnline) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice(7);
    if (!token || token === 'null') return null;
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return {
      id: data.user.id,
      token,
      email: data.user.email,
      name: data.user.user_metadata?.name || 'Usuário'
    };
  }
  const userId = req.query?.user_id || req.body?.user_id;
  if (!userId || !sqlite) return null;
  const row = sqlite.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  return row ? { id: userId, token: null, email: null, name: null } : null;
}

async function register({ name, email, password, avatar }) {
  const emailNorm = email.toLowerCase().trim();

  if (isOnline) {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: emailNorm,
      password,
      options: { data: { name } }
    });
    if (authError) throw new Error(authError.message);

    const id = authData.user.id;
    const token = authData.session?.access_token || null;
    const auth = { id, token, email: emailNorm, name };

    await upsertUser({
      id,
      name,
      email: emailNorm,
      avatar: avatar || null,
      bg_color: DEFAULT_BG
    }, token);

    return loadFullUser(auth, token);
  }

  if (!sqlite) throw new Error('Banco local não configurado.');

  const id = 'usr_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();
  try {
    sqlite.prepare(`
      INSERT INTO users (id, name, email, password_hash, avatar, bg_color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, emailNorm, hashPassword(password), avatar || null, DEFAULT_BG, now, now);
  } catch (err) {
    if (err.message.includes('UNIQUE')) throw new Error('Este e-mail já está em uso!');
    throw err;
  }
  return loadFullUser({ id, email: emailNorm, name }, null);
}

async function login({ email, password }) {
  const emailNorm = email.toLowerCase().trim();

  if (isOnline) {
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: emailNorm,
      password
    });
    if (error) throw new Error('E-mail ou senha incorretos!');

    const token = authData.session.access_token;
    const auth = {
      id: authData.user.id,
      token,
      email: authData.user.email,
      name: authData.user.user_metadata?.name || 'Usuário'
    };
    await ensureProfile(auth);
    return loadFullUser(auth, token);
  }

  if (!sqlite) throw new Error('Banco local não configurado.');

  const row = sqlite.prepare('SELECT * FROM users WHERE email = ?').get(emailNorm);
  if (!row || row.password_hash !== hashPassword(password)) {
    throw new Error('E-mail ou senha incorretos!');
  }
  return loadFullUser({ id: row.id, email: row.email, name: row.name }, null);
}

/** Valida token no modo online (socket). */
async function validateOnlineSession(userId, token) {
  if (!isOnline) return findUserById(userId);
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user || data.user.id !== userId) return null;
  let profile = await findUserById(userId, token);
  if (!profile) {
    profile = await ensureProfile({
      id: userId,
      token,
      email: data.user.email,
      name: data.user.user_metadata?.name || 'Usuário'
    });
  }
  return profile;
}

module.exports = {
  DEFAULT_BG,
  hashPassword,
  toPublicUser,
  findUserById,
  ensureProfile,
  updateProfile,
  loadFullUser,
  listAcervo,
  addToAcervo,
  removeFromAcervo,
  parseAuth,
  register,
  login,
  validateOnlineSession
};
