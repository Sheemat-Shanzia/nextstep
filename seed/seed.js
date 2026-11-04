/**
 * seed/seed.js
 * ---------------------------------------------------------------------------
 * Creates a complete, realistic demo dataset in MongoDB.
 *
 *   npm run seed          -> wipes the collections and re-creates everything
 *   npm run seed:reset    -> same, with --force (never prompts)
 *   node seed/seed.js --keep-uploads
 *
 * What it creates
 *   1 administrator, 8 companies, 25 students (all with full profiles)
 *   45 opportunities (mixed type / status / deadline, incl. expired + closing soon)
 *   90+ applications across all seven statuses, each with a status timeline
 *   bookmarks, reviews, notifications, activity logs, announcements, feedback
 *   a small valid placeholder PDF for every student CV so downloads work
 *
 * The script is idempotent: running it twice leaves exactly the same data.
 */
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker');

// ---------------------------------------------------------------------------
// Models + config
// ---------------------------------------------------------------------------
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const CompanyProfile = require('../models/CompanyProfile');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const Bookmark = require('../models/Bookmark');
const Review = require('../models/Review');
const ActivityLog = require('../models/ActivityLog');
const Feedback = require('../models/Feedback');
const Announcement = require('../models/Announcement');
const { DIRS } = require('../config/multer');

// ---------------------------------------------------------------------------
// Fixed demo credentials (printed at the end and written to docs/TEST_ACCOUNTS.md)
// ---------------------------------------------------------------------------
const DEMO = {
  admin: { name: 'System Administrator', email: 'admin@isms.com', password: 'Admin@123' },
  company: { name: 'Nexus Technologies Ltd', email: 'company@isms.com', password: 'Company@123' },
  student: { name: 'Aisha Rahman', email: 'student@isms.com', password: 'Student@123' }
};

// Other seeded accounts reuse the same passwords per role so any row in
// Compass can be used to log in (documented in docs/TEST_ACCOUNTS.md).
const ROLE_PASSWORD = { admin: DEMO.admin.password, company: DEMO.company.password, student: DEMO.student.password };

const TARGETS = { companies: 8, students: 25, opportunities: 45, minApplications: 90 };

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
const INDUSTRIES = [
  'Information Technology', 'Financial Services', 'Healthcare', 'Education',
  'Retail & E-commerce', 'Manufacturing', 'Consulting', 'Telecommunications',
  'Renewable Energy', 'Media & Entertainment', 'Non-Profit', 'Research Institute'
];

const CITIES = [
  'Dhaka, Bangladesh', 'Chattogram, Bangladesh', 'Sylhet, Bangladesh', 'Karachi, Pakistan',
  'Lahore, Pakistan', 'Mumbai, India', 'Bengaluru, India', 'Delhi, India',
  'Colombo, Sri Lanka', 'Kuala Lumpur, Malaysia', 'Remote - Asia Pacific', 'Remote - Worldwide'
];

const CATEGORIES = [
  'Software Development', 'Data Science & AI', 'Marketing', 'Design', 'Finance',
  'Human Resources', 'Engineering', 'Research', 'Education', 'Public Health',
  'Business Development', 'Content Writing'
];

const SKILL_POOL = [
  'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Django', 'Java', 'C++', 'C#',
  'Go', 'PHP', 'Laravel', 'SQL', 'MongoDB', 'PostgreSQL', 'AWS', 'Docker', 'Kubernetes',
  'Machine Learning', 'Deep Learning', 'Data Analysis', 'Power BI', 'Excel', 'Tableau',
  'Figma', 'UI/UX Design', 'Photoshop', 'Digital Marketing', 'SEO', 'Content Writing',
  'Communication', 'Leadership', 'Teamwork', 'Problem Solving', 'Project Management',
  'Financial Modelling', 'Accounting', 'Research', 'Public Speaking'
];

const INTERESTS = [
  'Artificial Intelligence', 'Open Source', 'Startups', 'FinTech', 'EdTech',
  'Climate Tech', 'Healthcare Tech', 'Remote Work', 'Research'
];

const DEADLINE_PROFILES = [
  { label: 'expired', weight: 2, offsetDays: [-5, -20, -60] },
  { label: 'closing soon', weight: 3, offsetDays: [0, 2, 3] },
  { label: 'this week', weight: 3, offsetDays: [5, 7] },
  { label: 'this month', weight: 4, offsetDays: [14, 21, 30] },
  { label: 'later', weight: 5, offsetDays: [45, 60, 90, 120] }
];

const COMPANY_NAME_PARTS = {
  prefixes: ['Nexus', 'Bright', 'Quantum', 'Silver', 'Nova', 'Prime', 'Urban', 'Vertex', 'Azure', 'Orbit', 'Cobalt', 'Zenith', 'Pioneer', 'Atlas', 'Lumina'],
  suffixes: ['Technologies Ltd', 'Solutions', 'Labs', 'Group', 'Ventures', 'Systems', 'Analytics', 'Consulting', 'Foundation', 'Industries', 'Digital', 'Partners']
};

// ===========================================================================
// Minimal, valid PDF generator (so CV downloads work straight after seeding)
// ===========================================================================
/**
 * Build a one-page PDF containing a heading and a few lines of text.
 * @param {string} title
 * @param {string[]} lines
 * @returns {Buffer}
 */
function makePdf(title, lines) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  const content = [
    'BT',
    '/F1 18 Tf',
    '72 720 Td',
    `(${esc(title)}) Tj`,
    'ET',
    '0.4 0.4 0.4 rg',
    ...lines.flatMap((line) => ['BT', '/F1 11 Tf', '72 690 Td', `(${esc(line)}) Tj`, '0 -18 Td', 'ET']),
    '0 0 0 rg',
    'BT /F1 9 Tf 72 120 Td (Generated by the ISMS seed script - placeholder CV) Tj ET'
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];

  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/** Write a generated PDF into uploads/cv and return the file name. */
