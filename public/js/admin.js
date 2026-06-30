// admin.js — logic for the HR admin dashboard
let ADMIN = null;
let EMPLOYEES = [];
let charts = {};
let reqFilter = 'pending';

function toggleSidebar(open){
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('scrim').classList.toggle('show', open);
}

function showView(view){
  document.querySelectorAll('[id^="view-"]').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + view).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  const titles = {
    overview: ['Overview', 'Campus-wide attendance at a glance'],
    today: ["Today's Attendance", fmtDateLong()],
    requests: ['Approvals', 'Early checkout requests awaiting your decision'],
    directory: ['Staff Directory', 'Manage all 100+ staff records'],
    log: ['Attendance Log', 'Search and filter historical records']
  };
  document.getElementById('page-title').textContent = titles[view][0];
  document.getElementById('page-sub').textContent = titles[view][1];
  toggleSidebar(false);
  if(view === 'today') loadToday();
  if(view === 'requests') loadRequests();
  if(view === 'directory') loadDirectory();
  if(view === 'log') loadLog();
}

async function signOut(){
  await api('/api/auth/admin/logout', { method:'POST' });
  window.location.href = '/index.html';
}

function closeModal(id){ document.getElementById(id).classList.add('hidden'); }

// ---------------- Overview ----------------
async function loadOverview(){
  const data = await api('/api/admin/overview');
  document.getElementById('ov-active').textContent = data.activeStaff;
  document.getElementById('ov-present').textContent = data.presentToday;
  document.getElementById('ov-late').textContent = data.lateToday;
  document.getElementById('ov-absent').textContent = data.absentToday;

  if(data.pendingRequests > 0){
    document.getElementById('req-badge').textContent = data.pendingRequests;
    document.getElementById('req-badge').classList.remove('hidden');
  }

  const trendCtx = document.getElementById('chart-trend');
  if(charts.trend) charts.trend.destroy();
  charts.trend = new Chart(trendCtx, {
    type: 'line',
    data: {
      labels: data.trend.map(t => t.date.slice(5)),
      datasets: [
        { label:'Present', data: data.trend.map(t=>t.present), borderColor:'#2F8F5B', backgroundColor:'rgba(47,143,91,.08)', tension:.35, fill:true, pointRadius:0 },
        { label:'Late', data: data.trend.map(t=>t.late), borderColor:'#C2841F', backgroundColor:'rgba(194,132,31,.06)', tension:.35, fill:true, pointRadius:0 },
        { label:'Absent', data: data.trend.map(t=>t.absent), borderColor:'#C0463A', backgroundColor:'rgba(192,70,58,.05)', tension:.35, fill:true, pointRadius:0 }
      ]
    },
    options: { responsive:true, plugins:{ legend:{ position:'bottom', labels:{boxWidth:10, font:{size:11.5}} } }, scales:{ x:{grid:{display:false}}, y:{grid:{color:'#EAEDF3'}, beginAtZero:true} } }
  });

  const deptCtx = document.getElementById('chart-dept');
  if(charts.dept) charts.dept.destroy();
  charts.dept = new Chart(deptCtx, {
    type: 'bar',
    data: {
      labels: data.departments.map(d => d.department),
      datasets: [
        { label:'Present', data: data.departments.map(d=>d.present), backgroundColor:'#1E3A5F', borderRadius:5 },
        { label:'Total staff', data: data.departments.map(d=>d.total), backgroundColor:'#DDE3ED', borderRadius:5 }
      ]
    },
    options: { responsive:true, indexAxis:'y', plugins:{ legend:{ position:'bottom', labels:{boxWidth:10, font:{size:11.5}} } }, scales:{ x:{grid:{color:'#EAEDF3'}, beginAtZero:true}, y:{grid:{display:false}, ticks:{font:{size:11}}} } }
  });

  const reqData = await api('/api/admin/requests?status=pending');
  const list = reqData.requests.slice(0, 5);
  document.getElementById('ov-pending-list').innerHTML = list.length ? list.map(r => `
    <div class="flex between center" style="padding:11px 0; border-bottom:1px solid var(--line-soft);">
      <div class="flex center gap-12">
        <div class="avatar" style="width:32px;height:32px;font-size:11px;background:var(--navy-600)">${initials(r.employeeName)}</div>
        <div>
          <div style="font-size:13px; font-weight:600;">${r.employeeName}</div>
          <div class="muted" style="font-size:11.5px;">${fmtDate(r.date)} · ${r.reason}</div>
        </div>
      </div>
      <button class="btn btn-gold btn-sm" onclick="showView('requests')">Review</button>
    </div>`).join('') : `<div class="empty-state" style="padding:24px 0;">No pending requests right now.</div>`;
}

