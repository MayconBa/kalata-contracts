let winston = require('winston');
require('winston-daily-rotate-file');

let transport = new (winston.transports.DailyRotateFile)({
    filename: '/var/log/service-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '2G',
    maxFiles: '30d'
});


let logger = winston.createLogger({
    transports: [transport]
});

logger.add(new winston.transports.Console({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    )
}));


module.exports = {
    logger
};

