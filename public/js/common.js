// common.js — shared helpers across pages
function toast(msg, type='default'){
  const host = document.getElementById('toast-host');
  if(!host) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(8px)'; el.style.transition='all .25s'; setTimeout(()=>el.remove(), 260); }, 3200);
}

async function api(url, opts={}){
  const res = await fetch(url, {
    headers: {'Content-Type':'application/json'},
    ...opts
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok){ throw new Error(data.error || 'Something went wrong.'); }
  return data;
}

function initials(name){
  return (name||'').split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
}

function fmtDate(iso){
  if(!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDateLong(iso){
  const d = iso ? new Date(iso + 'T00:00:00') : new Date();
  return d.toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}
function fmtTime12(t){
  if(!t) return '—';
  const [h,m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = ((h % 12) || 12);
  return `${hh}:${String(m).padStart(2,'0')} ${period}`;
}
function monthLabel(ym){
  const [y,m] = ym.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('en-US', { month:'long', year:'numeric' });
}
function currentMonthValue(){
  return new Date().toISOString().slice(0,7);
}
function statusBadge(status){
  const map = { present:'Present', late:'Late', absent:'Absent', 'on-leave':'On Leave', pending:'Pending', approved:'Approved', rejected:'Rejected' };
  const cls = { present:'badge-present', late:'badge-late', absent:'badge-absent', 'on-leave':'badge-onleave', pending:'badge-pending', approved:'badge-approved', rejected:'badge-rejected' };
  return `<span class="badge ${cls[status]||'badge-pending'}">${map[status]||status}</span>`;
}