function writeCv(userName, university, degree) {
  const fileName = `seed-${Date.now().toString(36)}-${faker.string.alphanumeric(8).toLowerCase()}.pdf`;
  const body = [
    `${userName}`,
    `${degree || 'Student'} - ${university || 'University'}`,
    '',
    'EDUCATION',
    `${university || 'University'} - ${degree || 'Bachelor'}`,
    '',
    'SKILLS',
    'See the ISMS profile for the full skill list with proficiency levels.',
    '',
    'PROJECTS',
    'Portfolio available on request.',
    '',
    'EXPERIENCE',
    'Internship experience - see the ISMS application tracking page.'
  ];
  fs.writeFileSync(path.join(DIRS.cv, fileName), makePdf(`${userName} - CV`, body));
  return fileName;
}

// ===========================================================================
// Helpers
// ===========================================================================
const day = 24 * 60 * 60 * 1000;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickWeighted = (items) => {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= items[i].weight;
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
};
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sample = (arr, n) => {
  const copy = arr.slice();
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  return out;
};

/** Delete every document in a collection and drop its indexes. */
async function wipe(collection) {
  const count = await collection.countDocuments({});
  await collection.deleteMany({});
  return count;
}

/** Empty the uploads folders but keep the .gitkeep placeholders. */
function wipeUploads() {
  ['cv', 'documents', 'logos'].forEach((kind) => {
    const dir = DIRS[kind];
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      return;
    }
    fs.readdirSync(dir).forEach((name) => {
      if (name === '.gitkeep') return;
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch (err) {
        /* ignore */
      }
    });
  });
}

// ===========================================================================
// Seed steps
// ===========================================================================

/** 1. Users: 1 admin + 8 companies + 25 students. */
async function seedUsers() {
  const users = { admin: [], companies: [], students: [] };

  users.admin.push(
    await User.create({
      name: DEMO.admin.name,
      email: DEMO.admin.email,
      password: DEMO.admin.password,
      role: 'admin',
      status: 'active',
      isEmailVerified: true,
      lastLogin: new Date(Date.now() - 2 * 3600 * 1000)
    })
  );

  // ---- companies -------------------------------------------------------
  const companySpecs = [
    { name: DEMO.company.name, industry: 'Information Technology', city: 'Dhaka, Bangladesh', size: '201-500', verified: true },
    { name: 'GreenLeaf Foundation', industry: 'Non-Profit', city: 'Dhaka, Bangladesh', size: '11-50', verified: true },
    { name: 'FinBridge Analytics', industry: 'Financial Services', city: 'Chattogram, Bangladesh', size: '51-200', verified: true },
    { name: 'MediCore Health', industry: 'Healthcare', city: 'Sylhet, Bangladesh', size: '201-500', verified: false },
    { name: 'EduBridge Institute', industry: 'Education', city: 'Remote - Worldwide', size: '51-200', verified: true },
    { name: 'Solaris Renewables', industry: 'Renewable Energy', city: 'Lahore, Pakistan', size: '201-500', verified: false },
    { name: 'PixelForge Studios', industry: 'Media & Entertainment', city: 'Kuala Lumpur, Malaysia', size: '11-50', verified: false },
    { name: 'LogiTrack Systems', industry: 'Manufacturing', city: 'Bengaluru, India', size: '501-1000', verified: false }
  ];

  for (let i = 0; i < companySpecs.length; i += 1) {
    const spec = companySpecs[i];
    const isDemo = i === 0;

    const user = await User.create({
      name: isDemo ? DEMO.company.name : `${spec.name}`,
      email: isDemo ? DEMO.company.email : faker.internet.email({ firstName: spec.name.split(' ')[0], lastName: 'careers' }).toLowerCase(),
      password: ROLE_PASSWORD.company,
      role: 'company',
      status: 'active',
      isEmailVerified: true,
      lastLogin: new Date(Date.now() - randInt(1, 96) * 3600 * 1000)
    });

    const profile = await CompanyProfile.create({
      user: user._id,
      companyName: spec.name,
      industry: spec.industry,
      website: `https://www.${faker.internet.domainName()}`,
      location: spec.city,
      size: spec.size,
      verified: spec.verified,
      contactPerson: faker.person.fullName(),
      contactPhone: `+8801${randInt(300000000, 999999999)}`,
      description: `${spec.name} is a ${spec.industry.toLowerCase()} organisation based in ${spec.city}. ` +
        `We host internships and scholarships for students who want hands-on experience, structured mentorship and a real contribution to live projects. ` +
        `Our teams work across ${sample(SKILL_POOL, 3).join(', ')} and related disciplines.`
    });

    users.companies.push({ user, profile, spec });
  }

  // ---- students --------------------------------------------------------
  for (let i = 0; i < TARGETS.students; i += 1) {
    const isDemo = i === 0;
    const fullName = isDemo ? DEMO.student.name : faker.person.fullName();
    const degree = pick(['BSc', 'BBA', 'BA', 'BEng', 'BSS', 'MSc']);
    const university = pick([
      'University of Dhaka', 'Bangladesh University of Engineering and Technology', 'North South University',
      'University of Chittagong', 'BRAC University', 'Jahangirnagar University', 'Dhaka University of Business & Technology',
      'University of Colombo', 'Indian Institute of Technology Bombay'
    ]);

    const user = await User.create({
      name: fullName,
      email: isDemo ? DEMO.student.email : faker.internet.email({ firstName: fullName.split(' ')[0], lastName: fullName.split(' ').pop() }).toLowerCase(),
      password: ROLE_PASSWORD.student,
      role: 'student',
      status: 'active',
      isEmailVerified: true,
      lastLogin: new Date(Date.now() - randInt(1, 240) * 3600 * 1000)
    });

    const skillNames = sample(SKILL_POOL, randInt(4, 9));
    const skills = skillNames.map((name) => ({
      name,
      level: pick(['beginner', 'intermediate', 'intermediate', 'advanced', 'expert'])
    }));

    const cgpa = Number((Math.random() * 2.2 + 2.8).toFixed(2));
    const graduationYear = randInt(2025, 2029);

    const cvOriginalName = `${fullName.replace(/\s+/g, '-').toLowerCase()}-cv.pdf`;

    const profile = await StudentProfile.create({
      user: user._id,
      phone: `+8801${randInt(300000000, 999999999)}`,
      dateOfBirth: new Date(randInt(1997, 2004), randInt(0, 11), randInt(1, 28)),
      gender: pick(['male', 'female', 'other', 'prefer-not-to-say']),
      address: `${randInt(1, 200)}, ${pick(['Mirpur', 'Banani', 'Agrabad', 'Uttara', 'Gulshan'])}, ${pick(CITIES)}`,
      university,
      department: pick(['Computer Science & Engineering', 'Business Administration', 'Electrical Engineering', 'Economics', 'Marketing', 'Physics', 'Statistics', 'Design']),
      degree,
      currentSemester: randInt(1, 12),
      cgpa,
      graduationYear,
      skills,
      interests: sample(INTERESTS, randInt(2, 5)),
      bio: `Final-year ${degree} student at ${university} with a CGPA of ${cgpa}. ` +
        `Interested in ${sample(SKILL_POOL, 3).join(', ')} and keen to apply classroom knowledge to real projects. ` +
        `Looking for an internship or scholarship that values curiosity, teamwork and continuous learning.`,
      linkedin: `https://www.linkedin.com/in/${faker.internet.username()}`,
      github: `https://github.com/${faker.internet.username()}`,
      portfolio: `https://${faker.internet.domainName()}`,
      // A real (tiny) PDF so every CV download works straight after seeding.
      cvPath: writeCv(fullName, university, degree),
      cvOriginalName,
      cvUploadedAt: new Date(Date.now() - randInt(5, 120) * day),
      education: [
        {
          institution: university,
          degree,
          fieldOfStudy: pick(['Computer Science & Engineering', 'Business Administration', 'Economics', 'Design']),
          startYear: graduationYear - 4,
          endYear: graduationYear,
          grade: `CGPA ${cgpa}/10`,
          description: 'Higher secondary with focus on science and mathematics.'
        }
      ],
      projects: [
        {
          title: `${pick(['Campus', 'Smart', 'Eco', 'Urban', 'Health'])} ${pick(['Tracker', 'Portal', 'Dashboard', 'Assistant'])}`,
          description: 'A full-stack web project built as part of a university course project.',
          technologies: sample(SKILL_POOL, randInt(3, 5)),
          link: `https://github.com/${faker.internet.username()}/${faker.string.alphanumeric(6).toLowerCase()}`,
          startDate: new Date(Date.now() - randInt(120, 400) * day),
          endDate: new Date(Date.now() - randInt(20, 110) * day)
        }
      ],
      profileStrength: 0 // recalculated in step 7
    });

    users.students.push({ user, profile });
  }

  return users;
}

