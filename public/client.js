/* ── Socket.io connection ── */
const socket = io({ transports: ['polling', 'websocket'] });

/* ── State ── */
let myName = '';
let myRole = ''; // 'student' | 'teacher'
let circleCount = 5;
let gameStatus = 'waiting'; // 'waiting' | 'playing' | 'finished'
let myWon = false;

/* ── DOM helpers ── */
const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

/* ── Socket connection status ── */
socket.on('connect', () => {
  $('btn-enter').disabled = false;
  $('btn-enter').textContent = '입장하기';

  // 재연결 시 자동으로 재입장 (이미 역할이 있는 경우)
  if (myRole === 'teacher') {
    socket.emit('teacher_join', 'TEACHER1234');
  } else if (myRole === 'student' && myName) {
    socket.emit('student_join', myName);
  }
});

socket.on('connect_error', () => {
  $('btn-enter').disabled = true;
  $('btn-enter').textContent = '서버 연결 중...';
});

socket.on('disconnect', () => {
  $('btn-enter').disabled = true;
  $('btn-enter').textContent = '재연결 중...';
});

// 초기 연결 전 버튼 비활성화
$('btn-enter').disabled = true;
$('btn-enter').textContent = '서버 연결 중...';

/* ──────────────────────────────────────────────
   LOGIN SCREEN
────────────────────────────────────────────── */
$('btn-enter').addEventListener('click', handleEnter);
$('input-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleEnter();
});

function handleEnter() {
  const val = $('input-name').value.trim();
  if (!val) return showError('이름을 입력해 주세요.');
  if (!socket.connected) return showError('서버에 연결 중입니다. 잠시 후 다시 시도해 주세요.');

  if (val === 'TEACHER1234') {
    socket.emit('teacher_join', val);
  } else {
    myName = val;
    socket.emit('student_join', val);
  }
}

function showError(msg) {
  const el = $('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

/* ──────────────────────────────────────────────
   TEACHER CONTROLS
────────────────────────────────────────────── */
$('btn-count-minus').addEventListener('click', () => {
  if (circleCount > 1) { circleCount--; $('circle-count').textContent = circleCount; }
});
$('btn-count-plus').addEventListener('click', () => {
  if (circleCount < 20) { circleCount++; $('circle-count').textContent = circleCount; }
});

$('btn-start').addEventListener('click', () => {
  socket.emit('start_game', circleCount);
});

$('btn-reset').addEventListener('click', () => {
  socket.emit('reset_game');
});

/* ──────────────────────────────────────────────
   SOCKET EVENTS
────────────────────────────────────────────── */

// Initial state on connect
socket.on('state_update', data => {
  gameStatus = data.status;
});

// Join response
socket.on('join_success', data => {
  myRole = data.role;
  gameStatus = data.status;

  if (data.role === 'teacher') {
    showScreen('screen-teacher');
    updateTeacherStudentList(data.students || []);

    if (data.status === 'playing') {
      // Teacher joined mid-game — show reset
      $('btn-start').classList.add('hidden');
      $('btn-reset').classList.remove('hidden');
    } else if (data.status === 'finished') {
      $('btn-start').classList.add('hidden');
      $('btn-reset').classList.remove('hidden');
      showTeacherWinners(data.winners || []);
    }
    return;
  }

  // Student
  $('wait-name').textContent = data.name;
  myWon = false;

  if (data.status === 'playing' && data.circles) {
    showGameScreen(data.circles, data.totalCircles);
  } else if (data.status === 'finished' && data.winners) {
    showResultScreen(data.winners);
  } else {
    showScreen('screen-student-wait');
  }
});

socket.on('wrong_code', () => {
  showError('교사 코드가 올바르지 않습니다.');
});

// Student list updates (both teacher & wait screens)
socket.on('student_list_update', students => {
  // Student wait screen
  const waitList = $('wait-student-list');
  waitList.innerHTML = students.map(n => `<span class="student-badge">${escHtml(n)}</span>`).join('');

  // Teacher screen
  updateTeacherStudentList(students);
});

function updateTeacherStudentList(students) {
  $('teacher-student-count').textContent = students.length;
  $('teacher-student-list').innerHTML = students.map(n =>
    `<span class="student-badge">${escHtml(n)}</span>`
  ).join('');
}

// Game started
socket.on('game_started', data => {
  gameStatus = 'playing';
  myWon = false;

  if (myRole === 'teacher') {
    // Teacher sees a summary overlay
    $('btn-start').classList.add('hidden');
    $('btn-reset').classList.remove('hidden');
    $('teacher-winners').classList.add('hidden');
    $('teacher-winner-list').innerHTML = '';
    return;
  }

  showGameScreen(data.circles, data.totalCircles);
});

// A circle was taken
socket.on('circle_taken', data => {
  if (myRole === 'teacher') {
    appendTeacherWinner(data.takenBy, data.order, data.circleId);
    return;
  }

  // Update the circle visually
  const el = document.querySelector(`.game-circle[data-id="${data.circleId}"]`);
  if (el) {
    el.classList.add('taken');
    el.textContent = data.order + '위';
    el.title = data.takenBy;
  }

  const total = parseInt($('circles-left').dataset.total || 0);
  const taken = document.querySelectorAll('.game-circle.taken').length;
  $('circles-left').textContent = `남은 원: ${total - taken}개`;

  if (data.takenBy === myName) {
    myWon = true;
    $('game-status-msg').textContent = `🎉 ${data.order}등으로 선정되었습니다!`;
    $('game-status-msg').style.color = '#fbbf24';
  }
});

// Game over
socket.on('game_over', data => {
  gameStatus = 'finished';

  if (myRole === 'teacher') {
    showTeacherWinners(data.winners);
    return;
  }

  setTimeout(() => showResultScreen(data.winners), 800);
});

// Game reset
socket.on('game_reset', () => {
  gameStatus = 'waiting';
  myWon = false;

  if (myRole === 'teacher') {
    $('btn-start').classList.remove('hidden');
    $('btn-reset').classList.add('hidden');
    $('teacher-winners').classList.add('hidden');
    $('teacher-winner-list').innerHTML = '';
    return;
  }

  // Student goes back to wait screen
  $('wait-name').textContent = myName;
  showScreen('screen-student-wait');
  $('game-status-msg').textContent = '';
  $('game-status-msg').style.color = '';
});

/* ──────────────────────────────────────────────
   GAME SCREEN RENDERING
────────────────────────────────────────────── */
function showGameScreen(circles, totalCircles) {
  showScreen('screen-game');

  $('game-name-tag').textContent = myName;
  $('circles-left').textContent = `남은 원: ${circles.filter(c => !c.takenBy).length}개`;
  $('circles-left').dataset.total = totalCircles;
  $('game-status-msg').textContent = '원을 빠르게 클릭하세요!';
  $('game-status-msg').style.color = '';

  const arena = $('circle-arena');
  arena.innerHTML = '';

  circles.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'game-circle pop-in';
    el.dataset.id = c.id;
    el.style.left = c.x + '%';
    el.style.top = c.y + '%';
    el.style.setProperty('--delay', (i * 0.06) + 's');

    if (c.takenBy) {
      el.classList.add('taken');
      el.textContent = circles.indexOf(c) + 1 + '위';
      el.title = c.takenBy;
    } else {
      el.textContent = '●';
      el.addEventListener('click', () => onCircleClick(c.id));
    }

    arena.appendChild(el);
  });
}

