import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, BookOpen, CalendarDays,
  Check, ChevronDown, CircleHelp, GraduationCap, LayoutDashboard, LogOut,
  MessageCircle, Plus, Send, Sparkles, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const API = 'http://localhost:3001/api';
const demoAccounts = {
  student: { email: 'maya@gradepal.school', password: 'learn123' },
  teacher: { email: 'alex@gradepal.school', password: 'teach123' },
};

async function request(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
  return payload;
}

function gradeInfo(score) {
  if (score >= 90) return { letter: 'A', mood: '🌟', label: 'Brilliant', tone: 'mint' };
  if (score >= 80) return { letter: 'B', mood: '😊', label: 'Looking good', tone: 'blue' };
  if (score >= 70) return { letter: 'C', mood: '🙂', label: 'Keep building', tone: 'yellow' };
  if (score >= 60) return { letter: 'D', mood: '😐', label: 'Room to grow', tone: 'orange' };
  return { letter: 'F', mood: '😟', label: 'You can do this', tone: 'coral' };
}

function average(grades) {
  return grades.length ? Math.round(grades.reduce((sum, item) => sum + item.score, 0) / grades.length) : 0;
}

function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gradepal-session') || 'null'); } catch { return null; }
  });
  const [grades, setGrades] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [chatTab, setChatTab] = useState('people');
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [studyInput, setStudyInput] = useState('');
  const [studyReply, setStudyReply] = useState('Hey Maya! Ask me about a class or try: “How can I study for a quiz?”');
  const [showGradeForm, setShowGradeForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const token = session?.token;
  const isTeacher = session?.user?.role === 'teacher';
  const myAverage = useMemo(() => average(grades), [grades]);
  const chartData = useMemo(() => grades.map((grade) => ({
    ...grade,
    dateLabel: new Date(`${grade.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  })), [grades]);

  async function refreshData(authToken = token) {
    const [gradeData, contactData] = await Promise.all([
      request('/grades', authToken),
      request('/contacts', authToken),
    ]);
    setGrades(gradeData.grades);
    setSubjects(gradeData.subjects);
    setContacts(contactData.contacts);
    if (session?.user?.role === 'teacher') {
      const studentData = await request('/students', authToken);
      setStudents(studentData.students);
    }
  }

  useEffect(() => {
    if (!token) return;
    refreshData().catch(() => signOut());
  }, [token]);

  useEffect(() => {
    if (!token || !selectedContact) return;
    request(`/messages/${selectedContact.id}`, token)
      .then((data) => setMessages(data.messages))
      .catch((cause) => setError(cause.message));
  }, [token, selectedContact]);

  async function signIn(email, password) {
    setBusy(true);
    setError('');
    try {
      const data = await request('/auth/login', null, { method: 'POST', body: JSON.stringify({ email, password }) });
      const nextSession = { token: data.token, user: data.user };
      localStorage.setItem('gradepal-session', JSON.stringify(nextSession));
      setSession(nextSession);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    localStorage.removeItem('gradepal-session');
    setSession(null);
    setGrades([]);
    setContacts([]);
    setSelectedContact(null);
    setActiveTab('overview');
  }

  async function saveGrade(form) {
    setBusy(true);
    setError('');
    try {
      await request('/grades', token, { method: 'POST', body: JSON.stringify(form) });
      await refreshData();
      setShowGradeForm(false);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!selectedContact || !messageText.trim()) return;
    const body = messageText.trim();
    setMessageText('');
    try {
      await request('/messages', token, { method: 'POST', body: JSON.stringify({ recipientId: selectedContact.id, body }) });
      const data = await request(`/messages/${selectedContact.id}`, token);
      setMessages(data.messages);
    } catch (cause) {
      setError(cause.message);
      setMessageText(body);
    }
  }

  function askStudyBuddy(event) {
    event.preventDefault();
    const question = studyInput.trim();
    if (!question) return;
    const lower = question.toLowerCase();
    const reply = lower.includes('grade') || lower.includes('average')
      ? `Your current average is ${myAverage}%. ${gradeInfo(myAverage).mood} That comes from ${grades.length} graded assignments. You're making progress!`
      : lower.includes('algebra') || lower.includes('math')
        ? 'For Algebra, try one worked example at a time: write each step, check your signs, then explain why the answer makes sense. Small practice sessions really add up!'
        : lower.includes('bio') || lower.includes('science')
          ? 'For Biology, turn each topic into a quick sketch or a few flashcards. Try explaining a process out loud without looking at your notes.'
          : 'Try a 20-minute focus session, then take a short break. Pick one small goal, practice it, and finish by writing down what clicked. You’ve got this!';
    setStudyReply(reply);
    setStudyInput('');
  }

  if (!session) return <Login onSignIn={signIn} busy={busy} error={error} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="school-label">YOUR SPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={activeTab === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('overview')}>
            <LayoutDashboard size={19} /> <span>Overview</span>
          </button>
          <button className={activeTab === 'classes' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('classes')}>
            <BookOpen size={19} /> <span>{isTeacher ? 'My classes' : 'My subjects'}</span>
          </button>
          <button className={activeTab === 'messages' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('messages')}>
            <MessageCircle size={19} /> <span>Messages</span><span className="nav-dot" />
          </button>
          {!isTeacher && <button className={activeTab === 'study' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('study')}>
            <Sparkles size={19} /> <span>Study buddy</span>
          </button>}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="note-spark">✳</span><strong>{isTeacher ? 'Little wins add up.' : 'Progress, not perfection.'}</strong><span>Keep showing up. It matters.</span></div>
          <button className="profile-row" onClick={signOut} title="Sign out">
            <span className={`avatar ${isTeacher ? 'avatar-peach' : ''}`}>{session.user.avatar || 'GP'}</span>
            <span className="profile-copy"><strong>{session.user.name}</strong><small>{isTeacher ? 'Teacher' : 'Student account'}</small></span>
            <LogOut size={17} className="logout-icon" />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>My space</span><ArrowRight size={14} /><strong>{activeTab === 'overview' ? 'Overview' : activeTab === 'classes' ? (isTeacher ? 'My classes' : 'My subjects') : activeTab === 'messages' ? 'Messages' : 'Study buddy'}</strong></div>
          <div className="topbar-right"><span className="term-pill"><span className="status-dot" /> Fall semester <ChevronDown size={14} /></span><button className="help-button" title="Help"><CircleHelp size={19} /></button></div>
        </header>

        <div className="page-wrap">
          {error && <div className="notice" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}
          {activeTab === 'overview' && <Overview
            user={session.user} isTeacher={isTeacher} grades={grades} subjects={subjects} students={students}
            average={myAverage} chartData={chartData} onAdd={() => setShowGradeForm(true)} onNavigate={setActiveTab}
          />}
          {activeTab === 'classes' && <Classes isTeacher={isTeacher} grades={grades} subjects={subjects} students={students} onAdd={() => setShowGradeForm(true)} />}
          {activeTab === 'messages' && <Messages
            isTeacher={isTeacher} contacts={contacts} selected={selectedContact} setSelected={setSelectedContact}
            messages={messages} user={session.user} value={messageText} setValue={setMessageText} onSend={sendMessage}
            chatTab={chatTab} setChatTab={setChatTab}
          />}
          {activeTab === 'study' && <StudyBuddy reply={studyReply} value={studyInput} setValue={setStudyInput} onAsk={askStudyBuddy} />}
        </div>
      </main>
      {showGradeForm && <GradeForm subjects={subjects} students={students} onClose={() => setShowGradeForm(false)} onSave={saveGrade} busy={busy} />}
    </div>
  );
}

function Brand() {
  return <div className="brand"><div className="brand-mark"><GraduationCap size={23} strokeWidth={2.4} /><span className="brand-spark">✦</span></div><span>gradepal<span className="brand-period">.</span></span></div>;
}

function Login({ onSignIn, busy, error }) {
  const [role, setRole] = useState('student');
  const [email, setEmail] = useState(demoAccounts.student.email);
  const [password, setPassword] = useState(demoAccounts.student.password);
  function switchRole(nextRole) {
    setRole(nextRole);
    setEmail(demoAccounts[nextRole].email);
    setPassword(demoAccounts[nextRole].password);
  }
  function submit(event) { event.preventDefault(); onSignIn(email, password); }
  return <div className="login-page">
    <div className="login-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-sticker sticker-star">✳</div><div className="art-sticker sticker-pencil">✎</div><div className="cap-character"><span className="cap-top" /><span className="cap-face"><i /><i /><b /></span><span className="cap-tassel" /></div><span className="art-caption">One step at a time.</span></div>
    <section className="login-panel"><Brand /><div className="login-copy"><span className="eyebrow">YOUR LEARNING, IN FULL COLOR</span><h1>A little progress<br />goes a long way.</h1><p>Keep track of your grades, celebrate the wins, and find your next step.</p></div>
      <div className="role-switch" role="tablist" aria-label="Choose account type"><button className={role === 'student' ? 'selected' : ''} onClick={() => switchRole('student')} role="tab" aria-selected={role === 'student'}>I'm a student</button><button className={role === 'teacher' ? 'selected' : ''} onClick={() => switchRole('teacher')} role="tab" aria-selected={role === 'teacher'}>I'm a teacher</button></div>
      <form className="login-form" onSubmit={submit}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error && <p className="form-error">{error}</p>}<button className="button-primary login-submit" disabled={busy}>{busy ? 'Signing you in…' : 'Let’s go'} <ArrowRight size={18} /></button></form>
      <div className="login-foot"><span>Made for the next small win</span><span className="foot-spark">✳</span></div>
    </section>
  </div>;
}

function Overview({ user, isTeacher, grades, subjects, students, average: score, chartData, onAdd, onNavigate }) {
  const currentGrade = gradeInfo(score);
  const latest = [...grades].reverse().slice(0, 3);
  const bestSubject = subjects.map((subject) => ({ ...subject, score: average(grades.filter((grade) => grade.subjectId === subject.id)) })).sort((a, b) => b.score - a.score)[0];
  return <>
    <section className="welcome-row"><div><div className="date-line"><CalendarDays size={15} /> {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()}</div><h1>{isTeacher ? `Good morning, ${user.name.split(' ')[0]}` : `Hey, ${user.name.split(' ')[0]}`} <span className="wave">{isTeacher ? '☀️' : '✦'}</span></h1><p>{isTeacher ? 'Here’s a little snapshot of how your students are doing.' : 'You’re showing up for yourself. That’s worth celebrating.'}</p></div>{isTeacher && <button className="button-primary add-grade" onClick={onAdd}><Plus size={17} /> Add a grade</button>}</section>
    <section className="stat-grid">
      <article className="stat-card average-card"><div className="stat-top"><span>{isTeacher ? 'CLASS AVERAGE' : 'YOUR AVERAGE'}</span><span className="stat-icon tint-mint"><Activity size={17} /></span></div><div className="stat-main"><strong>{score}<small>%</small></strong><span className={`grade-chip ${currentGrade.tone}`}>{currentGrade.mood} {currentGrade.letter}</span></div><div className="stat-foot">Across all graded work</div><div className="stat-wave wave-mint" /></article>
      <article className="stat-card assignment-card"><div className="stat-top"><span>{isTeacher ? 'STUDENTS' : 'GRADED ASSIGNMENTS'}</span><span className="stat-icon tint-peach"><BookOpen size={17} /></span></div><div className="stat-main"><strong>{isTeacher ? students.length : grades.length}</strong><span className="assignment-label">{isTeacher ? 'in your classes' : 'and counting'}</span></div><div className="stat-foot"><span>{isTeacher ? 'Across' : 'Across'} {subjects.length} subjects</span></div><div className="stat-wave wave-peach" /></article>
      <article className="stat-card subject-card"><div className="stat-top"><span>{isTeacher ? 'SUBJECTS' : 'TOP SUBJECT'}</span><span className="stat-icon tint-lilac"><Sparkles size={17} /></span></div><div className="subject-highlight"><span className="subject-emoji">{isTeacher ? '📚' : bestSubject?.name === 'Biology' ? '🧬' : '📐'}</span><div><strong>{isTeacher ? subjects.length : bestSubject?.name || 'Not yet'}</strong><small>{isTeacher ? 'you’re teaching' : bestSubject ? `${bestSubject.score}% average` : 'Keep going!'}</small></div></div><div className="stat-foot">{isTeacher ? 'Your students are lucky to have you.' : 'You’re finding your rhythm.'}</div></article>
    </section>
    <section className="content-grid">
      <article className="panel trend-panel"><div className="panel-heading"><div><h2>{isTeacher ? 'Class progress' : 'Your progress'}</h2><p>{isTeacher ? 'Scores across recent assignments' : 'Your grades are moving in the right direction'}</p></div><button className="subtle-select">All subjects <ChevronDown size={14} /></button></div><div className="chart-legend"><span><i className="legend-dot" /> Grade score</span><span className="chart-range">ASSIGNMENT HISTORY</span></div><div className="chart-wrap">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 15, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#79bba4" stopOpacity={0.23} /><stop offset="100%" stopColor="#79bba4" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#edf0eb" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{ fill: '#9a9c98', fontSize: 11 }} tickMargin={12} /><YAxis domain={[50, 100]} axisLine={false} tickLine={false} tick={{ fill: '#9a9c98', fontSize: 11 }} tickFormatter={(value) => `${value}%`} /><Tooltip content={<ChartTooltip />} /><Area type="monotone" dataKey="score" stroke="#79bba4" strokeWidth={3} fill="url(#scoreFill)" activeDot={{ r: 5, fill: '#79bba4', stroke: '#fff', strokeWidth: 3 }} /></AreaChart></ResponsiveContainer> : <div className="empty-chart">Your chart will appear as grades come in.</div>}</div></article>
      <article className="panel subjects-panel"><div className="panel-heading"><div><h2>{isTeacher ? 'Your subjects' : 'Subject snapshot'}</h2><p>A quick look at each class</p></div><button className="icon-link" onClick={() => onNavigate('classes')} aria-label="View all subjects"><ArrowRight size={17} /></button></div><div className="subject-list">{subjects.map((subject) => { const items = grades.filter((grade) => grade.subjectId === subject.id); const subjectAverage = average(items); return <div className="subject-row" key={subject.id}><span className="subject-icon" style={{ '--subject-color': subject.color }}>{subject.name === 'Biology' ? '🧬' : subject.name.toLowerCase().includes('english') ? '✍️' : '📐'}</span><div className="subject-info"><strong>{subject.name}</strong><span>{items.length} assignments</span></div><div className="subject-score"><strong>{subjectAverage}%</strong><span className="mini-progress"><i style={{ width: `${subjectAverage}%`, background: subject.color }} /></span></div></div>; })}</div><button className="text-link" onClick={() => onNavigate('classes')}>View all subjects <ArrowRight size={15} /></button></article>
    </section>
    <section className="bottom-grid"><article className="panel recent-panel"><div className="panel-heading"><div><h2>{isTeacher ? 'Recent grades' : 'Recent grades'}</h2><p>{isTeacher ? 'Latest updates from your students' : 'A few of your latest wins'}</p></div><button className="text-link compact-link" onClick={() => onNavigate('classes')}>See all <ArrowRight size={14} /></button></div>{latest.length ? <div className="recent-list">{latest.map((grade) => <GradeRow key={grade.id} grade={grade} isTeacher={isTeacher} />)}</div> : <div className="empty-state">No grades yet — you’ve got this! 💪</div>}</article>
      <article className="encouragement"><div className="encouragement-top"><span className="encouragement-flower">✿</span><span className="mini-tag">A NOTE FOR YOU</span></div><h2>{isTeacher ? 'Every bit of feedback helps.' : 'You’re doing better than you think.'}</h2><p>{isTeacher ? 'A thoughtful comment can turn a grade into a next step.' : 'Learning isn’t a straight line. Every try counts, especially the ones that feel a little hard.'}</p><div className="quote-by"><span className="quote-avatar">{isTeacher ? '✎' : '✦'}</span><span>{isTeacher ? 'A little encouragement goes far' : 'A reminder from your study buddy'}</span></div><span className="decor-star decor-star-one">✳</span><span className="decor-star decor-star-two">✦</span></article>
    </section>
  </>;
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const grade = payload[0].payload;
  return <div className="chart-tooltip"><strong>{grade.score}% {gradeInfo(grade.score).mood}</strong><span>{grade.title}</span><small>{grade.dateLabel}</small></div>;
}

function GradeRow({ grade, isTeacher }) {
  const info = gradeInfo(grade.score);
  return <div className="grade-row"><span className={`grade-emoji ${info.tone}`}>{info.mood}</span><div className="grade-row-copy"><strong>{grade.title}</strong><span>{isTeacher ? `${grade.studentName} · ` : ''}{grade.subject} <i>·</i> {new Date(`${grade.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>{grade.comment && !isTeacher && <small className="teacher-comment">“{grade.comment}”</small>}</div><div className="grade-result"><strong>{grade.score}<small>%</small></strong><span>{info.letter}</span></div></div>;
}

function Classes({ isTeacher, grades, subjects, students, onAdd }) {
  return <section className="classes-view"><div className="view-heading"><div><span className="eyebrow">{isTeacher ? 'YOUR TEACHING' : 'YOUR LEARNING'}</span><h1>{isTeacher ? 'My classes' : 'My subjects'}</h1><p>{isTeacher ? 'The people and progress in your classroom.' : 'Everything you’re learning, all in one place.'}</p></div>{isTeacher && <button className="button-primary add-grade" onClick={onAdd}><Plus size={17} /> Add a grade</button>}</div><div className="class-grid">{subjects.map((subject, index) => { const list = grades.filter((grade) => grade.subjectId === subject.id); const classStudents = isTeacher ? students : []; return <article className="class-card" key={subject.id}><div className="class-card-top" style={{ '--subject-color': subject.color }}><span className="class-emoji">{subject.name === 'Biology' ? '🧬' : '📐'}</span><span className="class-number">CLASS 0{index + 1}</span></div><div className="class-body"><h2>{subject.name}</h2><p>{isTeacher ? 'with your students' : 'with Alex Rivera'}</p><div className="class-stats"><div><strong>{average(list)}%</strong><small>{isTeacher ? 'class average' : 'your average'}</small></div><div><strong>{list.length}</strong><small>assignments</small></div></div>{isTeacher && <div className="student-pills">{classStudents.map((student) => <span key={student.id}>{student.avatar} {student.name}</span>)}</div>}</div><div className="class-card-foot"><span>{isTeacher ? 'Recently updated' : 'Updated recently'}</span><span className="class-arrow"><ArrowRight size={16} /></span></div></article>; })}</div></section>;
}

function GradeForm({ subjects, students, onClose, onSave, busy }) {
  const [studentId, setStudentId] = useState(students[0]?.id || '');
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || '');
  const [title, setTitle] = useState('');
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  function submit(event) { event.preventDefault(); onSave({ studentId: Number(studentId), subjectId: Number(subjectId), title, score: Number(score), comment, date }); }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="grade-modal" role="dialog" aria-modal="true" aria-labelledby="grade-form-title"><div className="modal-heading"><div><span className="eyebrow">A NEW CHECK-IN</span><h2 id="grade-form-title">Add a grade</h2></div><button className="close-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div><form className="grade-form" onSubmit={submit}><label>Student<select value={studentId} onChange={(event) => setStudentId(event.target.value)} required>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><label>Subject<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Assignment name<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Chapter 4 check-in" required /></label><div className="form-two-col"><label>Score (out of 100)<input type="number" min="0" max="100" step="1" value={score} onChange={(event) => setScore(event.target.value)} placeholder="92" required /></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label></div><label>Private note for student <span className="label-soft">(optional)</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength="500" placeholder="Add a little encouragement or a next step…" rows="3" /></label><div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={busy}>{busy ? 'Saving…' : <><Check size={17} /> Save grade</>}</button></div></form></section></div>;
}

function Messages({ isTeacher, contacts, selected, setSelected, messages, user, value, setValue, onSend, chatTab, setChatTab }) {
  const shownContacts = isTeacher && chatTab === 'teachers' ? contacts.filter((person) => person.role === 'teacher') : contacts.filter((person) => person.role === 'student' || person.role === 'teacher');
  return <section className="messages-view"><div className="view-heading"><div><span className="eyebrow">A LITTLE BACK AND FORTH</span><h1>Messages</h1><p>Questions, encouragement, and everything in between.</p></div></div><div className="chat-layout"><aside className="contact-panel">{isTeacher && <div className="chat-tabs"><button className={chatTab === 'people' ? 'active' : ''} onClick={() => { setChatTab('people'); setSelected(null); }}>Students</button><button className={chatTab === 'teachers' ? 'active' : ''} onClick={() => { setChatTab('teachers'); setSelected(null); }}>Teachers</button></div>}<div className="contact-title">{isTeacher && chatTab === 'teachers' ? 'TEACHER CHAT' : isTeacher ? 'YOUR STUDENTS' : 'YOUR TEACHERS'}</div>{shownContacts.map((person) => <button key={person.id} className={`contact-row ${selected?.id === person.id ? 'selected' : ''}`} onClick={() => setSelected(person)}><span className={`avatar ${person.role === 'teacher' ? 'avatar-peach' : ''}`}>{person.avatar}</span><span><strong>{person.name}</strong><small>{person.role === 'teacher' ? 'Teacher' : 'Student'}</small></span><span className="online-dot" /></button>)}{!shownContacts.length && <div className="contact-empty">No one here yet.</div>}</aside><div className="chat-panel">{selected ? <><div className="chat-header"><span className={`avatar ${selected.role === 'teacher' ? 'avatar-peach' : ''}`}>{selected.avatar}</span><div><strong>{selected.name}</strong><small>{selected.role === 'teacher' ? 'Teacher' : 'Student'}</small></div><span className="chat-secure">✦ Just between you two</span></div><div className="chat-messages">{messages.length ? messages.map((message) => <div className={`chat-bubble ${message.senderId === user.id ? 'mine' : ''}`} key={message.id}><p>{message.body}</p><small>{new Date(message.sentAt + (message.sentAt.includes('Z') ? '' : 'Z')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</small></div>) : <div className="chat-empty"><span>💬</span><strong>Start with a hello</strong><p>A small question can start a good conversation.</p></div>}</div><form className="chat-compose" onSubmit={onSend}><input value={value} onChange={(event) => setValue(event.target.value)} placeholder={`Message ${selected.name.split(' ')[0]}…`} aria-label="Message" /><button className="send-button" aria-label="Send message" disabled={!value.trim()}><Send size={18} /></button></form></> : <div className="chat-empty choose-contact"><span>👋</span><strong>Pick a conversation</strong><p>Choose someone on the left to say hello.</p></div>}</div></div></section>;
}

function StudyBuddy({ reply, value, setValue, onAsk }) {
  return <section className="study-view"><div className="view-heading"><div><span className="eyebrow">YOUR FRIENDLY STUDY SIDEKICK</span><h1>Study buddy</h1><p>Grade questions, study ideas, or a little pep talk. I’m here for it.</p></div></div><div className="study-layout"><div className="study-scene"><div className="study-character"><span className="study-hat">✦</span><span className="study-face"><i /><i /><b /></span><span className="study-cheek left" /><span className="study-cheek right" /></div><span className="study-orbit orbit-a">✧</span><span className="study-orbit orbit-b">✳</span><span className="study-caption">Your pocket-sized<br />pep talk.</span></div><div className="study-chat"><div className="study-chat-top"><span className="study-avatar"><Sparkles size={18} /></span><div><strong>Pal</strong><small><i /> Ready when you are</small></div></div><div className="study-reply"><span className="bot-badge">✦</span><p>{reply}</p></div><div className="prompt-chips"><button onClick={() => setValue('What is my average?')}>How am I doing?</button><button onClick={() => setValue('How can I study for a quiz?')}>Study tips</button></div><form className="study-compose" onSubmit={onAsk}><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ask me anything…" aria-label="Ask your study buddy" /><button className="send-button" aria-label="Ask"><Send size={18} /></button></form><small className="bot-note">Pal is a friendly helper, not a real person. Double-check important school info.</small></div></div></section>;
}

export default App;