/** 2. Opportunities: mixed type, status and deadline. */
async function seedOpportunities(companies) {
  const templates = {
    internship: [
      'Software Engineering Intern', 'Front-End Development Intern', 'Backend Engineering Intern',
      'Data Science Intern', 'Machine Learning Intern', 'UI/UX Design Intern', 'Digital Marketing Intern',
      'Business Development Intern', 'Finance Intern', 'HR Intern', 'QA & Testing Intern',
      'Content Writing Intern', 'DevOps Intern', 'Mobile App Development Intern', 'Research Assistant Intern'
    ],
    scholarship: [
      'Merit Scholarship Programme', 'STEM Excellence Scholarship', 'Women in Tech Scholarship',
      'Rural Talent Scholarship', 'Graduate Research Scholarship', 'Innovation & Startup Scholarship',
      'Community Impact Scholarship', 'Postgraduate Bursary', 'Creative Arts Scholarship',
      'Green Futures Scholarship', 'First Generation Scholars Programme'
    ]
  };

  const modePool = ['onsite', 'remote', 'hybrid', 'remote'];
  const opportunities = [];

  for (let i = 0; i < TARGETS.opportunities; i += 1) {
    const isScholarship = i % 5 === 2 || i % 7 === 3;
    const type = isScholarship ? 'scholarship' : 'internship';
    const company = companies[i % companies.length];

    // ---- status distribution: ~68% approved, ~18% pending, ~14% rejected ---
    const roll = Math.random();
    const status = roll < 0.68 ? 'approved' : roll < 0.86 ? 'pending' : 'rejected';

    // ---- deadline: mixture of expired / closing soon / future --------------
    const profile = pickWeighted(DEADLINE_PROFILES);
    const offset = pick(profile.offsetDays);
    const deadline = new Date(Date.now() + offset * day);

    const skills = sample(SKILL_POOL, randInt(3, 7));
    const title = `${pick(templates[type])} - ${pick(CITIES).split(',')[0]}`;

    // One city per opportunity, reused for location / title / tags.
    const city = pick(CITIES);
    const cityParts = city.split(',');
    const regionTag = cityParts[1] ? cityParts[1].trim().toLowerCase().replace(/\s+/g, '-') : 'remote';

    const opportunity = await Opportunity.create({
      company: company.user._id,
      companyProfile: company.profile._id,
      companyNameCopy: company.profile.companyName,
      title,
      type,
      description:
        type === 'scholarship'
          ? `${company.profile.companyName} is offering a ${title} to support a student pursuing higher education. ` +
            `The award covers tuition assistance and living support for one full academic year. Recipients join a mentoring circle with senior students and alumni, ` +
            `and take part in a supervised community project each semester. Selection is based on academic merit, financial need and leadership potential.`
          : `Join ${company.profile.companyName} as a ${title.toLowerCase()}. You will work directly with the product and engineering teams on real deliverables, ` +
            `take part in code reviews and sprint ceremonies, and finish the internship with a portfolio-worthy project. ` +
            `Mentorship, a flexible schedule and a completion certificate are provided.`,
      requirements:
        `Requirements:\n- Currently enrolled in a undergraduate or postgraduate programme\n- Familiar with ${skills.slice(0, 3).join(', ')}\n` +
        `- Willing to learn and share knowledge with the team\n- Good communication in English`,
      location: city,
      mode: isScholarship ? 'onsite' : pick(modePool),
      duration: isScholarship ? pick(['1 academic year', '2 semesters', '12 months']) : pick(['2 months', '3 months', '4 months', '6 months', '12 weeks']),
      stipend: isScholarship ? randInt(800, 6000) : pick([0, 150, 250, 350, 450, 600, 800]),
      openings: randInt(1, 8),
      category: pick(CATEGORIES),
      deadline,
      requiredSkills: skills,
      minCgpa: pick([0, 0, 2.5, 3, 3.25, 3.5]),
      tags: [type, isScholarship ? 'funding' : 'career', regionTag, pick(['2026', 'entry-level', 'mentorship', 'remote-friendly'])],
      status,
      isActive: status !== 'rejected',
      views: randInt(0, 850),
      rejectionReason: status === 'rejected' ? pick([
        'The description is too generic - please add concrete responsibilities and outcomes.',
        'The stipend stated does not match the market rate for this role. Please revise and resubmit.',
        'The post is missing the required skills and eligibility criteria.',
        'Deadline has already passed at the time of review.'
      ]) : '',
      reviewedBy: status === 'pending' ? null : (await User.findOne({ role: 'admin' }))._id,
      reviewedAt: status === 'pending' ? null : new Date(Date.now() - randInt(1, 60) * day)
    });

    opportunities.push(opportunity);
  }

  return opportunities;
}

