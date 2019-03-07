let settings = require('/src/settings/settings_main').settings,
    bunyan = require('bunyan'),
    mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    mongodb,
    pns_instance = process.env.PNS_INSTANCE,
    localStorage = require('continuation-local-storage');


mongoose.Promise = global.Promise;

try {
    mongodb = mongoose.connect(settings.mongo_dsn_logs)
} catch (error) {
    console.error(error);
}

// mongo logger
let LogEntrySchema = new Schema(settings.schemas.log);

LogEntrySchema.path('message', {
    set: (data) => {
        if ('string' === typeof data) {
            return data;
        } else {
            return JSON.stringify(data);
        }
    }
});

let LogEntry = mongodb.model('pnslog', LogEntrySchema);

function getRequestLogId () {
    let request = localStorage.getNamespace('request');
    return  request && request.get('logId') || undefined;
}

let requestNamespace = localStorage.createNamespace('request');

let logger = bunyan.createLogger({
    serializers: {
        err: bunyan.stdSerializers.err
    },
    name: 'pns-logger',
    context: pns_instance,
    type: '',
    msg: '',
    content: {}
});

function generateLogId () {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function executeLog (param1, param2, method)  {

    let reqId = getRequestLogId();

    if (typeof param1 === 'string')
        return logger[method]({reqId}, param1)

    if (typeof param1 === 'object') {
        param1.logId = param1.logId ? param1.logId : reqId;
        return logger[method](param1, param2 || '');
    }
}

exports.logger = {

    info: (param1, param2) => {
        executeLog(param1, param2, 'info')
    },
    error: (param1, param2) => {
        executeLog(param1, param2, 'error')
    },
    warn: (param1, param2) => {
        executeLog(param1, param2, 'warn')
    },
    debug: (param1, param2) => {
        executeLog(param1, param2, 'debug')
    },
    fatal: (param1, param2) => {
        executeLog(param1, param2, 'fatal')
    },
    trace: (param1, param2) => {
        executeLog(param1, param2, 'trace')
    }

};

exports.middleware = (req, res, next) => {

    requestNamespace.run(() => {
        let logId = generateLogId();
        requestNamespace.set('logId', logId);
        logger.info({
            type: 'app',
            requestMethod: req.method,
            requestUrl: req.originalUrl,
            requestBody: JSON.stringify(req.body) || undefined,
            logId
        });

        next();
    });
}

exports.log = (mongoDoc) => {
    let timestamp = new Date();

    mongoDoc.timestamp = timestamp.getFullYear() + "-" +
        ("0" + timestamp.getMonth() + 1).slice(-2) + "-" +
        ("0" + timestamp.getDate()).slice(-2) + " " +
        ("0" + timestamp.getHours()).slice(-2) + ":" +
        ("0" + timestamp.getMinutes()).slice(-2) + ":" +
        ("0" + timestamp.getSeconds()).slice(-2);;

    console.log('doc for logging:');
    console.log(JSON.stringify(mongoDoc, null, 4));

    let mDoc = new LogEntry(mongoDoc);
    mDoc.save((err) => {
        if (err) {
            console.log(err);
        }
    });
}

exports.mongodb = mongodb;
exports.LogEntry = LogEntry;
exports.disconnect = () => { mongodb.disconnect() };