// ---------------- Today's attendance ----------------
let TODAY_RECORDS = [];
async function loadToday(){
  document.getElementById('today-date-label').textContent = fmtDateLong();
  const data = await api('/api/admin/attendance/today');
  TODAY_RECORDS = data.records;
  renderToday();
}
function renderToday(){
  const q = (document.getElementById('today-search').value || '').toLowerCase();
  const filtered = TODAY_RECORDS.filter(r => r.employeeName.toLowerCase().includes(q) || r.empCode.toLowerCase().includes(q));
  const tbody = document.querySelector('#today-table tbody');
  tbody.innerHTML = filtered.length ? filtered.map(r => `
    <tr>
      <td>
        <div class="row-person">
          <div class="avatar" style="background:${r.avatarColor}">${initials(r.employeeName)}</div>
          <div><div class="nm">${r.employeeName}</div><div class="sub mono">${r.empCode}</div></div>
        </div>
      </td>
      <td>${r.department}</td>
      <td class="mono">${fmtTime12(r.checkIn)}</td>
      <td class="mono">${fmtTime12(r.checkOut)}</td>
      <td>${r.hoursWorked ? r.hoursWorked + 'h' : '—'}</td>
      <td>${statusBadge(r.earlyCheckout ? 'pending' : r.status)}</td>
    </tr>`).join('') : `<tr><td colspan="6" class="muted" style="text-align:center; padding:30px;">No matching records.</td></tr>`;
}

// ---------------- Approvals ----------------
function setReqFilter(status){
  reqFilter = status;
  document.querySelectorAll('#view-requests .tab').forEach(t => t.classList.toggle('active', t.dataset.status === status));
  loadRequests();
}
async function loadRequests(){
  const data = await api('/api/admin/requests' + (reqFilter ? '?status=' + reqFilter : ''));
  const tbody = document.querySelector('#requests-table tbody');
  tbody.innerHTML = data.requests.length ? data.requests.map(r => `
    <tr>
      <td>
        <div class="row-person">
          <div class="avatar" style="background:var(--navy-600)">${initials(r.employeeName)}</div>
          <div><div class="nm">${r.employeeName}</div><div class="sub mono">${r.empCode}</div></div>
        </div>
      </td>
      <td>${fmtDate(r.date)}</td>
      <td class="mono">${fmtTime12(r.requestedTime)}</td>
      <td style="white-space:normal; max-width:220px;">${r.reason}</td>
      <td>${statusBadge(r.status)}</td>
      <td>
        ${r.status === 'pending' ? `
          <div class="flex gap-8">
            <button class="btn btn-gold btn-sm" onclick="decideRequest('${r.id}','approved')">Approve</button>
            <button class="btn btn-danger-ghost btn-sm" onclick="decideRequest('${r.id}','rejected')">Decline</button>
          </div>` : `<span class="muted" style="font-size:12px;">by ${r.reviewedBy || '—'}</span>`}
      </td>
    </tr>`).join('') : `<tr><td colspan="6" class="muted" style="text-align:center; padding:30px;">No requests in this category.</td></tr>`;
}
async function decideRequest(id, decision){
  try{
    await api(`/api/admin/requests/${id}/decide`, { method:'POST', body: JSON.stringify({decision}) });
    toast(decision === 'approved' ? 'Request approved.' : 'Request declined.', 'success');
    loadRequests();
    loadOverview();
  }catch(err){ toast(err.message, 'error'); }
}

// ---------------- Directory ----------------
async function loadDirectory(){
  const data = await api('/api/admin/employees');
  EMPLOYEES = data.employees;
  const depts = [...new Set(EMPLOYEES.map(e => e.department))].sort();
  const filterSel = document.getElementById('dir-dept-filter');
  filterSel.innerHTML = '<option value="">All departments</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
  const logSel = document.getElementById('log-dept');
  logSel.innerHTML = '<option value="">All</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
  document.getElementById('dir-count').textContent = `${EMPLOYEES.length} staff members on record`;
  renderDirectory();
}
function renderDirectory(){
  const q = (document.getElementById('dir-search').value || '').toLowerCase();
  const dept = document.getElementById('dir-dept-filter').value;
  const filtered = EMPLOYEES.filter(e =>
    (!dept || e.department === dept) &&
    (e.name.toLowerCase().includes(q) || e.employeeId.toLowerCase().includes(q))
  );
  const tbody = document.querySelector('#directory-table tbody');
  tbody.innerHTML = filtered.length ? filtered.map(e => `
    <tr>
      <td>
        <div class="row-person">
          <div class="avatar" style="background:${e.avatarColor}">${initials(e.name)}</div>
          <div><div class="nm">${e.name}</div><div class="sub mono">${e.employeeId}</div></div>
        </div>
      </td>
      <td>${e.department}</td>
      <td>${e.designation}</td>
      <td>${statusBadge(e.checkedIn ? (e.checkedOut ? 'present' : 'pending') : 'absent')}</td>
      <td>${e.status === 'active' ? statusBadge('present') : statusBadge('on-leave')}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openEmployee('${e.id}')">View Report</button></td>
    </tr>`).join('') : `<tr><td colspan="6" class="muted" style="text-align:center; padding:30px;">No staff match this search.</td></tr>`;
}

