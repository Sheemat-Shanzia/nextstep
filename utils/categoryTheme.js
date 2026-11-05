/**
 * utils/categoryTheme.js
 * ---------------------------------------------------------------------------
 * Centralized dynamic category icon and color mapping system for NextStep.
 * Automatically determines appropriate pastel background, dark contrast icon,
 * and Lucide SVG based on opportunity type, category, title, industry, and skills.
 */
'use strict';

/** Lucide SVG Icon definitions (24x24 viewBox, stroke-width=2) */
const ICONS = {
  Award: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>`,

  GraduationCap: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>`,

  Microscope: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><path d="M6 18h8"/><path d="M3 22h18"/><path d="m14 22 3-3-3-3"/><path d="m9 14 5.65-5.65a1 1 0 0 0 0-1.41l-2.83-2.83a1 1 0 0 0-1.41 0L4.76 9.76a1 1 0 0 0 0 1.41L7.59 14a1 1 0 0 0 1.41 0"/><path d="m14 8 2.5-2.5"/><path d="m17 11 2.5-2.5"/></svg>`,

  Laptop: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/></svg>`,

  Cog: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,

  Stethoscope: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>`,

  Code: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,

  Database: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,

  Cpu: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`,

  Palette: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2Z"/></svg>`,

  Megaphone: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>`,

  Wallet: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>`,

  Briefcase: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>`,

  HeartHandshake: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.86.86 2.26.86 3.12 0l2.67-2.67"/><path d="m14 9 1.83 1.83a2.17 2.17 0 0 1 0 3.08c-.86.86-2.26.86-3.12 0L9.88 11.08"/></svg>`,

  Building2: (s = 20) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="category-icon-svg"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`
};

/** Palette & Theme Configurations matching user specification */
const THEMES = {
  // --- SCHOLARSHIPS ---
  scholarship_general: {
    bg: '#F3E8FF',
    color: '#7E22CE',
    border: 'rgba(126, 34, 206, 0.22)',
    iconName: 'Award',
    label: 'Scholarship'
  },
  scholarship_education: {
    bg: '#E0F2FE',
    color: '#0369A1',
    border: 'rgba(3, 105, 161, 0.22)',
    iconName: 'GraduationCap',
    label: 'Education Scholarship'
  },
  scholarship_research: {
    bg: '#CCFBF1',
    color: '#0F766E',
    border: 'rgba(15, 118, 110, 0.22)',
    iconName: 'Microscope',
    label: 'Research Scholarship'
  },
  scholarship_technology: {
    bg: '#E0E7FF',
    color: '#4338CA',
    border: 'rgba(67, 56, 202, 0.22)',
    iconName: 'Laptop',
    label: 'Technology Scholarship'
  },
  scholarship_engineering: {
    bg: '#FFEDD5',
    color: '#C2410C',
    border: 'rgba(194, 65, 12, 0.22)',
    iconName: 'Cog',
    label: 'Engineering Scholarship'
  },
  scholarship_medical: {
    bg: '#FEE2E2',
    color: '#B91C1C',
    border: 'rgba(185, 28, 28, 0.22)',
    iconName: 'Stethoscope',
    label: 'Medical Scholarship'
  },

  // --- INTERNSHIPS ---
  internship_software: {
    bg: '#DBEAFE',
    color: '#1D4ED8',
    border: 'rgba(29, 78, 216, 0.22)',
    iconName: 'Code',
    label: 'Software Development'
  },
  internship_datascience: {
    bg: '#F3E8FF',
    color: '#7E22CE',
    border: 'rgba(126, 34, 206, 0.22)',
    iconName: 'Database',
    label: 'Data Science & AI'
  },
  internship_engineering: {
    bg: '#FFEDD5',
    color: '#C2410C',
    border: 'rgba(194, 65, 12, 0.22)',
    iconName: 'Cpu',
    label: 'Engineering'
  },
  internship_design: {
    bg: '#FCE7F3',
    color: '#BE185D',
    border: 'rgba(190, 24, 93, 0.22)',
    iconName: 'Palette',
    label: 'UI/UX Design'
  },
  internship_marketing: {
    bg: '#FEF3C7',
    color: '#B45309',
    border: 'rgba(180, 83, 9, 0.22)',
    iconName: 'Megaphone',
    label: 'Marketing'
  },
  internship_finance: {
    bg: '#DCFCE7',
    color: '#15803D',
    border: 'rgba(21, 128, 61, 0.22)',
    iconName: 'Wallet',
    label: 'Finance'
  },
  internship_research: {
    bg: '#CCFBF1',
    color: '#0F766E',
    border: 'rgba(15, 118, 110, 0.22)',
    iconName: 'Microscope',
    label: 'Research'
  },
  internship_general: {
    bg: '#E0E7FF',
    color: '#4338CA',
    border: 'rgba(67, 56, 202, 0.22)',
    iconName: 'Briefcase',
    label: 'Internship'
  },

  // --- COMPANIES ---
  company_tech: {
    bg: '#E0F2FE',
    color: '#0369A1',
    border: 'rgba(3, 105, 161, 0.22)',
    iconName: 'Laptop',
    label: 'Technology Company'
  },
  company_education: {
    bg: '#E0E7FF',
    color: '#4338CA',
    border: 'rgba(67, 56, 202, 0.22)',
    iconName: 'GraduationCap',
    label: 'Education Organization'
  },
  company_finance: {
    bg: '#DCFCE7',
    color: '#15803D',
    border: 'rgba(21, 128, 61, 0.22)',
    iconName: 'Wallet',
    label: 'Finance Firm'
  },
  company_healthcare: {
    bg: '#FEE2E2',
    color: '#B91C1C',
    border: 'rgba(185, 28, 28, 0.22)',
    iconName: 'Stethoscope',
    label: 'Healthcare Organization'
  },
  company_engineering: {
    bg: '#FFEDD5',
    color: '#C2410C',
    border: 'rgba(194, 65, 12, 0.22)',
    iconName: 'Cog',
    label: 'Engineering Company'
  },
  company_nonprofit: {
    bg: '#CCFBF1',
    color: '#0F766E',
    border: 'rgba(15, 118, 110, 0.22)',
    iconName: 'HeartHandshake',
    label: 'Non-profit Foundation'
  },
  company_general: {
    bg: '#F3E8FF',
    color: '#7E22CE',
    border: 'rgba(126, 34, 206, 0.22)',
    iconName: 'Building2',
    label: 'Company'
  }
};

/**
 * Automatically determine the category theme based on opportunity or company record.
 * @param {Object|string} target - Opportunity document, CompanyProfile, or Category string
 * @param {string} [typeHint] - 'internship', 'scholarship', or 'company'
 * @returns {Object} Theme descriptor with icon, colors, and render helpers
 */
function getCategoryTheme(target, typeHint = '') {
  let type = '';
  let category = '';
  let title = '';
  let skills = [];
  let industry = '';

  if (typeof target === 'string') {
    category = target;
    title = target;
    type = typeHint;
  } else if (target && typeof target === 'object') {
    type = target.type || typeHint || '';
    category = target.category || '';
    industry = target.industry || (target.companyProfile && target.companyProfile.industry) || '';
    title = target.title || target.companyName || (target.companyProfile && target.companyProfile.companyName) || target.companyNameCopy || '';
    if (Array.isArray(target.requiredSkills)) skills = target.requiredSkills;
  }

  const text = `${type} ${category} ${industry} ${title} ${skills.join(' ')}`.toLowerCase();

  // 1. SCHOLARSHIPS
  const isScholarship =
    type === 'scholarship' ||
    text.includes('scholarship') ||
    text.includes('fellowship') ||
    text.includes('grant') ||
    text.includes('tuition');

  if (isScholarship) {
    if (text.includes('medic') || text.includes('health') || text.includes('nurs') || text.includes('doctor') || text.includes('clinic')) {
      return decorateTheme(THEMES.scholarship_medical);
    }
    if (text.includes('research') || text.includes('microscope') || text.includes('scientific') || text.includes('lab')) {
      return decorateTheme(THEMES.scholarship_research);
    }
    if (text.includes('educat') || text.includes('teach') || text.includes('academ') || text.includes('school')) {
      return decorateTheme(THEMES.scholarship_education);
    }
    if (text.includes('tech') || text.includes('software') || text.includes('computer') || text.includes('ai') || text.includes('data')) {
      return decorateTheme(THEMES.scholarship_technology);
    }
    if (text.includes('engineer') || text.includes('mechanic') || text.includes('civil') || text.includes('robot')) {
      return decorateTheme(THEMES.scholarship_engineering);
    }
    // Default Scholarship (e.g. Community Impact, Merit, General)
    return decorateTheme(THEMES.scholarship_general);
  }

  // 2. COMPANIES (when target is a company profile or specifically requested)
  const isCompanyContext =
    typeHint === 'company' ||
    (!type && (target.companyName || target.industry || target.website || target.size));

  if (isCompanyContext) {
    if (text.includes('health') || text.includes('medic') || text.includes('pharma') || text.includes('hospital') || text.includes('biotech')) {
      return decorateTheme(THEMES.company_healthcare);
    }
    if (text.includes('non-profit') || text.includes('nonprofit') || text.includes('foundation') || text.includes('charity') || text.includes('ngo')) {
      return decorateTheme(THEMES.company_nonprofit);
    }
    if (text.includes('finance') || text.includes('bank') || text.includes('fintech') || text.includes('invest') || text.includes('capital')) {
      return decorateTheme(THEMES.company_finance);
    }
    if (text.includes('educat') || text.includes('edtech') || text.includes('university') || text.includes('academy') || text.includes('school')) {
      return decorateTheme(THEMES.company_education);
    }
    if (text.includes('engineer') || text.includes('construct') || text.includes('manufactur') || text.includes('industrial')) {
      return decorateTheme(THEMES.company_engineering);
    }
    if (text.includes('tech') || text.includes('software') || text.includes('cloud') || text.includes('it') || text.includes('digital') || text.includes('ai')) {
      return decorateTheme(THEMES.company_tech);
    }
    return decorateTheme(THEMES.company_general);
  }

  // 3. INTERNSHIPS (or general opportunity)
  if (category === 'Software Development' || text.includes('software') || text.includes('developer') || text.includes('frontend') || text.includes('backend') || text.includes('fullstack') || text.includes('programming') || text.includes('code') || text.includes('web dev')) {
    return decorateTheme(THEMES.internship_software);
  }
  if (category === 'Data Science & AI' || text.includes('data science') || text.includes('machine learning') || text.includes('deep learning') || text.includes('analytics') || text.includes('database') || text.includes('sql') || text.includes('big data')) {
    return decorateTheme(THEMES.internship_datascience);
  }
  if (category === 'Design' || text.includes('ui/ux') || text.includes('design') || text.includes('ux') || text.includes('ui') || text.includes('figma') || text.includes('graphic')) {
    return decorateTheme(THEMES.internship_design);
  }
  if (category === 'Engineering' || text.includes('engineer') || text.includes('hardware') || text.includes('circuit') || text.includes('embedded') || text.includes('cpu')) {
    return decorateTheme(THEMES.internship_engineering);
  }
  if (category === 'Marketing' || text.includes('marketing') || text.includes('seo') || text.includes('social media') || text.includes('sales') || text.includes('advertising') || text.includes('megaphone')) {
    return decorateTheme(THEMES.internship_marketing);
  }
  if (category === 'Finance' || text.includes('finance') || text.includes('accounting') || text.includes('bank') || text.includes('fintech') || text.includes('wallet')) {
    return decorateTheme(THEMES.internship_finance);
  }
  if (category === 'Research' || text.includes('research') || text.includes('scientific') || text.includes('laboratory') || text.includes('microscope')) {
    return decorateTheme(THEMES.internship_research);
  }
  if (text.includes('medic') || text.includes('health') || text.includes('clinical') || text.includes('hospital')) {
    return decorateTheme(THEMES.scholarship_medical);
  }

  // Default Internship Fallback
  return decorateTheme(THEMES.internship_general);
}

/** Decorate theme object with SVG renderer and HTML helper */
function decorateTheme(base) {
  const iconSvgFn = ICONS[base.iconName] || ICONS.Briefcase;
  return {
    ...base,
    getSvg: (size = 20) => iconSvgFn(size),
    render: (options = {}) => renderCategoryIcon(base, options)
  };
}

/**
 * Render rounded-square icon container HTML.
 * @param {Object} themeOrTarget - Theme object or target to resolve
 * @param {Object} [options] - size, borderRadius, className, style
 * @returns {string} Safe HTML string
 */
function renderCategoryIcon(themeOrTarget, options = {}) {
  const theme = themeOrTarget && themeOrTarget.bg && themeOrTarget.getSvg
    ? themeOrTarget
    : getCategoryTheme(themeOrTarget, options.type || '');

  const size = options.size || 46;
  const iconSize = options.iconSize || Math.max(16, Math.round(size * 0.48));
  const radius = options.borderRadius || Math.max(8, Math.round(size * 0.24));
  const customClass = options.className || '';

  const svg = theme.getSvg(iconSize);

  return `<span class="category-icon-box ${customClass}" style="background-color:${theme.bg};color:${theme.color};border:1px solid ${theme.border};width:${size}px;height:${size}px;border-radius:${radius}px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,0.04);" title="${theme.label}" aria-label="${theme.label}">${svg}</span>`;
}

/**
 * Helper to build an onerror HTML snippet for <img> tags.
 * Safely escapes double-quotes.
 */
function getLogoFallbackHtml(target, options = {}) {
  const html = renderCategoryIcon(target, options);
  return html.replace(/"/g, '&quot;');
}

module.exports = {
  ICONS,
  THEMES,
  getCategoryTheme,
  renderCategoryIcon,
  getLogoFallbackHtml
};
