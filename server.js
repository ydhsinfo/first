const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const TEACHER_CODE = 'TEACHER1234';

// Game state
let gameState = {
  status: 'waiting',   // 'waiting' | 'playing' | 'finished'
  totalCircles: 5,
  circles: [],         // { id, x, y, takenBy }
  winners: [],         // [{ name, order }]
  students: {}         // socketId -> name
};

app.use(express.static(path.join(__dirname, 'public')));

function resetGame() {
  gameState.status = 'waiting';
  gameState.circles = [];
  gameState.winners = [];
}

function generateCircles(count) {
  const circles = [];
  const margin = 8; // percent from edge
  const minDist = 12; // minimum distance between circles (percent)

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let x, y;
    do {
      x = margin + Math.random() * (100 - 2 * margin);
      y = margin + Math.random() * (100 - 2 * margin);
      attempts++;
    } while (
      attempts < 100 &&
      circles.some(c => Math.hypot(c.x - x, c.y - y) < minDist)
    );
    circles.push({ id: i, x, y, takenBy: null });
  }
  return circles;
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // Send current state to new connection
  socket.emit('state_update', {
    status: gameState.status,
    circles: gameState.circles,
    winners: gameState.winners,
    students: Object.values(gameState.students),
    totalCircles: gameState.totalCircles
  });

  // Student joins
  socket.on('student_join', (name) => {
    if (!name || typeof name !== 'string') return;
    const cleanName = name.trim().slice(0, 20);
    if (!cleanName) return;

    gameState.students[socket.id] = cleanName;
    console.log(`Student joined: ${cleanName}`);

    io.emit('student_list_update', Object.values(gameState.students));
    socket.emit('join_success', {
      name: cleanName,
      role: 'student',
      status: gameState.status,
      circles: gameState.circles,
      winners: gameState.winners,
      totalCircles: gameState.totalCircles
    });
  });

  // Teacher joins
  socket.on('teacher_join', (code) => {
    if (code === TEACHER_CODE) {
      socket.join('teachers');
      socket.emit('join_success', {
        role: 'teacher',
        status: gameState.status,
        circles: gameState.circles,
        winners: gameState.winners,
        totalCircles: gameState.totalCircles,
        students: Object.values(gameState.students)
      });
      console.log(`Teacher connected: ${socket.id}`);
    } else {
      socket.emit('wrong_code');
    }
  });

  // Teacher starts game
  socket.on('start_game', (count) => {
    if (!socket.rooms.has('teachers')) return;
    const n = Math.max(1, Math.min(20, parseInt(count) || 5));

    gameState.status = 'playing';
    gameState.totalCircles = n;
    gameState.circles = generateCircles(n);
    gameState.winners = [];

    io.emit('game_started', {
      circles: gameState.circles,
      totalCircles: n
    });
    console.log(`Game started with ${n} circles`);
  });

  // Student clicks a circle
  socket.on('click_circle', (circleId) => {
    if (gameState.status !== 'playing') return;
    const name = gameState.students[socket.id];
    if (!name) return;

    const circle = gameState.circles.find(c => c.id === circleId);
    if (!circle || circle.takenBy !== null) return;

    // Check this student hasn't already won
    if (gameState.winners.some(w => w.name === name)) return;

    circle.takenBy = name;
    const order = gameState.winners.length + 1;
    gameState.winners.push({ name, order });

    io.emit('circle_taken', {
      circleId,
      takenBy: name,
      order
    });

    console.log(`Circle ${circleId} taken by ${name} (order: ${order})`);

    // Check if all circles are taken
    if (gameState.winners.length >= gameState.totalCircles) {
      gameState.status = 'finished';
      io.emit('game_over', { winners: gameState.winners });
      console.log('Game over. Winners:', gameState.winners.map(w => w.name));
    }
  });

  // Teacher resets game
  socket.on('reset_game', () => {
    if (!socket.rooms.has('teachers')) return;
    resetGame();
    io.emit('game_reset');
    console.log('Game reset by teacher');
  });

  socket.on('disconnect', () => {
    if (gameState.students[socket.id]) {
      console.log(`Student disconnected: ${gameState.students[socket.id]}`);
      delete gameState.students[socket.id];
      io.emit('student_list_update', Object.values(gameState.students));
    }
    console.log(`Disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Teacher code: ${TEACHER_CODE}`);
});
