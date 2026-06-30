// staff.js — logic for the employee dashboard
let ME = null;
let TODAY_RECORD = null;
let charts = {};

function toggleSidebar(open){
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('scrim').classList.toggle('show', open);
}

function showView(view){
  document.querySelectorAll('[id^="view-"]').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + view).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  const titles = { dashboard:['Dashboard','Welcome back — here\'s your day at a glance'], report:['Monthly Report','Your evaluated attendance performance'], requests:['Early Checkouts','Track your requests and HR decisions'], profile:['My Profile','Your staff record on file'] };
  document.getElementById('page-title').textContent = titles[view][0];
  document.getElementById('page-sub').textContent = titles[view][1];
  toggleSidebar(false);
  if(view === 'report') loadReport();
  if(view === 'requests') loadRequests();
}

async function signOut(){
  await api('/api/auth/staff/logout', { method:'POST' });
  window.location.href = '/index.html';
}

function tickClock(){
  const d = new Date();
  document.getElementById('live-clock').textContent = d.toLocaleTimeString('en-GB');
  document.getElementById('live-date').textContent = fmtDateLong();
}

function renderDial(){
  const btnIn = document.getElementById('btn-checkin');
  const btnOut = document.getElementById('btn-checkout');
  const timeEl = document.getElementById('dial-status-time');
  const labelEl = document.getElementById('dial-status-label');

  if(!TODAY_RECORD){
    timeEl.textContent = '--:--';
    labelEl.textContent = 'Not checked in';
    btnIn.disabled = false; btnOut.disabled = true;
  } else if(TODAY_RECORD.checkIn && !TODAY_RECORD.checkOut){
    timeEl.textContent = fmtTime12(TODAY_RECORD.checkIn);
    labelEl.textContent = 'Checked in';
    btnIn.disabled = true; btnOut.disabled = false;
  } else if(TODAY_RECORD.checkOut){
    timeEl.textContent = fmtTime12(TODAY_RECORD.checkOut);
    labelEl.textContent = 'Checked out';
    btnIn.disabled = true; btnOut.disabled = true;
  }
}

async function checkIn(){
  try{
    const data = await api('/api/attendance/check-in', { method:'POST' });
    TODAY_RECORD = data.record;
    renderDial();
    toast('Checked in successfully — have a great day!', 'success');
    loadRecent();
  }catch(err){ toast(err.message, 'error'); }
}

async function checkOut(){
  try{
    const res = await fetch('/api/attendance/check-out', { method:'POST', headers:{'Content-Type':'application/json'} });
    const data = await res.json();
    if(res.status === 409 && data.earlyCheckoutRequired){
      document.getElementById('early-modal-sub').textContent = data.message;
      document.getElementById('early-modal').classList.remove('hidden');
      return;
    }
    if(!res.ok){ throw new Error(data.error || 'Could not check out.'); }
    TODAY_RECORD = data.record;
    renderDial();
    toast('Checked out — see you tomorrow!', 'success');
    loadRecent();
  }catch(err){ toast(err.message, 'error'); }
}

function closeEarlyModal(){
  document.getElementById('early-modal').classList.add('hidden');
  document.getElementById('early-reason').value = '';
}

async function submitEarlyCheckout(){
  const reason = document.getElementById('early-reason').value.trim();
  if(!reason){ toast('Please enter a reason.', 'error'); return; }
  try{
    const data = await api('/api/attendance/early-checkout', { method:'POST', body: JSON.stringify({reason}) });
    TODAY_RECORD = data.record;
    renderDial();
    closeEarlyModal();
    toast('Submitted to HR for approval.', 'success');
    loadRecent();
  }catch(err){ toast(err.message, 'error'); }
}

