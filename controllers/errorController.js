const AppError = require('../utils/appError');

/**
 * This method send an error response to the client
 *  in development environment. We will give as much
 *  details of error as we can to debug
 *
 * @param {*} err Instance of AppError
 * @param {*} res Instance of Response of ExpressJS
 */
const sendErrorDev = (err, req, res) => {
  if(req.url.startsWith('/api'))
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      error: err,
      stack: err.stack
    });
  else
    res.render('error', {
      message: err.message,
      code: err.statusCode,
      title: "Something wrong happens"
    })
};

/**
 * This method send an error response to the client
 *  in production environment. We never give users too
 *  much details about our errors.
 *
 * Recommend to use Error Controllers as written to
 *  prepare for this
 * @param {*} err Instance of AppError
 * @param {*} res Instance of Response of ExpressJS
 */
const sendErrorProd = (err, req, res) => {
  if(req.url.startsWith('/api'))
    // Operational, trusted error: send message to client
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });

      // Programming or other unknown error
    } else {
      // Log to the console, but not to the client
      console.error('*****ERROR*****\n', err);

      res.status(500).json({
        status: 'error',
        message: 'There were something wrong'
      });
    }
  else
    res.render('error', {
      message: err.message,
      code: err.statusCode,
      title: "Something wrong happens"
    })
};

/**
 * Main method that handles the Error and send back to client end.
 *  It will distinguish between whether a production env or development env.
 *  If it is dev env, send the as much as details of error for users & developers
 *  for debugging. Otherwise, if production env, only send appropriate error message.
 *
 *  Please consider to use Error Controllers as provided to prepare for this.
 */
module.exports = (error, req, res, next) => {
  // If is not defined, take a default value
  error.statusCode = error.statusCode || 500;
  error.status = error.status || 'error';
  if (process.env.NODE_ENV === 'development') {
    console.log(error);
    sendErrorDev(error, req, res);
  }
  // Only send error handlers in production env, that we already customed the message
  else if (process.env.NODE_ENV === 'production') {
    // if (error.name === 'CityNotFound') error = handleCityNotFound(error);

    // Send back production error when all is handled
    sendErrorProd(error, req, res);
  }
};
