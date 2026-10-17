import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import initSqlJs from 'sql.js';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3001);
const jwtSecret = process.env.JWT_SECRET || 'gradepal-local-development-secret-change-me';
const here = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.join(here, '..', 'gradepal.db');
const SQL = await initSqlJs();
const db = existsSync(databasePath)
  ? new SQL.Database(new Uint8Array(readFileSync(databasePath)))
  : new SQL.Database();
const nativePrepare = db.prepare.bind(db);
db.run('PRAGMA foreign_keys = ON');
function persistDatabase() {
  const temporaryPath = `${databasePath}.tmp`;
  writeFileSync(temporaryPath, Buffer.from(db.export()));
  renameSync(temporaryPath, databasePath);
}
db.prepare = (sql) => ({
  run(...parameters) {
    db.run(sql, parameters);
    const result = db.exec('SELECT last_insert_rowid() AS id');
    persistDatabase();
    return { lastInsertRowid: result[0]?.values[0][0] ?? 0 };
  },
  get(...parameters) {
    const statement = nativePrepare(sql);
    statement.bind(parameters);
    const row = statement.step() ? statement.getAsObject() : undefined;
    statement.free();
    return row;
  },
  all(...parameters) {
    const statement = nativePrepare(sql);
    statement.bind(parameters);
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    statement.free();
    return rows;
  },
});
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
    avatar TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    teacher_id INTEGER NOT NULL REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS enrollments (
    student_id INTEGER NOT NULL REFERENCES users(id),
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    PRIMARY KEY (student_id, subject_id)
  );
  CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id),
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    title TEXT NOT NULL,
    score REAL NOT NULL CHECK(score >= 0 AND score <= 100),
    max_score REAL NOT NULL DEFAULT 100,
    comment TEXT NOT NULL DEFAULT '',
    graded_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    recipient_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
if (userCount === 0) {
  const addUser = db.prepare('INSERT INTO users (name, email, password_hash, role, avatar) VALUES (?, ?, ?, ?, ?)');
  const teacherId = Number(addUser.run('Alex Rivera', 'alex@gradepal.school', bcrypt.hashSync('teach123', 10), 'teacher', 'AR').lastInsertRowid);
  const studentId = Number(addUser.run('Maya Chen', 'maya@gradepal.school', bcrypt.hashSync('learn123', 10), 'student', 'MC').lastInsertRowid);
  const subjectId = Number(db.prepare('INSERT INTO subjects (name, color, teacher_id) VALUES (?, ?, ?)').run('Algebra II', '#84c8b2', teacherId).lastInsertRowid);
  const biologyId = Number(db.prepare('INSERT INTO subjects (name, color, teacher_id) VALUES (?, ?, ?)').run('Biology', '#efa77e', teacherId).lastInsertRowid);
  db.prepare('INSERT INTO enrollments (student_id, subject_id) VALUES (?, ?)').run(studentId, subjectId);
  db.prepare('INSERT INTO enrollments (student_id, subject_id) VALUES (?, ?)').run(studentId, biologyId);
  const addGrade = db.prepare('INSERT INTO grades (student_id, subject_id, title, score, max_score, comment, graded_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  [
    [subjectId, 'Linear equations quiz', 82, 'Nice work showing every step. Check signs carefully next time.', '2026-09-03'],
    [biologyId, 'Cell structures lab', 94, 'Your observations were thoughtful and detailed.', '2026-09-08'],
    [subjectId, 'Functions practice', 87, 'Great improvement on graphing. Keep it going!', '2026-09-12'],
    [biologyId, 'Genetics check-in', 89, 'Strong understanding of dominant and recessive traits.', '2026-09-18'],
    [subjectId, 'Systems of equations', 92, 'Excellent strategy choosing substitution here.', '2026-09-23'],
    [biologyId, 'Ecosystems project', 96, 'A standout project, Maya. Your examples were clear.', '2026-09-29'],
  ].forEach(([subject, title, score, comment, date]) => addGrade.run(studentId, subject, title, score, 100, comment, date));
}

function authenticate(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

function requireRole(role) {
  return (req, res, next) => req.user.role === role
    ? next()
    : res.status(403).json({ error: `${role === 'teacher' ? 'Teacher' : 'Student'} access is required.` });
}

const userById = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?');
const subjectRows = db.prepare(`SELECT s.id, s.name, s.color FROM subjects s
  JOIN enrollments e ON e.subject_id = s.id WHERE e.student_id = ? ORDER BY s.id`);
const gradeRows = db.prepare(`SELECT g.id, g.student_id AS studentId, g.subject_id AS subjectId,
  s.name AS subject, s.color, g.title, g.score, g.max_score AS maxScore, g.comment, g.graded_at AS date,
  u.name AS studentName FROM grades g JOIN subjects s ON s.id = g.subject_id
  JOIN users u ON u.id = g.student_id ORDER BY g.graded_at, g.id`);
const gradeById = db.prepare(`SELECT g.id, g.student_id AS studentId, g.subject_id AS subjectId,
  s.name AS subject, s.color, g.title, g.score, g.max_score AS maxScore, g.comment, g.graded_at AS date,
  u.name AS studentName FROM grades g JOIN subjects s ON s.id = g.subject_id
  JOIN users u ON u.id = g.student_id WHERE g.id = ?`);

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'That email and password did not match.' });
  }
  const profile = { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar };
  const token = jwt.sign(profile, jwtSecret, { expiresIn: '12h' });
  return res.json({ token, user: profile });
});

app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: userById.get(req.user.id) }));

