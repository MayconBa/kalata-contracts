let winston = require('winston');
let moment = require('moment');
require('winston-daily-rotate-file');


const customFormat = winston.format.printf((info) => {
    return `${moment().format()} ${info.message}`
})


let transport = new (winston.transports.DailyRotateFile)({
    filename: '/var/log/kalata/service-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '2G',
    maxFiles: '30d',
    format: winston.format.combine(customFormat)
});


let logger = winston.createLogger({
    transports: [transport]
});

logger.add(new winston.transports.Console({
    format: winston.format.combine(customFormat)
}));


module.exports = {
    logger
};

