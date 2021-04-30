class AppError extends Error {
    /**
     * This class handle the Error Middleware from ExpressJS with custom
     *  message and statusCode
     * @param {String} message - Message to send to client
     * @param {Number} statusCode - HTTP StatusCode
     */
    constructor(message, statusCode, isOperational = true) {
        super(message);
        this.message = message;
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = isOperational;

        Error.captureStackTrace(this, this.constructor);
    }
}
  
module.exports = AppError;
  