function onCircleClick(circleId) {
  if (gameStatus !== 'playing') return;
  socket.emit('click_circle', circleId);
}

/* ──────────────────────────────────────────────
   RESULT SCREEN
────────────────────────────────────────────── */
function showResultScreen(winners) {
  showScreen('screen-result');

  const isWinner = winners.some(w => w.name === myName);
  $('result-title').textContent = isWinner ? '🎉 축하합니다! 선정되었습니다!' : '📋 선착순 결과';

  $('result-list').innerHTML = winners.map(w => {
    const isMe = w.name === myName;
    const rankLabel = w.order === 1 ? '🥇' : w.order === 2 ? '🥈' : w.order === 3 ? '🥉' : `${w.order}위`;
    return `<div class="result-row${isMe ? ' me' : ''}">
      <span class="rank">${rankLabel}</span>
      <span>${escHtml(w.name)}${isMe ? ' (나)' : ''}</span>
    </div>`;
  }).join('');
}

/* ──────────────────────────────────────────────
   TEACHER WINNERS
────────────────────────────────────────────── */
function showTeacherWinners(winners) {
  const box = $('teacher-winners');
  const list = $('teacher-winner-list');
  box.classList.remove('hidden');
  list.innerHTML = '';
  winners.forEach(w => appendTeacherWinnerEl(w.name, w.order));
}

function appendTeacherWinner(name, order) {
  const box = $('teacher-winners');
  box.classList.remove('hidden');
  appendTeacherWinnerEl(name, order);
}

function appendTeacherWinnerEl(name, order) {
  const rankClass = order === 1 ? 'gold' : order === 2 ? 'silver' : order === 3 ? 'bronze' : '';
  const rankLabel = order === 1 ? '🥇' : order === 2 ? '🥈' : order === 3 ? '🥉' : `${order}위`;
  const row = document.createElement('div');
  row.className = 'winner-row';
  row.innerHTML = `<span class="winner-rank ${rankClass}">${rankLabel}</span><span>${escHtml(name)}</span>`;
  $('teacher-winner-list').appendChild(row);
}

/* ──────────────────────────────────────────────
   UTILS
────────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