/** 3. Applications with realistic status histories. */
async function seedApplications(students, opportunities, demoCompanyId, demoStudentId) {
  const applications = [];

  // Students may only apply to approved, active, unexpired opportunities.
  const openForStudents = opportunities.filter(
    (o) => o.status === 'approved' && o.isActive && o.deadline.getTime() > Date.now()
  );

  const STATUS_CHAINS = {
    submitted: ['submitted'],
    under_review: ['submitted', 'under_review'],
    shortlisted: ['submitted', 'under_review', 'shortlisted'],
    interview: ['submitted', 'under_review', 'shortlisted', 'interview'],
    accepted: ['submitted', 'under_review', 'shortlisted', 'interview', 'accepted'],
    rejected: ['submitted', 'under_review', 'rejected'],
    withdrawn: ['submitted', 'withdrawn']
  };

  const statusPool = ['submitted', 'under_review', 'under_review', 'shortlisted', 'shortlisted', 'interview', 'accepted', 'rejected', 'rejected', 'withdrawn'];
  const seen = new Set(); // "studentId:opportunityId"

  // Pass 1: give every student a handful of applications.
  students.forEach((student) => {
    const count = randInt(3, 6);
    const chosen = sample(openForStudents, count);

    chosen.forEach((opportunity) => {
      const key = `${student.user._id}:${opportunity._id}`;
      if (seen.has(key)) return;
      seen.add(key);

      const finalStatus = pick(statusPool);
      const chain = STATUS_CHAINS[finalStatus];
      const appliedAt = new Date(Date.now() - randInt(1, 75) * day);
      const appliedToProfileCv = Math.random() < 0.65;

      const statusHistory = chain.map((status, index) => {
        const changedAt = new Date(appliedAt.getTime() + index * randInt(1, 9) * day);
        return {
          status,
          changedAt: changedAt.getTime() > Date.now() ? new Date() : changedAt,
          changedBy: status === 'submitted' ? student.user._id : opportunity.company,
          note:
            status === 'submitted'
              ? 'Application submitted'
              : pick([
                  'Your application is being reviewed by the hiring team.',
                  'Moved to the shortlist after the initial screening.',
                  'You have been selected for the interview round.',
                  'Congratulations! We would like to offer you the position.',
                  'Thank you for applying; we have decided to move forward with other candidates.',
                  'Withdrawn by the student.'
                ])
        };
      });

      applications.push(
        Application.create({
          student: student.user._id,
          opportunity: opportunity._id,
          company: opportunity.company,
          coverLetter:
            `Dear ${opportunity.companyNameCopy} team,\n\n` +
            `I am writing to apply for the ${opportunity.title} opportunity. ` +
            `I am a student with hands-on experience in ${sample(student.profile.skills.map((s) => s.name), 3).join(', ')}, ` +
            `and I am excited about the chance to contribute to ${opportunity.companyNameCopy}.\n\n` +
            `What draws me to this role is ${pick(['the exposure to a production environment', 'the mentoring culture described in the post', 'the chance to work on a real product used by many people', 'the alignment with my career goals'])}. ` +
            `I would welcome the opportunity to discuss how I can contribute.\n\nKind regards,\n${student.user.name}`,
          answers: [
            {
              question: 'Why are you a good fit for this opportunity? (max 300 characters)',
              answer: `My profile matches most of the required skills and I have already worked on similar projects. I am a fast learner and a reliable team member.`
            },
            {
              question: opportunity.type === 'scholarship' ? 'How will this scholarship support your studies?' : 'What is the earliest date you could start?',
              answer:
                opportunity.type === 'scholarship'
                  ? 'It would let me concentrate fully on my coursework and take the advanced elective modules I need for my final year.'
                  : 'I could start within two weeks of receiving the offer.'
            }
          ],
          cvPath: student.profile.cvPath,
          cvOriginalName: student.profile.cvOriginalName,
          cvSource: appliedToProfileCv ? 'profile' : 'upload',
          documents: [],
          status: finalStatus,
          appliedAt,
          statusHistory
        })
      );
    });
  });

  // Pass 2: top up to at least TARGETS.minApplications.
  let guard = 0;
  while (applications.length < TARGETS.minApplications && guard < 4000) {
    guard += 1;
    const student = pick(students);
    const opportunity = pick(openForStudents);
    const key = `${student.user._id}:${opportunity._id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const finalStatus = pick(statusPool);
    const chain = STATUS_CHAINS[finalStatus];
    const appliedAt = new Date(Date.now() - randInt(1, 40) * day);

    applications.push(
      Application.create({
        student: student.user._id,
        opportunity: opportunity._id,
        company: opportunity.company,
        coverLetter: `Dear ${opportunity.companyNameCopy} team,\n\nI am applying for the ${opportunity.title} opportunity. ` +
          `My skills and academic background match the requirements, and I am keen to learn from your team.\n\nKind regards,\n${student.user.name}`,
        answers: [],
        cvPath: student.profile.cvPath,
        cvOriginalName: student.profile.cvOriginalName,
        cvSource: 'profile',
        documents: [],
        status: finalStatus,
        appliedAt,
        statusHistory: chain.map((status, index) => ({
          status,
          changedAt: new Date(appliedAt.getTime() + index * randInt(1, 6) * day),
          changedBy: status === 'submitted' ? student.user._id : opportunity.company,
          note: status === 'submitted' ? 'Application submitted' : `Status changed to ${status.replace(/_/g, ' ')}`
        }))
      })
    );
  }

  // Top the demo accounts up so the demo logins always have data to show.
  const demoStats = await seedDemoAccountData(students, opportunities, demoCompanyId, demoStudentId, seen, applications);

  const rows = await Promise.all(applications);
  return { rows, demoStats };
}

/**
 * 3b. Guarantee the three *demo* accounts have data to look at.
 *
 * The random passes above spread applications over every company, which can
 * leave `company@isms.com` with nothing to review. This pass tops the demo
 * company up with a fixed number of applicants and makes sure the demo student
 * owns a few applications of their own.
 *
 * @param {Array} students
 * @param {Array} opportunities
 * @param {import('mongoose').Types.ObjectId} demoCompanyId
 * @param {import('mongoose').Types.ObjectId} demoStudentId
 * @param {Set<string>} seen  shared "studentId:opportunityId" set
 * @param {Set<string>} seen  shared `studentId:opportunityId` set
 * @param {Array} sink      array of pending `Application.create()` promises
 */
async function seedDemoAccountData(students, opportunities, demoCompanyId, demoStudentId, seen, sink) {
  const STATUS_CHAINS = {
    submitted: ['submitted'],
    under_review: ['submitted', 'under_review'],
    shortlisted: ['submitted', 'under_review', 'shortlisted'],
    interview: ['submitted', 'under_review', 'shortlisted', 'interview'],
    accepted: ['submitted', 'under_review', 'shortlisted', 'interview', 'accepted'],
    rejected: ['submitted', 'under_review', 'rejected']
  };

  /** Build one application document from a student + opportunity pair. */
  function build(student, opportunity, finalStatus, pool) {
    const appliedAt = new Date(Date.now() - randInt(1, 55) * day);
    return {
      student: student.user._id,
      opportunity: opportunity._id,
      company: opportunity.company,
      coverLetter:
        `Dear ${opportunity.companyNameCopy} team,\n\n` +
        `I am writing to apply for the ${opportunity.title}. I am a student with hands-on experience in ` +
        `${student.profile.skills.slice(0, 3).map((s) => s.name).join(', ')}, and I would be glad to contribute to ${opportunity.companyNameCopy}.\n\n` +
        `Thank you for your consideration.\n\nKind regards,\n${student.user.name}`,
      answers: [
        { question: 'Why are you a good fit for this opportunity? (max 300 characters)', answer: 'My profile matches most of the required skills and I learn quickly in a team.' },
        { question: opportunity.type === 'scholarship' ? 'How will this scholarship support your studies?' : 'What is the earliest date you could start?', answer: opportunity.type === 'scholarship' ? 'It would let me focus fully on my final-year coursework.' : 'I could start within two weeks.' }
      ],
      cvPath: student.profile.cvPath,
      cvOriginalName: student.profile.cvOriginalName,
      cvSource: Math.random() < 0.6 ? 'profile' : 'upload',
      documents: [],
      status: finalStatus,
      appliedAt,
      statusHistory: STATUS_CHAINS[finalStatus].map((status, index) => ({
        status,
        changedAt: new Date(appliedAt.getTime() + index * randInt(1, 7) * day),
        changedBy: status === 'submitted' ? student.user._id : opportunity.company,
        note: status === 'submitted' ? 'Application submitted' : `Status changed to ${status.replace(/_/g, ' ')}`
      }))
    };
  }

  const added = [];
  /** Create one application and register it in the shared sink. */
  function emit(student, opportunity, status) {
    const promise = Application.create(build(student, opportunity, status, students));
    added.push(promise);
    sink.push(promise);
    return promise;
  }
  const demoCompanyOpp = opportunities.filter(
    (o) => o.company.toString() === demoCompanyId.toString() && o.status === 'approved' && o.isActive && o.deadline.getTime() > Date.now()
  );
  const demoStudentOpp = opportunities.filter(
    (o) => o.status === 'approved' && o.isActive && o.deadline.getTime() > Date.now() && o.company.toString() !== demoCompanyId.toString()
  );

  // --- give the demo company a solid applicant pool (14 applications) -------
  const demoStatuses = ['submitted', 'under_review', 'under_review', 'shortlisted', 'shortlisted', 'interview', 'accepted', 'accepted', 'rejected', 'rejected', 'submitted', 'under_review', 'shortlisted', 'interview'];
  let created = 0;
  let guard = 0;
  while (created < demoStatuses.length && demoCompanyOpp.length && guard < 600) {
    guard += 1;
    const student = pick(students);
    const opportunity = pick(demoCompanyOpp);
    const key = `${student.user._id}:${opportunity._id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    emit(student, opportunity, demoStatuses[created]);
    created += 1;
  }

  // --- give the demo student several applications of their own -------------
  const studentStatuses = ['submitted', 'under_review', 'shortlisted', 'interview', 'accepted', 'under_review', 'shortlisted'];
  let studentCreated = 0;
  const demoStudent = students.find((s) => s.user._id.toString() === demoStudentId.toString());
  guard = 0;
  while (studentCreated < studentStatuses.length && demoStudent && demoStudentOpp.length && guard < 400) {
    guard += 1;
    const opportunity = pick(demoStudentOpp);
    const key = `${demoStudentId}:${opportunity._id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    emit(demoStudent, opportunity, studentStatuses[studentCreated]);
    studentCreated += 1;
  }

  await Promise.all(added);
  return { demoCompanyApplications: created, demoStudentApplications: studentCreated };
}

/** 4. Bookmarks, reviews, announcements, feedback, notifications, activity. */
async function seedSupportingData(students, companies, opportunities, applications, demoStudentId) {
  // ---- bookmarks (unique student + opportunity) -------------------------
  const bookmarkPairs = new Set();
  const bookmarkDocs = [];
  while (bookmarkDocs.length < 45 && bookmarkPairs.size < 200) {
    const s = pick(students);
    const o = pick(opportunities);
    const key = `${s.user._id}:${o._id}`;
    if (bookmarkPairs.has(key)) continue;
    bookmarkPairs.add(key);
    bookmarkDocs.push({ student: s.user._id, opportunity: o._id, createdAt: new Date(Date.now() - randInt(1, 50) * day) });
  }

  // Make sure the demo student has a visible "Saved opportunities" list too.
  if (demoStudentId) {
    sample(opportunities.filter((o) => o.status === 'approved' && o.isActive && o.deadline.getTime() > Date.now()), 6).forEach((o) => {
      const key = `${demoStudentId}:${o._id}`;
      if (bookmarkPairs.has(key)) return;
      bookmarkPairs.add(key);
      bookmarkDocs.push({ student: demoStudentId, opportunity: o._id, createdAt: new Date(Date.now() - randInt(1, 20) * day) });
    });
  }

  await Bookmark.insertMany(bookmarkDocs);

  // ---- reviews (unique student + company) -------------------------------
  const reviewPairs = new Set();
  const reviewDocs = [];
  while (reviewDocs.length < 34 && reviewPairs.size < 300) {
    const s = pick(students);
    const c = pick(companies);
    const key = `${s.user._id}:${c.user._id}`;
    if (reviewPairs.has(key)) continue;
    reviewPairs.add(key);
    reviewDocs.push({
      student: s.user._id,
      company: c.user._id,
      companyProfile: c.profile._id,
      rating: pick([3, 4, 4, 4, 5, 5, 5, 2]),
      comment: pick([
        'A supportive team. The intern was trusted with real work and the mentorship was excellent.',
        'Good communication throughout the process and a smooth onboarding experience.',
        'Well-structured programme with clear expectations and regular feedback.',
        'The project was challenging but very rewarding. Would recommend it to other students.',
        'Great learning environment. The only downside was a busy schedule during exam season.',
        'Friendly mentors and a genuinely collaborative culture.'
      ]),
      createdAt: new Date(Date.now() - randInt(5, 200) * day)
    });
  }
  await Review.insertMany(reviewDocs);

  // Cache the rating on each company profile (same maths as utils/notify.js).
  for (const company of companies) {
    const mine = reviewDocs.filter((r) => r.company.toString() === company.user._id.toString());
    const averageRating = mine.length ? Math.round((mine.reduce((s, r) => s + r.rating, 0) / mine.length) * 10) / 10 : 0;
    await CompanyProfile.updateOne({ _id: company.profile._id }, { averageRating, reviewCount: mine.length });
  }

  // ---- announcements ---------------------------------------------------
  const admin = await User.findOne({ role: 'admin' });
  await Announcement.insertMany([
    {
      title: 'Scholarship results for the current cycle',
      body: 'All scholarship applications for this cycle have been reviewed. Successful candidates can see the updated status in My applications. Congratulations!',
      audience: ['student'],
      level: 'success',
      createdBy: admin._id,
      createdByName: admin.name,
      createdAt: new Date(Date.now() - 3 * day)
    },
    {
      title: 'Reminder: keep your profile up to date',
      body: 'A complete profile (skills, CV and education) receives far more invitations from companies. Aim for 100% profile strength.',
      audience: ['student'],
      level: 'info',
      createdBy: admin._id,
      createdByName: admin.name,
      createdAt: new Date(Date.now() - 8 * day)
    },
    {
      title: 'Every new post is reviewed before going live',
      body: 'Opportunities appear for students only after administrator approval. Typical review time is under 24 hours.',
      audience: ['company'],
      level: 'info',
      createdBy: admin._id,
      createdByName: admin.name,
      createdAt: new Date(Date.now() - 5 * day)
    },
    {
      title: 'Platform maintenance window',
      body: 'The database will be indexed overnight. Expect no downtime, but report any issues through the contact page.',
      audience: ['student', 'company', 'admin'],
      level: 'warning',
      createdBy: admin._id,
      createdByName: admin.name,
      createdAt: new Date(Date.now() - 12 * day)
    }
  ]);

  // ---- feedback --------------------------------------------------------
  await Feedback.insertMany([
    { name: 'Rafiul Hasan', email: 'rafiul.hasan@example.com', subject: 'Feature Request', message: 'It would be great to see a calendar view showing all application deadlines in one place.', status: 'new', ip: '127.0.0.1', createdAt: new Date(Date.now() - 2 * day) },
    { name: 'Nusrat Jahan', email: 'nusrat.j@example.com', subject: 'Bug Report', message: 'The bookmark button on the opportunity card did not update the counter on my dashboard at first.', status: 'seen', ip: '127.0.0.1', createdAt: new Date(Date.now() - 6 * day) },
    { name: 'Tanvir Ahmed', email: 'tanvir.a@example.com', subject: 'General Feedback', message: 'Overall a very smooth experience. Search filters are fast and the application tracking timeline is helpful.', status: 'resolved', ip: '127.0.0.1', createdAt: new Date(Date.now() - 15 * day) },
    { name: 'Farhana Akter', email: 'farhana.akter@example.com', subject: 'Complaint', message: 'A company took four days to review my application and never updated the status. Please add a deadline reminder.', status: 'new', ip: '127.0.0.1', createdAt: new Date(Date.now() - 1 * day) },
    { name: 'Sanjay Das', email: 'sanjay.das@example.com', subject: 'Partnership', message: 'Our NGO would like to post 10 scholarships for rural students. Who should we speak to about a bulk posting?', status: 'new', ip: '127.0.0.1', createdAt: new Date(Date.now() - 4 * day) },
    { name: 'Mehedi Hasan', email: 'mehedi.h@example.com', subject: 'Other', message: 'Is there a way to filter scholarships by amount? The stipend range filter seems to work only for internships.', status: 'seen', ip: '127.0.0.1', createdAt: new Date(Date.now() - 9 * day) }
  ]);

  // ---- notifications ---------------------------------------------------
  const notificationDocs = [];

  applications.slice(0, 60).forEach((app) => {
    const label = app.status.replace(/_/g, ' ');
    notificationDocs.push({
      user: app.student,
      title: `Application ${label}`,
      message: `Your application is now marked as "${label}".`,
      type: 'status',
      link: `/student/applications/${app._id}`,
      isRead: Math.random() < 0.45,
      createdAt: new Date(app.appliedAt.getTime() + 2 * day)
    });
    if (app.status !== 'submitted') {
      notificationDocs.push({
        user: app.company,
        title: 'New applicant',
        message: 'A new application was received for one of your opportunities.',
        type: 'application',
        link: `/company/applications/${app._id}`,
        isRead: Math.random() < 0.5,
        createdAt: app.appliedAt
      });
    }
  });

  opportunities.filter((o) => o.status !== 'pending').slice(0, 25).forEach((o) => {
    notificationDocs.push({
      user: o.company,
      title: o.status === 'approved' ? 'Opportunity approved' : 'Opportunity rejected',
      message:
        o.status === 'approved'
          ? `Your post "${o.title}" has been approved and is now visible to students.`
          : `Your post "${o.title}" was rejected. Reason: ${o.rejectionReason}`,
      type: 'moderation',
      link: `/company/opportunities/${o._id}`,
      isRead: Math.random() < 0.4,
      createdAt: o.reviewedAt || new Date()
    });
  });

  await Notification.insertMany(notificationDocs);

  // ---- activity log ----------------------------------------------------
  const activityDocs = [];

  companies.forEach((c) => {
    activityDocs.push({ user: c.user._id, userName: c.user.name, userRole: 'company', action: 'register', entity: 'user', entityId: c.user._id, ip: '127.0.0.1', details: `New company account: ${c.user.email}`, createdAt: c.user.createdAt });
  });
  students.forEach((s) => {
    activityDocs.push({ user: s.user._id, userName: s.user.name, userRole: 'student', action: 'register', entity: 'user', entityId: s.user._id, ip: '127.0.0.1', details: `New student account: ${s.user.email}`, createdAt: s.user.createdAt });
    activityDocs.push({ user: s.user._id, userName: s.user.name, userRole: 'student', action: 'login', entity: 'auth', entityId: s.user._id, ip: '127.0.0.1', details: 'Signed in as student', createdAt: s.user.lastLogin || new Date() });
    activityDocs.push({ user: s.user._id, userName: s.user.name, userRole: 'student', action: 'profile_updated', entity: 'studentprofile', entityId: s.profile._id, ip: '127.0.0.1', details: 'Profile updated', createdAt: new Date(Date.now() - randInt(1, 60) * day) });
  });

  opportunities.slice(0, 45).forEach((o) => {
    activityDocs.push({ user: o.company, userName: o.companyNameCopy, userRole: 'company', action: 'opportunity_created', entity: 'opportunity', entityId: o._id, ip: '127.0.0.1', details: `"${o.title}" (${o.type}) submitted for approval`, createdAt: o.createdAt });
    if (o.status !== 'pending') {
      activityDocs.push({
        user: admin._id,
        userName: admin.name,
        userRole: 'admin',
        action: o.status === 'approved' ? 'opportunity_approved' : 'opportunity_rejected',
        entity: 'opportunity',
        entityId: o._id,
        ip: '127.0.0.1',
        details: o.status === 'approved' ? `"${o.title}"` : `"${o.title}" - reason: ${String(o.rejectionReason).slice(0, 60)}`,
        createdAt: o.reviewedAt || new Date()
      });
    }
  });

  applications.slice(0, 80).forEach((app) => {
    const student = students.find((s) => s.user._id.toString() === app.student.toString());
    activityDocs.push({
      user: app.student,
      userName: student ? student.user.name : 'Student',
      userRole: 'student',
      action: 'application_submitted',
      entity: 'application',
      entityId: app._id,
      ip: '127.0.0.1',
      details: `Applied to opportunity ${app.opportunity}`,
      createdAt: app.appliedAt
    });
    if (app.status !== 'submitted') {
      activityDocs.push({
        user: app.company,
        userName: opportunities.find((o) => o._id.toString() === app.opportunity.toString())?.companyNameCopy || 'Company',
        userRole: 'company',
        action: 'application_status_changed',
        entity: 'application',
        entityId: app._id,
        ip: '127.0.0.1',
        details: `Status changed to ${app.status}`,
        createdAt: new Date(app.appliedAt.getTime() + 2 * day)
      });
    }
  });

  await ActivityLog.insertMany(activityDocs);

  return { bookmarks: bookmarkDocs.length, reviews: reviewDocs.length, notifications: notificationDocs.length, activityLogs: activityDocs.length };
}

/** 5. Recalculate the profile strength of every student (same helper as the app). */
async function recalcStrength() {
  const { buildProfileChecklist } = require('../utils/profileStrength');
  const profiles = await StudentProfile.find().populate('user', 'name');
  for (const profile of profiles) {
    profile.profileStrength = buildProfileChecklist(profile, profile.user).profileStrength;
    await profile.save();
  }
  return profiles.length;
}

// ===========================================================================
// Summary output
// ===========================================================================
async function printSummary(counts) {
  const approved = await Opportunity.countDocuments({ status: 'approved' });
  const pending = await Opportunity.countDocuments({ status: 'pending' });
  const rejected = await Opportunity.countDocuments({ status: 'rejected' });
  const expired = await Opportunity.countDocuments({ deadline: { $lt: new Date() } });
  const open = await Opportunity.countDocuments({ status: 'approved', isActive: true, deadline: { $gt: new Date() } });

  const line = '  ' + '-'.repeat(66);
  const row = (label, value) => `  ${String(label).padEnd(34)} ${String(value).padStart(10)}`;

  console.log('\n' + '='.repeat(70));
  console.log('  ISMS SEED COMPLETE  -  database: isms_db');
  console.log('='.repeat(70));
  console.log(line);
  console.log(row('Collection', 'Documents'));
  console.log(line);
  console.log(row('users', counts.users));
  console.log(row('  of which students', counts.students));
  console.log(row('  of which companies', counts.companies));
  console.log(row('  of which admins', counts.admins));
  console.log(row('studentprofiles', counts.studentProfiles));
  console.log(row('companyprofiles', counts.companyProfiles));
  console.log(row('opportunities', counts.opportunities));
  console.log(row('  approved', approved));
  console.log(row('  pending (awaiting review)', pending));
  console.log(row('  rejected', rejected));
  console.log(row('  expired / closing soon', expired));
  console.log(row('  open to students now', open));
  console.log(row('applications', counts.applications));
  console.log(row('bookmarks', counts.bookmarks));
  console.log(row('reviews', counts.reviews));
  console.log(row('notifications', counts.notifications));
  console.log(row('activitylogs', counts.activityLogs));
  console.log(row('announcements', counts.announcements));
  console.log(row('feedbacks', counts.feedbacks));
  console.log(line);

  console.log('\n  Test accounts (full list in docs/TEST_ACCOUNTS.md):');
  console.log(line);
  console.log(row('Role', 'E-mail'));
  console.log(row('Admin', DEMO.admin.email));
  console.log(row('Company', DEMO.company.email));
  console.log(row('Student', DEMO.student.email));
  console.log(line);
  console.log('  Admin    password : ' + DEMO.admin.password);
  console.log('  Company  password : ' + DEMO.company.password);
  console.log('  Student  password : ' + DEMO.student.password);
  console.log(line);
  console.log('  Every other seeded company uses password "' + ROLE_PASSWORD.company + '"');
  console.log('  Every other seeded student uses password "' + ROLE_PASSWORD.student + '"');
  console.log('='.repeat(70) + '\n');
}

// ===========================================================================
// Main
// ===========================================================================
async function run() {
  const force = process.argv.includes('--force') || process.env.SEED_FORCE === 'true';

  console.log('');
  console.log('  ============================================================');
  console.log('   ISMS - seeding demo data into MongoDB');
  console.log('  ============================================================');
  console.log(`   target : ${process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/isms_db'}`);
  console.log('');

  await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/isms_db');

  if (!force && process.stdin.isTTY) {
    // eslint-disable-next-line global-require
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
      rl.question('  This will DELETE every document in the database. Continue? [y/N] ', resolve);
      rl.close();
    });
    if (!/^y(es)?$/i.test(String(answer).trim())) {
      console.log('  Aborted - nothing was changed.');
      await disconnectDB();
      process.exit(0);
    }
  }

  console.log('  [1/7] Clearing collections...');
  const wiped = {
    users: await wipe(User),
    studentprofiles: await wipe(StudentProfile),
    companyprofiles: await wipe(CompanyProfile),
    opportunities: await wipe(Opportunity),
    applications: await wipe(Application),
    notifications: await wipe(Notification),
    bookmarks: await wipe(Bookmark),
    reviews: await wipe(Review),
    activitylogs: await wipe(ActivityLog),
    feedbacks: await wipe(Feedback),
    announcements: await wipe(Announcement)
  };
  console.log(`        removed ${Object.values(wiped).reduce((a, b) => a + b, 0)} documents`);

  if (!process.argv.includes('--keep-uploads')) {
    console.log('  [2/7] Clearing the uploads folder (keeping .gitkeep)...');
    wipeUploads();
  } else {
    console.log('  [2/7] Keeping existing uploads.');
  }

  console.log('  [3/7] Creating users and profiles...');
  const users = await seedUsers();
  console.log(`        1 admin, ${users.companies.length} companies, ${users.students.length} students`);

  console.log('  [4/7] Creating opportunities...');
  const opportunities = await seedOpportunities(users.companies);
  console.log(`        ${opportunities.length} opportunities`);

  console.log('  [5/7] Creating applications with status histories...');
  const { rows: applications, demoStats } = await seedApplications(
    users.students,
    opportunities,
    users.companies[0].user._id, // company@isms.com
    users.students[0].user._id   // student@isms.com
  );
  console.log(`        ${applications.length} applications (${demoStats.demoCompanyApplications} for the demo company, ${demoStats.demoStudentApplications} for the demo student)`);

  console.log('  [6/7] Creating bookmarks, reviews, notifications, logs, announcements, feedback...');
  const support = await seedSupportingData(users.students, users.companies, opportunities, applications, users.students[0].user._id);

  console.log('  [7/7] Recalculating profile strength and building indexes...');
  await recalcStrength();
  await Promise.all(
    [User, StudentProfile, CompanyProfile, Opportunity, Application, Notification, Bookmark, Review, ActivityLog, Feedback, Announcement].map((m) =>
      m.syncIndexes().catch((err) => {
        console.warn(`        index sync warning on ${m.collection.name}: ${err.message}`);
      })
    )
  );

  const counts = {
    users: await User.countDocuments({}),
    students: await User.countDocuments({ role: 'student' }),
    companies: await User.countDocuments({ role: 'company' }),
    admins: await User.countDocuments({ role: 'admin' }),
    studentProfiles: await StudentProfile.countDocuments({}),
    companyProfiles: await CompanyProfile.countDocuments({}),
    opportunities: await Opportunity.countDocuments({}),
    applications: await Application.countDocuments({}),
    announcements: await Announcement.countDocuments({}),
    feedbacks: await Feedback.countDocuments({}),
    ...support
  };

  await printSummary(counts);
  await disconnectDB();
  console.log('  Done. Start the application with:  npm start\n');
  process.exit(0);
}

run().catch(async (err) => {
  console.error('\n[seed] FAILED:', err);
  try {
    await mongoose.connection.close();
  } catch (e) {
    /* ignore */
  }
  process.exit(1);
});