/* *****************
   Basit prototip app.js
   - WebSocket signaling (wss)
   - simple-peer mesh for audio
   - chat via signaling server (broadcast)
   ***************** */

const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') 
  + location.host + "/ws";

const ws = new WebSocket(WS_URL);

const ws = new WebSocket(WS_URL);

let localStream = null;
let peers = {}; // map: peerId -> SimplePeer instance
let myId = null;
let room = "genel";
let username = localStorage.getItem('ec_username') || "";
let avatarData = localStorage.getItem('ec_avatar') || null;

// UI refs
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const sendMsgBtn = document.getElementById('sendMsg');
const msgInput = document.getElementById('msgInput');
const messagesDiv = document.getElementById('messages');
const usersList = document.getElementById('usersList');
const audioPeersDiv = document.getElementById('audioPeers');
const usernameInput = document.getElementById('username');
const avatarFile = document.getElementById('avatarFile');
const avatarPreview = document.getElementById('avatarPreview');
const themeSelect = document.getElementById('themeSelect');
const toggleMicBtn = document.getElementById('toggleMic');
const statusText = document.getElementById('statusText');
const leaveMicBtn = document.getElementById('muteAll');

// init UI values
usernameInput.value = username;
if(avatarData) avatarPreview.style.backgroundImage = `url(${avatarData})`;

// theme change
themeSelect.onchange = (e) => {
  document.body.className = e.target.value;
  localStorage.setItem('ec_theme', e.target.value);
};
const savedTheme = localStorage.getItem('ec_theme');
if(savedTheme){ themeSelect.value = savedTheme; document.body.className = savedTheme; }

// avatar upload
avatarFile.onchange = async (e) => {
  const f = e.target.files[0];
  if(!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    avatarData = fr.result;
    avatarPreview.style.backgroundImage = `url(${avatarData})`;
    localStorage.setItem('ec_avatar', avatarData);
  };
  fr.readAsDataURL(f);
};

// WebSocket handling
ws.addEventListener('open', () => {
  console.log("WS connected");
  addSystemMessage("Sunucuya bağlandı");
  // tell server we'll identify ourselves (server just broadcasts everything)
});

ws.addEventListener('message', (ev) => {
  try {
    const data = JSON.parse(ev.data);
    handleSignal(data);
  } catch (err) {
    console.warn("Malformed message", ev.data);
  }
});

function sendSignal(obj){
  ws.send(JSON.stringify(obj));
}

// handle messages from server (we use a simple shape)
function handleSignal(msg){
  const { type, from, to, payload } = msg;
  if(type === 'welcome'){
    // server could set our id (if it implemented), but we don't have id from server.
    // We'll use WebSocket's own random identifiers managed client-side.
  }

  if(type === 'chat'){
    addChatMessage(payload.username || 'Anon', payload.text, payload.avatar);
  }

  if(type === 'join'){
    // new peer joined, create a peer connection (if not self)
    if(payload.id === myId) return;
    startPeerAsInitiator(payload.id, payload.username, payload.avatar);
    updateUsers(payload.users || []);
  }

  if(type === 'users'){
    // list of users
    updateUsers(payload || []);
  }

  if(type === 'signal'){
    const peerId = from;
    if(!peers[peerId]){
      // create non-initiator peer
      createPeerAsReceiver(peerId, payload.username, payload.avatar);
    }
    peers[peerId].signal(payload.signal);
  }

  if(type === 'leave'){
    const pid = payload.id;
    if(peers[pid]) {
      try{ peers[pid].destroy(); }catch(e){}
      delete peers[pid];
      removePeerUI(pid);
      addSystemMessage(`${payload.username || 'Bir kullanıcı'} odadan ayrıldı`);
    }
    updateUsers(payload.users || []);
  }
}