app.get('/api/grades', authenticate, (req, res) => {
  const all = gradeRows.all();
  const visible = req.user.role === 'student'
    ? all.filter((grade) => grade.studentId === req.user.id)
    : all.filter((grade) => db.prepare('SELECT 1 FROM subjects WHERE id = ? AND teacher_id = ?').get(grade.subjectId, req.user.id));
  res.json({ grades: visible, subjects: req.user.role === 'student' ? subjectRows.all(req.user.id) : db.prepare('SELECT id, name, color FROM subjects WHERE teacher_id = ? ORDER BY id').all(req.user.id) });
});

app.get('/api/students', authenticate, requireRole('teacher'), (req, res) => {
  const students = db.prepare(`SELECT DISTINCT u.id, u.name, u.email, u.avatar FROM users u
    JOIN enrollments e ON e.student_id = u.id JOIN subjects s ON s.id = e.subject_id
    WHERE s.teacher_id = ? ORDER BY u.name`).all(req.user.id);
  res.json({ students });
});

app.post('/api/grades', authenticate, requireRole('teacher'), (req, res) => {
  const { studentId, subjectId, title, score, comment = '', date } = req.body || {};
  const numericScore = Number(score);
  if (!Number.isInteger(Number(studentId)) || !Number.isInteger(Number(subjectId)) || !String(title || '').trim() || !Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
    return res.status(400).json({ error: 'Enter a title and a score from 0 to 100.' });
  }
  const allowed = db.prepare(`SELECT 1 FROM subjects s JOIN enrollments e ON e.subject_id = s.id
    WHERE s.id = ? AND s.teacher_id = ? AND e.student_id = ?`).get(Number(subjectId), req.user.id, Number(studentId));
  if (!allowed) return res.status(403).json({ error: 'You can only grade your own students in your subjects.' });
  const gradeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : new Date().toISOString().slice(0, 10);
  const result = db.prepare(`INSERT INTO grades (student_id, subject_id, title, score, comment, graded_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(Number(studentId), Number(subjectId), String(title).trim(), numericScore, String(comment).slice(0, 500), gradeDate);
  res.status(201).json({ grade: gradeById.get(Number(result.lastInsertRowid)) });
});

app.put('/api/grades/:id', authenticate, requireRole('teacher'), (req, res) => {
  const grade = db.prepare(`SELECT g.id, g.student_id AS studentId, g.subject_id AS subjectId FROM grades g
    JOIN subjects s ON s.id = g.subject_id WHERE g.id = ? AND s.teacher_id = ?`).get(Number(req.params.id), req.user.id);
  if (!grade) return res.status(404).json({ error: 'Grade not found in your classes.' });
  const { title, score, comment = '', date } = req.body || {};
  const numericScore = Number(score);
  if (!String(title || '').trim() || !Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
    return res.status(400).json({ error: 'Enter a title and a score from 0 to 100.' });
  }
  const gradeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : new Date().toISOString().slice(0, 10);
  db.prepare('UPDATE grades SET title = ?, score = ?, comment = ?, graded_at = ? WHERE id = ?')
    .run(String(title).trim(), numericScore, String(comment).slice(0, 500), gradeDate, grade.id);
  res.json({ ok: true });
});

function canMessage(sender, recipient) {
  const peer = userById.get(recipient);
  if (!peer || sender.id === recipient) return false;
  if (sender.role === 'student') {
    return Boolean(db.prepare(`SELECT 1 FROM enrollments e JOIN subjects s ON s.id = e.subject_id
      WHERE e.student_id = ? AND s.teacher_id = ?`).get(sender.id, recipient));
  }
  if (peer.role === 'student') {
    return Boolean(db.prepare(`SELECT 1 FROM enrollments e JOIN subjects s ON s.id = e.subject_id
      WHERE e.student_id = ? AND s.teacher_id = ?`).get(recipient, sender.id));
  }
  return sender.role === 'teacher' && peer.role === 'teacher';
}

app.get('/api/messages/:peerId', authenticate, (req, res) => {
  const peerId = Number(req.params.peerId);
  if (!canMessage(req.user, peerId)) return res.status(403).json({ error: 'You cannot message this person.' });
  const messages = db.prepare(`SELECT m.id, m.sender_id AS senderId, m.recipient_id AS recipientId,
    m.body, m.sent_at AS sentAt FROM messages m WHERE
    (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
    ORDER BY m.id`).all(req.user.id, peerId, peerId, req.user.id);
  res.json({ messages });
});

app.post('/api/messages', authenticate, (req, res) => {
  const recipientId = Number(req.body?.recipientId);
  const body = String(req.body?.body || '').trim().slice(0, 1000);
  if (!body) return res.status(400).json({ error: 'Write a message first.' });
  if (!canMessage(req.user, recipientId)) return res.status(403).json({ error: 'You cannot message this person.' });
  const result = db.prepare('INSERT INTO messages (sender_id, recipient_id, body) VALUES (?, ?, ?)').run(req.user.id, recipientId, body);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.get('/api/contacts', authenticate, (req, res) => {
  const contacts = req.user.role === 'student'
    ? db.prepare(`SELECT DISTINCT u.id, u.name, u.role, u.avatar FROM users u JOIN subjects s ON s.teacher_id = u.id
      JOIN enrollments e ON e.subject_id = s.id WHERE e.student_id = ? ORDER BY u.name`).all(req.user.id)
    : db.prepare(`SELECT DISTINCT u.id, u.name, u.role, u.avatar FROM users u
      WHERE (u.role = 'student' AND EXISTS (SELECT 1 FROM enrollments e JOIN subjects s ON s.id = e.subject_id WHERE e.student_id = u.id AND s.teacher_id = ?))
      OR u.role = 'teacher' AND u.id != ? ORDER BY u.name`).all(req.user.id, req.user.id);
  res.json({ contacts });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const clientDist = path.join(here, '..', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(clientDist, 'index.html')));

app.listen(port, () => console.log(`GradePal API listening on http://localhost:${port}`));