async function loadRecent(){
  const data = await api('/api/attendance/my-report?month=' + currentMonthValue());
  document.getElementById('kpi-present').textContent = data.present;
  document.getElementById('kpi-late').textContent = data.late;
  document.getElementById('kpi-hours').textContent = data.avgHours.toFixed(1) + 'h';
  document.getElementById('kpi-rate').textContent = data.attendanceRate + '%';

  const last10 = data.records.slice(-10).reverse();
  const tbody = document.querySelector('#recent-table tbody');
  tbody.innerHTML = last10.length ? last10.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td class="mono">${fmtTime12(r.checkIn)}</td>
      <td class="mono">${fmtTime12(r.checkOut)}</td>
      <td>${r.hoursWorked ? r.hoursWorked + 'h' : '—'}</td>
      <td>${statusBadge(r.earlyCheckout ? 'pending' : r.status)}</td>
    </tr>`).join('') : `<tr><td colspan="5" class="muted" style="text-align:center; padding:30px;">No attendance recorded yet this month.</td></tr>`;
}

async function loadReport(){
  const monthInput = document.getElementById('report-month-input');
  if(!monthInput.value) monthInput.value = currentMonthValue();
  const month = monthInput.value;
  const data = await api('/api/attendance/my-report?month=' + month);

  document.getElementById('report-month-label').textContent = monthLabel(month);
  document.getElementById('rep-working').textContent = data.workingDays;
  document.getElementById('rep-absent').textContent = data.absent;
  document.getElementById('rep-hours').textContent = data.totalHours + 'h';
  document.getElementById('rep-early').textContent = data.earlyOuts;

  setRing('ring-attendance', data.attendanceRate);
  setRing('ring-punctuality', data.punctualityRate);

  const tbody = document.querySelector('#report-table tbody');
  tbody.innerHTML = data.records.length ? data.records.slice().reverse().map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td class="mono">${fmtTime12(r.checkIn)}</td>
      <td class="mono">${fmtTime12(r.checkOut)}</td>
      <td>${r.hoursWorked ? r.hoursWorked + 'h' : '—'}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('') : `<tr><td colspan="5" class="muted" style="text-align:center; padding:30px;">No records for this month.</td></tr>`;

  renderHoursChart(data.records);
  renderMixChart(data);
}

function setRing(id, pct){
  const circle = document.getElementById(id);
  const r = 44, circumference = 2 * Math.PI * r;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = circumference - (pct/100) * circumference;
  document.getElementById(id + '-pct').textContent = pct + '%';
}

function renderHoursChart(records){
  const ctx = document.getElementById('chart-hours');
  if(charts.hours) charts.hours.destroy();
  charts.hours = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: records.map(r => r.date.slice(8,10)),
      datasets: [{
        label: 'Hours worked',
        data: records.map(r => r.hoursWorked || 0),
        backgroundColor: '#1E3A5F',
        borderRadius: 5,
        maxBarThickness: 22
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display:false } },
      scales: {
        x: { grid: { display:false }, ticks: { font: { size: 10 } } },
        y: { grid: { color:'#EAEDF3' }, beginAtZero:true }
      }
    }
  });
}

function renderMixChart(data){
  const ctx = document.getElementById('chart-mix');
  if(charts.mix) charts.mix.destroy();
  charts.mix = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['On time','Late','Absent'],
      datasets: [{
        data: [data.present, data.late, data.absent],
        backgroundColor: ['#2F8F5B', '#C2841F', '#C0463A'],
        borderWidth: 0
      }]
    },
    options: {
      responsive:true,
      cutout: '68%',
      plugins: { legend: { position:'bottom', labels: { boxWidth:10, font:{size:11.5} } } }
    }
  });
}

async function loadRequests(){
  const data = await api('/api/attendance/my-requests');
  const tbody = document.querySelector('#requests-table tbody');
  tbody.innerHTML = data.requests.length ? data.requests.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td class="mono">${fmtTime12(r.requestedTime)}</td>
      <td>${r.reason}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${r.reviewedBy || '—'}</td>
    </tr>`).join('') : `<tr><td colspan="5" class="muted" style="text-align:center; padding:30px;">No early checkout requests on file.</td></tr>`;
}

document.getElementById('report-month-input').addEventListener('change', loadReport);

async function init(){
  try{
    const data = await api('/api/auth/staff/me');
    ME = data.employee;
  }catch(e){
    window.location.href = '/index.html';
    return;
  }

  document.getElementById('sb-name').textContent = ME.name;
  document.getElementById('sb-role').textContent = ME.designation;
  document.getElementById('sb-avatar').textContent = initials(ME.name);
  document.getElementById('sb-avatar').style.background = ME.avatarColor;

  document.getElementById('profile-name').textContent = ME.name;
  document.getElementById('profile-role').textContent = ME.designation + ' · ' + ME.department;
  document.getElementById('profile-avatar').textContent = initials(ME.name);
  document.getElementById('profile-avatar').style.background = ME.avatarColor;
  document.getElementById('p-empid').textContent = ME.employeeId;
  document.getElementById('p-dept').textContent = ME.department;
  document.getElementById('p-email').textContent = ME.email;
  document.getElementById('p-phone').textContent = ME.phone;
  document.getElementById('p-join').textContent = fmtDate(ME.joinDate);
  document.getElementById('p-shift').textContent = `${fmtTime12(ME.shiftStart)} – ${fmtTime12(ME.shiftEnd)}`;
  document.getElementById('p-status').textContent = ME.status === 'active' ? 'Active' : 'On Leave';
  document.getElementById('p-shift-end').textContent = fmtTime12(ME.shiftEnd);
  document.getElementById('shift-note').textContent = `Shift ${ME.shiftStart} — ${ME.shiftEnd}`;

  const t = await api('/api/attendance/today');
  TODAY_RECORD = t.record;
  renderDial();
  loadRecent();

  tickClock();
  setInterval(tickClock, 1000);
}

init();