/* ---------- UI helpers ---------- */
function addSystemMessage(text){
  const el = document.createElement('div');
  el.className = 'message';
  el.innerHTML = `<div class="msgBox"><div class="who">Sistem</div><div class="time">${new Date().toLocaleTimeString()}</div><div style="margin-top:6px">${escapeHtml(text)}</div></div>`;
  messagesDiv.appendChild(el);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addChatMessage(who, text, avatar){
  const el = document.createElement('div');
  el.className = 'message';
  const av = avatar ? `style="background-image:url(${avatar})"` : '';
  el.innerHTML = `<div class="avatar" style="width:40px;height:40px;border-radius:8px;${av} background-size:cover"></div>
    <div class="msgBox">
      <div class="who">${escapeHtml(who)}</div>
      <div class="time">${new Date().toLocaleTimeString()}</div>
      <div style="margin-top:6px">${escapeHtml(text)}</div>
    </div>`;
  messagesDiv.appendChild(el);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

function updateUsers(list){
  usersList.innerHTML = '';
  list.forEach(u=>{
    const li = document.createElement('li');
    li.innerHTML = `<strong>${escapeHtml(u.username||'Anon')}</strong> ${u.id === myId ? '<small>(sen)</small>':''}`;
    usersList.appendChild(li);
  });
}

/* ---------- Chat send ---------- */
sendMsgBtn.onclick = () => sendChat();
msgInput.onkeypress = (e) => { if(e.key === 'Enter') sendChat(); };

function sendChat(){
  const txt = msgInput.value.trim();
  if(!txt) return;
  const payload = { type:'chat', payload: { text: txt, username: username || 'Anon', avatar: avatarData } };
  sendSignal(payload);
  addChatMessage(username||'Sen', txt, avatarData);
  msgInput.value = '';
}

/* ---------- Join / Leave logic ---------- */

joinBtn.onclick = async () => {
  username = (usernameInput.value || 'Anon').substring(0, 32);
  localStorage.setItem('ec_username', username);
  // get audio permission
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    statusText.textContent = 'Mikrofon hazır';
    toggleMicBtn.textContent = 'Mikrofon Kapat';
  } catch(e){
    alert('Mikrofon izni gerekli: ' + e.message);
    return;
  }

  // create an own random id to identify peers (since WS server doesn't assign ids)
  myId = generateId();
  // tell others we joined
  sendSignal({ type:'join', payload:{ id: myId, username, avatar: avatarData, room } });

  joinBtn.disabled = true;
  leaveBtn.disabled = false;
  addSystemMessage('Odaya katıldın. Mikrofon açık.');
};

leaveBtn.onclick = () => {
  sendSignal({ type:'leave', payload:{ id: myId, username, room } });
  // cleanup peers
  for(const k in peers){ try{ peers[k].destroy(); }catch(e){} }
  peers = {};
  localStream && localStream.getTracks().forEach(t=>t.stop());
  localStream = null;
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  statusText.textContent = 'Hazır';
  addSystemMessage('Odalardan ayrıldın.');
  updateUsers([]);
  audioPeersDiv.innerHTML = '';
};

/* ---------- Peer creation ---------- */

function startPeerAsInitiator(remoteId, remoteName, remoteAvatar){
  if(!localStream) return;
  if(peers[remoteId]) return;
  const p = new SimplePeer({ initiator: true, trickle: false, stream: localStream });
  setupPeer(p, remoteId, remoteName, remoteAvatar);
  peers[remoteId] = p;
  p.on('signal', (sig) => {
    sendSignal({ type:'signal', to: remoteId, from: myId, payload: { signal: sig, username, avatar: avatarData } });
  });
}

function createPeerAsReceiver(remoteId, remoteName, remoteAvatar){
  if(!localStream) return;
  if(peers[remoteId]) return;
  const p = new SimplePeer({ initiator: false, trickle: false, stream: localStream });
  setupPeer(p, remoteId, remoteName, remoteAvatar);
  peers[remoteId] = p;
  p.on('signal', (sig) => {
    sendSignal({ type:'signal', to: remoteId, from: myId, payload: { signal: sig, username, avatar: avatarData } });
  });
}

function setupPeer(p, remoteId, remoteName, remoteAvatar){
  // ensure UI placeholder
  addPeerUI(remoteId, remoteName, remoteAvatar);
  p.on('stream', stream => {
    // add audio element
    let el = document.querySelector(`#audio-${remoteId}`);
    if(!el){
      el = document.createElement('audio');
      el.id = `audio-${remoteId}`;
      el.autoplay = true;
      el.controls = false;
      document.body.appendChild(el); // hidden but required
    }
    el.srcObject = stream;
    // also show in right panel
    const pi = document.querySelector(`#peerItem-${remoteId} .playback`);
    if(pi) pi.textContent = '🔊';
  });
  p.on('close', ()=>{ removePeerUI(remoteId); try{ p.destroy(); }catch(e){} delete peers[remoteId]; });
  p.on('error', (e)=> console.warn('peer err', e));
}

/* ---------- UI for peers ---------- */
function addPeerUI(id, name, avatar){
  if(document.getElementById('peerItem-'+id)) return;
  const el = document.createElement('div');
  el.className = 'peerItem';
  el.id = 'peerItem-'+id;
  const av = avatar ? `style="background-image:url(${avatar})"` : '';
  el.innerHTML = `<div class="miniAv" ${av}></div><div style="flex:1"><strong>${escapeHtml(name||'Anon')}</strong><div class="small" id="peerStatus-${id}">Bağlanıyor…</div></div><div class="playback">⏸</div>`;
  audioPeersDiv.appendChild(el);
}

function removePeerUI(id){
  const el = document.getElementById('peerItem-'+id);
  if(el) el.remove();
  const audioEl = document.getElementById('audio-'+id);
  if(audioEl) audioEl.remove();
}

/* ---------- utilities ---------- */
function generateId(){ return 'id-' + Math.random().toString(36).slice(2,9); }

/* ---------- toggle mic (mute local) ---------- */
let micEnabled = true;
toggleMicBtn.onclick = () => {
  if(!localStream) return alert('Önce katıl');
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach(t=> t.enabled = micEnabled);
  toggleMicBtn.textContent = micEnabled ? 'Mikrofon Kapat' : 'Mikrofon Aç';
};

/* ---------- simple server-driven broadcast handler for join events ----------
   note: our simple WS server just broadcasts raw messages. We use a convention:
   - when join: client sends {type:'join', payload:{id, username, avatar, room}}
   - server simply broadcasts it; other clients will create initiator accordingly
-------------------------------------------------------------------------- */

window.addEventListener('beforeunload', () => {
  try{ sendSignal({ type:'leave', payload:{ id: myId, username, room } }); }catch(e){}
});

/* ---------- small note: server must deliver list of users for proper UI.
   Our simple prototyped server currently just broadcasts messages; for best UX
   we can rely on emitted 'join' messages and track locally. ---------- */

// When we receive 'join' from another client, server broadcasts to all and we
// will handle by creating initiator peer. To help testing,
// also react to raw 'broadcast' messages:
function rawBroadcastHandler(msg){
  // if server sends plain text, show
  addSystemMessage(JSON.stringify(msg));
}

/* ---------- send simple pings so others know who we are ---------- */
setInterval(()=>{
  // announce presence every 12s to help others discover us
  if(myId) sendSignal({ type:'presence', payload:{ id: myId, username, avatar: avatarData, room } });
}, 12000);