let CURRENT_EMPLOYEE = null;
async function openEmployee(id){
  const data = await api(`/api/admin/employees/${id}/report?month=${currentMonthValue()}`);
  CURRENT_EMPLOYEE = data.employee;
  document.getElementById('em-name').textContent = data.employee.name;
  document.getElementById('em-meta').textContent = `${data.employee.employeeId} · ${data.employee.designation} · ${data.employee.department}`;
  document.getElementById('em-status-badge').innerHTML = data.employee.status === 'active' ? statusBadge('present') : statusBadge('on-leave');
  document.getElementById('em-attendance').textContent = data.report.attendanceRate + '%';
  document.getElementById('em-punct').textContent = data.report.punctualityRate + '%';
  document.getElementById('em-hours').textContent = data.report.avgHours.toFixed(1) + 'h';
  document.getElementById('em-deactivate-btn').textContent = data.employee.status === 'active' ? 'Mark On Leave' : 'Mark Active';

  const ctx = document.getElementById('em-chart');
  if(charts.em) charts.em.destroy();
  charts.em = new Chart(ctx, {
    type:'bar',
    data:{ labels: data.report.records.map(r=>r.date.slice(8,10)), datasets:[{ label:'Hours', data: data.report.records.map(r=>r.hoursWorked||0), backgroundColor:'#1E3A5F', borderRadius:5, maxBarThickness:18 }] },
    options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false}, ticks:{font:{size:9}}}, y:{grid:{color:'#EAEDF3'}, beginAtZero:true} } }
  });

  document.getElementById('employee-modal').classList.remove('hidden');
}
async function toggleEmployeeStatus(){
  if(!CURRENT_EMPLOYEE) return;
  const newStatus = CURRENT_EMPLOYEE.status === 'active' ? 'on-leave' : 'active';
  try{
    await api(`/api/admin/employees/${CURRENT_EMPLOYEE.id}`, { method:'PATCH', body: JSON.stringify({status:newStatus}) });
    toast(`${CURRENT_EMPLOYEE.name} marked ${newStatus === 'active' ? 'active' : 'on leave'}.`, 'success');
    closeModal('employee-modal');
    loadDirectory();
    loadOverview();
  }catch(err){ toast(err.message, 'error'); }
}

// ---------------- Add staff ----------------
function openAddEmployee(){ document.getElementById('add-modal').classList.remove('hidden'); }
async function submitAddEmployee(){
  const name = document.getElementById('add-name').value.trim();
  const email = document.getElementById('add-email').value.trim();
  const department = document.getElementById('add-dept').value.trim();
  const designation = document.getElementById('add-desig').value.trim();
  const phone = document.getElementById('add-phone').value.trim();
  if(!name || !email || !department){ toast('Name, email and department are required.', 'error'); return; }
  try{
    const data = await api('/api/admin/employees', { method:'POST', body: JSON.stringify({name,email,department,designation,phone}) });
    toast(`${name} added — temporary password: ${data.tempPassword}`, 'success');
    closeModal('add-modal');
    ['add-name','add-email','add-dept','add-desig','add-phone'].forEach(id => document.getElementById(id).value = '');
    loadDirectory();
    loadOverview();
  }catch(err){ toast(err.message, 'error'); }
}

// ---------------- Attendance log ----------------
async function loadLog(){
  const params = new URLSearchParams();
  const from = document.getElementById('log-from').value;
  const to = document.getElementById('log-to').value;
  const dept = document.getElementById('log-dept').value;
  const status = document.getElementById('log-status').value;
  if(from) params.set('from', from);
  if(to) params.set('to', to);
  if(dept) params.set('department', dept);
  if(status) params.set('status', status);
  const data = await api('/api/admin/attendance?' + params.toString());
  document.getElementById('log-count').textContent = `${data.records.length} record(s)`;
  const tbody = document.querySelector('#log-table tbody');
  tbody.innerHTML = data.records.length ? data.records.map(r => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td>${r.employeeName} <span class="muted mono" style="font-size:11px;">${r.empCode}</span></td>
      <td>${r.department}</td>
      <td class="mono">${fmtTime12(r.checkIn)}</td>
      <td class="mono">${fmtTime12(r.checkOut)}</td>
      <td>${r.hoursWorked ? r.hoursWorked + 'h' : '—'}</td>
      <td>${statusBadge(r.earlyCheckout ? 'pending' : r.status)}</td>
    </tr>`).join('') : `<tr><td colspan="7" class="muted" style="text-align:center; padding:30px;">No records match these filters.</td></tr>`;
}

async function init(){
  try{
    const data = await api('/api/auth/admin/me');
    ADMIN = data.admin;
  }catch(e){
    window.location.href = '/index.html';
    return;
  }
  document.getElementById('sb-name').textContent = ADMIN.name;
  document.getElementById('sb-role').textContent = ADMIN.designation || ADMIN.role;
  document.getElementById('sb-avatar').textContent = initials(ADMIN.name);

  await loadOverview();
}

init();
