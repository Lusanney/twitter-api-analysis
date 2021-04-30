var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var indexRouter = require('./routes/index');
var apiRouter = require('./routes/api');

const globalErrorHandler = require('./controllers/errorController');
const AppError = require('./utils/appError');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/api/v1', apiRouter);

/* -------------ERROR HANDLERS MIDDLEWARE---------------*/
// If not handle by other router, implement 404 Router
app.all('*', (req, res, next) => {
  /* NOTE Express will assume anything inside next() as an error
	it will skip all middlewares in middleware statck, and Handling with
	global error handler */
  if (!res.headersSent) {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
  }

  // Additional middleware can put here
  res.end();
});

// Error Middleware Handler
app.use(globalErrorHandler);

module.exports = app;
