// server.js — Radiant International School Attendance Management System
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const { load, save } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(session({
  secret: 'radiant-international-school-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const todayStr = () => new Date().toISOString().slice(0, 10);
const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
function minutesBetween(t1, t2) {
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}
function publicEmployee(e) {
  if (!e) return null;
  const { passwordHash, ...rest } = e;
  return rest;
}
function requireEmployee(req, res, next) {
  if (!req.session.employeeId) return res.status(401).json({ error: 'Not signed in.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'Not signed in as HR admin.' });
  next();
}

// ---------------------------------------------------------------------------
// Auth — Staff
// ---------------------------------------------------------------------------
app.post('/api/auth/staff/login', (req, res) => {
  const { email, password } = req.body;
  const employees = load('employees');
  const emp = employees.find(e => e.email.toLowerCase() === String(email || '').toLowerCase());
  if (!emp || !bcrypt.compareSync(password || '', emp.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  req.session.employeeId = emp.id;
  res.json({ employee: publicEmployee(emp) });
});

app.post('/api/auth/staff/logout', (req, res) => {
  req.session.employeeId = null;
  res.json({ ok: true });
});

app.get('/api/auth/staff/me', requireEmployee, (req, res) => {
  const employees = load('employees');
  const emp = employees.find(e => e.id === req.session.employeeId);
  if (!emp) return res.status(404).json({ error: 'Not found.' });
  res.json({ employee: publicEmployee(emp) });
});

// ---------------------------------------------------------------------------
// Auth — HR / Admin
// ---------------------------------------------------------------------------
app.post('/api/auth/admin/login', (req, res) => {
  const { email, password } = req.body;
  const admins = load('admins');
  const admin = admins.find(a => a.email.toLowerCase() === String(email || '').toLowerCase());
  if (!admin || !bcrypt.compareSync(password || '', admin.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  req.session.adminId = admin.id;
  const { passwordHash, ...rest } = admin;
  res.json({ admin: rest });
});

app.post('/api/auth/admin/logout', (req, res) => {
  req.session.adminId = null;
  res.json({ ok: true });
});

app.get('/api/auth/admin/me', requireAdmin, (req, res) => {
  const admins = load('admins');
  const admin = admins.find(a => a.id === req.session.adminId);
  if (!admin) return res.status(404).json({ error: 'Not found.' });
  const { passwordHash, ...rest } = admin;
  res.json({ admin: rest });
});

// ---------------------------------------------------------------------------
// Attendance — Staff actions
// ---------------------------------------------------------------------------
app.get('/api/attendance/today', requireEmployee, (req, res) => {
  const attendance = load('attendance');
  const rec = attendance.find(a => a.employeeId === req.session.employeeId && a.date === todayStr());
  res.json({ record: rec || null });
});

app.post('/api/attendance/check-in', requireEmployee, (req, res) => {
  const attendance = load('attendance');
  const employees = load('employees');
  const emp = employees.find(e => e.id === req.session.employeeId);
  const existing = attendance.find(a => a.employeeId === emp.id && a.date === todayStr());
  if (existing) return res.status(400).json({ error: 'You have already checked in today.' });

  const time = nowTime();
  const lateBy = Math.max(0, minutesBetween(emp.shiftStart, time));
  const record = {
    id: `att_${Date.now()}`,
    employeeId: emp.id,
    date: todayStr(),
    checkIn: time,
    checkOut: null,
    status: lateBy > 5 ? 'late' : 'present',
    lateBy,
    earlyCheckout: false,
    hoursWorked: 0
  };
  attendance.push(record);
  save('attendance', attendance);
  res.json({ record });
});

app.post('/api/attendance/check-out', requireEmployee, (req, res) => {
  const attendance = load('attendance');
  const employees = load('employees');
  const emp = employees.find(e => e.id === req.session.employeeId);
  const rec = attendance.find(a => a.employeeId === emp.id && a.date === todayStr());
  if (!rec) return res.status(400).json({ error: 'You have not checked in today.' });
  if (rec.checkOut) return res.status(400).json({ error: 'You have already checked out today.' });

  const time = nowTime();
  const minsEarly = minutesBetween(time, emp.shiftEnd);

  if (minsEarly > 15) {
    // Needs an early-checkout reason + HR approval
    return res.status(409).json({
      earlyCheckoutRequired: true,
      message: `It's ${minsEarly} minutes before your shift ends (${emp.shiftEnd}). Please provide a reason for early checkout.`
    });
  }

  rec.checkOut = time;
  rec.hoursWorked = +(minutesBetween(rec.checkIn, time) / 60).toFixed(2);
  save('attendance', attendance);
  res.json({ record: rec });
});

app.post('/api/attendance/early-checkout', requireEmployee, (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required for early checkout.' });

  const attendance = load('attendance');
  const employees = load('employees');
  const requests = load('requests');
  const emp = employees.find(e => e.id === req.session.employeeId);
  const rec = attendance.find(a => a.employeeId === emp.id && a.date === todayStr());
  if (!rec) return res.status(400).json({ error: 'You have not checked in today.' });
  if (rec.checkOut) return res.status(400).json({ error: 'You have already checked out today.' });

  const time = nowTime();
  rec.checkOut = time;
  rec.hoursWorked = +(minutesBetween(rec.checkIn, time) / 60).toFixed(2);
  rec.earlyCheckout = true;
  save('attendance', attendance);

  const request = {
    id: `req_${Date.now()}`,
    employeeId: emp.id,
    employeeName: emp.name,
    empCode: emp.employeeId,
    date: todayStr(),
    requestedTime: time,
    reason: reason.trim(),
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: todayStr()
  };
  requests.unshift(request);
  save('requests', requests);

  res.json({ record: rec, request });
});

// Monthly report for the signed-in employee
app.get('/api/attendance/my-report', requireEmployee, (req, res) => {
  res.json(buildMonthlyReport(req.session.employeeId, req.query.month));
});

function buildMonthlyReport(employeeId, monthParam) {
  const attendance = load('attendance');
  const month = monthParam || todayStr().slice(0, 7); // YYYY-MM
  const records = attendance
    .filter(a => a.employeeId === employeeId && a.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));

  const present = records.filter(r => r.status === 'present').length;
  const late = records.filter(r => r.status === 'late').length;
  const earlyOuts = records.filter(r => r.earlyCheckout).length;
  const totalHours = +records.reduce((s, r) => s + (r.hoursWorked || 0), 0).toFixed(1);
  const avgHours = records.length ? +(totalHours / records.length).toFixed(2) : 0;
  const avgLateMins = late ? Math.round(records.filter(r => r.status === 'late').reduce((s, r) => s + r.lateBy, 0) / late) : 0;

  // Working days in month up to today (or full month if past)
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const todayD = new Date();
  const isCurrentMonth = month === todayStr().slice(0, 7);
  const dayLimit = isCurrentMonth ? todayD.getDate() : lastDay;
  let workingDays = 0;
  for (let d = 1; d <= dayLimit; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow !== 0 && dow !== 6) workingDays++;
  }
  const absent = Math.max(0, workingDays - records.length);
  const attendanceRate = workingDays ? Math.round(((workingDays - absent) / workingDays) * 100) : 0;
  const punctualityRate = records.length ? Math.round((present / records.length) * 100) : 0;

  return {
    month, records, workingDays, present, late, absent, earlyOuts,
    totalHours, avgHours, avgLateMins, attendanceRate, punctualityRate
  };
}

// ---------------------------------------------------------------------------
// Admin — Dashboard / overview
// ---------------------------------------------------------------------------
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const employees = load('employees');
  const attendance = load('attendance');
  const requests = load('requests');
  const today = todayStr();

  const todays = attendance.filter(a => a.date === today);
  const presentToday = todays.filter(a => a.status === 'present').length;
  const lateToday = todays.filter(a => a.status === 'late').length;
  const checkedInOnly = todays.filter(a => !a.checkOut).length;
  const activeStaff = employees.filter(e => e.status === 'active').length;
  const absentToday = Math.max(0, activeStaff - todays.length);
  const pendingRequests = requests.filter(r => r.status === 'pending').length;

  // last 14 weekdays trend
  const trend = [];
  const cursor = new Date();
  let collected = 0, offset = 0;
  while (collected < 14) {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() - offset);
    offset++;
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const dateStr = d.toISOString().slice(0, 10);
    const recs = attendance.filter(a => a.date === dateStr);
    trend.unshift({
      date: dateStr,
      present: recs.filter(r => r.status === 'present').length,
      late: recs.filter(r => r.status === 'late').length,
      absent: Math.max(0, activeStaff - recs.length)
    });
    collected++;
  }

  // department breakdown (today)
  const deptMap = {};
  employees.forEach(e => {
    if (!deptMap[e.department]) deptMap[e.department] = { department: e.department, total: 0, present: 0 };
    deptMap[e.department].total++;
  });
  todays.forEach(a => {
    const emp = employees.find(e => e.id === a.employeeId);
    if (emp && deptMap[emp.department]) deptMap[emp.department].present++;
  });

  res.json({
    date: today,
    activeStaff,
    presentToday,
    lateToday,
    absentToday,
    checkedInOnly,
    pendingRequests,
    trend,
    departments: Object.values(deptMap).sort((a, b) => b.total - a.total)
  });
});

// All employees (with today's status attached)
app.get('/api/admin/employees', requireAdmin, (req, res) => {
  const employees = load('employees');
  const attendance = load('attendance');
  const today = todayStr();
  const list = employees.map(e => {
    const rec = attendance.find(a => a.employeeId === e.id && a.date === today);
    return { ...publicEmployee(e), todayStatus: rec ? rec.status : 'absent', checkedIn: !!rec, checkedOut: !!(rec && rec.checkOut) };
  });
  res.json({ employees: list });
});

app.post('/api/admin/employees', requireAdmin, (req, res) => {
  const employees = load('employees');
  const { name, email, department, designation, phone, shiftStart, shiftEnd } = req.body;
  if (!name || !email || !department) return res.status(400).json({ error: 'Name, email and department are required.' });
  if (employees.some(e => e.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'An employee with this email already exists.' });
  }
  const employeeId = `RIS-${1000 + employees.length + 1}`;
  const emp = {
    id: `emp_${Date.now()}`,
    employeeId,
    name,
    email,
    passwordHash: bcrypt.hashSync('Welcome@123', 8),
    department,
    designation: designation || 'Staff',
    phone: phone || '',
    joinDate: todayStr(),
    status: 'active',
    shiftStart: shiftStart || '08:00',
    shiftEnd: shiftEnd || '16:00',
    avatarColor: ['#1E3A5F', '#8A6D1F', '#5B7553', '#7A4B3A', '#3F5C73', '#6B4E71'][employees.length % 6]
  };
  employees.push(emp);
  save('employees', employees);
  res.json({ employee: publicEmployee(emp), tempPassword: 'Welcome@123' });
});

app.patch('/api/admin/employees/:id', requireAdmin, (req, res) => {
  const employees = load('employees');
  const emp = employees.find(e => e.id === req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });
  const allowed = ['name', 'department', 'designation', 'phone', 'status', 'shiftStart', 'shiftEnd'];
  allowed.forEach(k => { if (req.body[k] !== undefined) emp[k] = req.body[k]; });
  save('employees', employees);
  res.json({ employee: publicEmployee(emp) });
});

app.delete('/api/admin/employees/:id', requireAdmin, (req, res) => {
  let employees = load('employees');
  const exists = employees.some(e => e.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Employee not found.' });
  employees = employees.filter(e => e.id !== req.params.id);
  save('employees', employees);
  res.json({ ok: true });
});

// Employee monthly report (admin view of any staff member)
app.get('/api/admin/employees/:id/report', requireAdmin, (req, res) => {
  const employees = load('employees');
  const emp = employees.find(e => e.id === req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });
  res.json({ employee: publicEmployee(emp), report: buildMonthlyReport(req.params.id, req.query.month) });
});

// Today's full attendance log (admin)
app.get('/api/admin/attendance/today', requireAdmin, (req, res) => {
  const employees = load('employees');
  const attendance = load('attendance');
  const today = todayStr();
  const recs = attendance.filter(a => a.date === today).map(r => {
    const emp = employees.find(e => e.id === r.employeeId);
    return { ...r, employeeName: emp ? emp.name : 'Unknown', empCode: emp ? emp.employeeId : '—', department: emp ? emp.department : '—', avatarColor: emp ? emp.avatarColor : '#999' };
  }).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  res.json({ records: recs });
});

// Attendance log with filters (date range / department / employee)
app.get('/api/admin/attendance', requireAdmin, (req, res) => {
  const employees = load('employees');
  let attendance = load('attendance');
  const { from, to, department, employeeId, status } = req.query;
  if (from) attendance = attendance.filter(a => a.date >= from);
  if (to) attendance = attendance.filter(a => a.date <= to);
  if (employeeId) attendance = attendance.filter(a => a.employeeId === employeeId);
  if (status) attendance = attendance.filter(a => a.status === status);
  let recs = attendance.map(r => {
    const emp = employees.find(e => e.id === r.employeeId);
    return { ...r, employeeName: emp ? emp.name : 'Unknown', empCode: emp ? emp.employeeId : '—', department: emp ? emp.department : '—' };
  });
  if (department) recs = recs.filter(r => r.department === department);
  recs.sort((a, b) => b.date.localeCompare(a.date) || a.checkIn.localeCompare(b.checkIn));
  res.json({ records: recs.slice(0, 500) });
});

// ---------------------------------------------------------------------------
// Admin — Early checkout requests
// ---------------------------------------------------------------------------
app.get('/api/admin/requests', requireAdmin, (req, res) => {
  const requests = load('requests');
  const status = req.query.status;
  const list = status ? requests.filter(r => r.status === status) : requests;
  res.json({ requests: list.slice(0, 300) });
});

app.post('/api/admin/requests/:id/decide', requireAdmin, (req, res) => {
  const { decision } = req.body; // 'approved' | 'rejected'
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Invalid decision.' });
  const requests = load('requests');
  const admins = load('admins');
  const admin = admins.find(a => a.id === req.session.adminId);
  const reqItem = requests.find(r => r.id === req.params.id);
  if (!reqItem) return res.status(404).json({ error: 'Request not found.' });
  reqItem.status = decision;
  reqItem.reviewedBy = admin ? admin.name : 'HR';
  reqItem.reviewedAt = todayStr();
  save('requests', requests);
  res.json({ request: reqItem });
});

// Staff: view own early checkout requests
app.get('/api/attendance/my-requests', requireEmployee, (req, res) => {
  const requests = load('requests');
  res.json({ requests: requests.filter(r => r.employeeId === req.session.employeeId).slice(0, 100) });
});

// ---------------------------------------------------------------------------
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Radiant International School — Attendance System running on http://localhost:${PORT}`);
});
