// seed.js — generates initial JSON "database" files for the attendance system.
// Run once with: node seed.js
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DEPARTMENTS = [
  'Academics — Senior School', 'Academics — Junior School', 'Mathematics & Sciences',
  'Languages', 'Administration', 'Library', 'IT & Media', 'Sports & Athletics',
  'Maintenance & Facilities', 'Accounts & Finance', 'Counselling', 'Transport'
];

const DESIGNATIONS = [
  'Subject Teacher', 'Head of Department', 'Lab Assistant', 'Librarian',
  'Administrative Officer', 'Front Desk Coordinator', 'IT Support Engineer',
  'Sports Coach', 'Facilities Supervisor', 'Accountant', 'School Counsellor', 'Driver'
];

const FIRST = ['Aarav','Priya','Rohan','Sneha','Vikram','Anjali','Sandeep','Maya','Kiran','Nisha',
  'Arjun','Pooja','Rajesh','Divya','Suresh','Kavita','Manish','Ritu','Ashok','Neha',
  'Bikash','Sarita','Prakash','Sunita','Deepak','Anita','Ramesh','Geeta','Naveen','Shweta',
  'Bishal','Sabina','Dipendra','Anu','Hari','Mina','Sunil','Laxmi','Bibek','Sushma',
  'Krishna','Renu','Gopal','Bina','Tej','Sapana','Manoj','Kalpana','Ravi','Pratima',
  'Sushil','Ganga','Bishnu','Saraswati','Dilip','Radha','Mohan','Indira','Niraj','Usha',
  'Rajiv','Sangita','Pawan','Manju','Sagar','Rekha','Yogesh','Pratima','Bhuwan','Asmita',
  'Keshav','Bandana','Surya','Champa','Narayan','Devika','Ramchandra','Ishwori','Bharat','Kabita',
  'Subash','Sirjana','Madan','Roshani','Tika','Junu','Shankar','Lalita','Bal','Sunita',
  'Hem','Bimala','Padam','Sarmila','Dhruba','Babita','Pemba','Doma','Tashi','Pasang'];
const LAST = ['Sharma','Shrestha','Tamang','Gurung','Rai','Magar','Thapa','Karki','Adhikari','Pradhan',
  'Maharjan','Joshi','KC','Bhattarai','Acharya','Basnet','Khadka','Pandey','Lama','Subedi'];

function pick(arr, i){ return arr[i % arr.length]; }
function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function pad(n){ return n.toString().padStart(2,'0'); }

// ---------- Employees ----------
const employees = [];
const TOTAL_STAFF = 108;
const defaultPasswordHash = bcrypt.hashSync('Welcome@123', 8);

