/**
 * app.js
 * ---------------------------------------------------------------------------
 * Express application assembly: middleware pipeline, view engine and routers.
 * server.js only loads the environment, connects to MongoDB and starts
 * listening, which keeps this file easy to reason about (and to test).
 */
'use strict';

const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

const { loadUser } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const format = require('./utils/format');
const { queryString } = require('./utils/pagination');
const Notification = require('./models/Notification');
const { globalLimiter } = require('./config/rateLimit');

const app = express();

// ===========================================================================
// View engine (EJS + layouts)
// ===========================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);
app.use(expressLayouts);

// ===========================================================================
// Security headers
// ===========================================================================
app.use(
  helmet({
    // Bootstrap / Bootstrap Icons / Chart.js / Google Fonts
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'cdn.jsdelivr.net'],
        styleSrc: ["'self'", 'cdn.jsdelivr.net', "'unsafe-inline'", 'fonts.googleapis.com'],
        fontSrc: ["'self'", 'cdn.jsdelivr.net', 'data:', 'fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: null
      }
    },
    // Fonts/CSS pulled from the CDN need cross-origin permission.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false
  })
);

// Stop the browser from guessing content types (MIME sniffing attacks).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ===========================================================================
// Core middleware
// ===========================================================================
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0 }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Flash messages + a tiny session (only used for flash data, never for auth).
app.use(
  session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 1000 // 1 hour is plenty for flash messages
    }
  })
);
app.use(flash());

// PUT / DELETE from HTML forms.
app.use(methodOverride('_method'));
app.use(methodOverride('X-HTTP-Method-Override'));

// Strip MongoDB operator injection from every input (FR / security).
app.use(mongoSanitize());
// Duplicate query/body parameters -> last one wins (defeats parameter pollution).
// IMPORTANT: hpp also collapses *intentional* multi-value form fields (the
// bulk-action checkboxes and the "answer[]" fields), so those are whitelisted
// and keep their full array.
app.use(
  hpp({
    checkQuery: true,
    checkBody: true,
    checkBodyOnlyForContentType: 'urlencoded',
    whitelist: ['applicationId', 'opportunityId', 'userId', 'answer', 'answer[]', 'audience']
  })
);

// ===========================================================================
// Rate limiting
// ===========================================================================
app.use(globalLimiter);

// ===========================================================================
// Authentication + view locals
// ===========================================================================
app.use(loadUser);

app.use(async (req, res, next) => {
  res.locals.currentUser = req.user || null;
  res.locals.currentPath = req.path;
  res.locals.originalUrl = req.originalUrl;
  res.locals.query = req.query || {};
  res.locals.qs = (overrides = {}) => queryString(req.query || {}, overrides);
  res.locals.format = format;

  // Consume this request's flash messages once, up front, so every view can
  // render them from res.locals.flashes (views never touch req directly).
  res.locals.flashes = ['success', 'error', 'warning', 'info'].flatMap((type) =>
    (req.flash(type) || []).map((msg) => ({ type, msg }))
  );

  // Convenience role flags used by every view.
  res.locals.isStudent = Boolean(req.user && req.user.role === 'student');
  res.locals.isCompany = Boolean(req.user && req.user.role === 'company');
  res.locals.isAdmin = Boolean(req.user && req.user.role === 'admin');

  // Unread bell counter (bonus feature 3).
  res.locals.unreadCount = 0;
  if (req.user) {
    try {
      res.locals.unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });
    } catch (err) {
      res.locals.unreadCount = 0;
    }
  }

  // Old submitted values / validation errors kept by middleware/validate.js
  res.locals.oldInput = (req.session && req.session.oldInput) || {};
  res.locals.oldErrors = (req.session && req.session.oldErrors) || [];
  if (req.session) {
    delete req.session.oldInput;
    delete req.session.oldErrors;
  }

  return next();
});

// ===========================================================================
// Routers
// ===========================================================================
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/opportunities', require('./routes/opportunity'));
app.use('/search', require('./routes/search'));
app.use('/companies', require('./routes/companyPublic'));
app.use('/student', require('./routes/student'));
app.use('/company', require('./routes/company'));
app.use('/notifications', require('./routes/notification'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/files', require('./routes/files'));
app.use('/feedback', require('./routes/feedback'));
app.use('/admin', require('./routes/admin'));

// ===========================================================================
// 404 + central error handler (must be last)
// ===========================================================================
app.use(notFound);
app.use(errorHandler);

module.exports = app;