for (let i = 1; i <= TOTAL_STAFF; i++) {
  const first = pick(FIRST, i - 1);
  const last = pick(LAST, Math.floor((i - 1) * 1.7));
  const name = `${first} ${last}`;
  const dept = pick(DEPARTMENTS, i);
  const desig = pick(DESIGNATIONS, i);
  const empId = `RIS-${(1000 + i)}`;
  const joinYear = 2018 + (i % 7);
  const joinMonth = pad(1 + (i % 12));
  const joinDay = pad(1 + (i % 27));
  employees.push({
    id: `emp_${i}`,
    employeeId: empId,
    name,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@radiantis.edu.np`,
    passwordHash: defaultPasswordHash,
    department: dept,
    designation: desig,
    phone: `98${String(10000000 + i * 137).slice(0,8)}`,
    joinDate: `${joinYear}-${joinMonth}-${joinDay}`,
    status: i % 37 === 0 ? 'on-leave' : 'active',
    shiftStart: '08:00',
    shiftEnd: '16:00',
    avatarColor: rand(['#1E3A5F','#8A6D1F','#5B7553','#7A4B3A','#3F5C73','#6B4E71']),
  });
}

fs.writeFileSync(path.join(DATA_DIR, 'employees.json'), JSON.stringify(employees, null, 2));

// ---------- Admins (HR) ----------
const admins = [
  {
    id: 'admin_1',
    name: 'Sunita Rana',
    email: 'hr@radiantis.edu.np',
    passwordHash: bcrypt.hashSync('Admin@123', 8),
    role: 'HR Administrator',
    designation: 'Head of Human Resources'
  }
];
fs.writeFileSync(path.join(DATA_DIR, 'admins.json'), JSON.stringify(admins, null, 2));

// ---------- Attendance (last 45 calendar days, weekdays only) ----------
function isoDate(d){ return d.toISOString().slice(0,10); }
function addMinutes(time, mins){
  const [h,m] = time.split(':').map(Number);
  const d = new Date(2000,0,1,h,m + mins);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function minutesBetween(t1, t2){
  const [h1,m1] = t1.split(':').map(Number);
  const [h2,m2] = t2.split(':').map(Number);
  return (h2*60+m2) - (h1*60+m1);
}

const attendance = [];
const requests = [];
let reqCounter = 1;
let attCounter = 1;

const today = new Date();
const DAYS_BACK = 45;

for (let d = DAYS_BACK; d >= 0; d--) {
  const day = new Date(today);
  day.setDate(today.getDate() - d);
  const dow = day.getDay();
  if (dow === 0 || dow === 6) continue; // skip weekends (Sat/Sun)
  const dateStr = isoDate(day);

  employees.forEach((emp, idx) => {
    if (emp.status === 'on-leave' && Math.random() < 0.6) return; // mostly absent if on long leave

    const roll = Math.random();
    if (roll < 0.045) {
      // Absent — no record
      return;
    }

    let checkIn = addMinutes('08:00', Math.round((Math.random() * 30) - 10)); // -10 to +20 min
    const lateBy = Math.max(0, minutesBetween('08:00', checkIn));
    let status = lateBy > 5 ? 'late' : 'present';

    let checkOut = addMinutes('16:00', Math.round((Math.random() * 40) - 10));
    let earlyCheckout = false;
    let earlyReason = null;
    let earlyStatus = null;

    // Occasionally simulate an early checkout request
    if (Math.random() < 0.07 && d > 0) {
      checkOut = addMinutes('13:30', Math.round(Math.random() * 90));
      earlyCheckout = true;
      const reasons = [
        'Medical appointment', 'Family emergency', 'Child pickup from school',
        'Personal errand approved verbally', 'Feeling unwell', 'Bank work — urgent document'
      ];
      earlyReason = rand(reasons);
      const decideRoll = Math.random();
      earlyStatus = decideRoll < 0.75 ? 'approved' : (decideRoll < 0.92 ? 'pending' : 'rejected');
      requests.push({
        id: `req_${reqCounter++}`,
        employeeId: emp.id,
        employeeName: emp.name,
        empCode: emp.employeeId,
        date: dateStr,
        requestedTime: checkOut,
        reason: earlyReason,
        status: d === 0 ? 'pending' : earlyStatus,
        reviewedBy: earlyStatus !== 'pending' ? 'Sunita Rana' : null,
        reviewedAt: earlyStatus !== 'pending' ? dateStr : null,
        createdAt: dateStr
      });
    }

    const hoursWorked = Math.max(0, +(minutesBetween(checkIn, checkOut) / 60).toFixed(2));

    attendance.push({
      id: `att_${attCounter++}`,
      employeeId: emp.id,
      date: dateStr,
      checkIn,
      checkOut: d === 0 && Math.random() < 0.3 ? null : checkOut, // some still "checked in" today
      status,
      lateBy,
      earlyCheckout,
      hoursWorked
    });
  });
}

fs.writeFileSync(path.join(DATA_DIR, 'attendance.json'), JSON.stringify(attendance, null, 2));
fs.writeFileSync(path.join(DATA_DIR, 'requests.json'), JSON.stringify(requests, null, 2));

console.log(`Seeded ${employees.length} employees, ${attendance.length} attendance records, ${requests.length} early-checkout requests, 1 HR admin.`);
console.log('HR login → hr@radiantis.edu.np / Admin@123');
console.log('Sample staff login → ' + employees[0].email + ' / Welcome@123');
