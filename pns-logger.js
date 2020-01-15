let bunyan = require('bunyan'),
    mongoose = require('mongoose'),
    zlib = require("zlib"),
    Schema = mongoose.Schema,
    mongodb,
    settings = require('../settings/settings_main'),
    dbUrl = settings.db.host,
    dbTestingUrl = settings.db.testingHost,
    replicaSet = settings.db.replicaSet,
    dbLogs = settings.db.logs,
    environment = process.env.NODE_ENV,
    localStorage = require('cls-hooked'),
    os = require("os"),
    hostname = os.hostname(),
    moment = require('moment');

mongoose.Promise = global.Promise;


try {
    let connectionString;

    if (environment === 'testing') 
        connectionString = `${dbTestingUrl}${dbLogs}?${replicaSet}`;
    else 
        connectionString = `${dbUrl}${dbLogs}?${replicaSet}`;
       
    mongodb = mongoose.connect(connectionString);

} catch (error) {
    console.log(`PNS logger error:`);
    console.error(error);
}

// mongo logger
let logSchema = {
    'Device ID': String,
    'User ID': String,
    'Server Name': String,
    'System Name': String,
    'Application ID': String,
    'Device Type': String,
    'level': String,
    'tag': String,
    'timestamp': String,
    'message': String,
    'PUSH URL': String,
    'MANIC MESSENGER RESULT': String,
    'ROUTING KEY': String
};

let LogEntrySchema = new Schema(logSchema);

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

let bunyanLogger = bunyan.createLogger({
    serializers: {
        err: bunyan.stdSerializers.err
    },
    name: 'pns-logger',
    context: hostname,
    environment: environment,
    type: 'operational',
    msg: ''
});

function generateLogId () {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function executeLog (param1, param2, method)  {

    let reqId = getRequestLogId();

    if (typeof param1 === 'string')
        return bunyanLogger[method]({reqId}, param1);

    if (typeof param1 === 'object') {
        param1.logId = param1.logId ? param1.logId : reqId;
        return bunyanLogger[method](param1, param2 || '');
    }
}

let logger = {

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

exports.logger =logger;

function attachResponseBody (req, res) {
    let oldWrite = res.write,
        oldEnd = res.end,
        buffer = [];

    res.write = function (chunk) {
        buffer.push(new Buffer(chunk));
        oldWrite.apply(res,arguments)

        res.responseBody = buffer;
    };

    res.end = function (chunk) {
        if (chunk) {
            buffer.push(new Buffer(chunk))
            oldEnd.apply(res, arguments);

            res.responseBody = buffer;
        }        

        oldEnd.apply(res, arguments);
    }      
}

function parseResponseBody(req, res){
    return new Promise((resolve, reject) => {
        let responseHeaders = res.getHeaders();

        if(responseHeaders && responseHeaders['content-encoding'] === 'gzip') {
            zlib.unzip(Buffer.concat(res.responseBody), (err, buffer) => {
                if (!err) {
                    try {
                        let a = buffer.toString()

                        resolve(JSON.parse(a))
                    }
                    catch(e){};
                }
            });
        } else  {
            try {
                resolve(JSON.parse(res.responseBody.toString()))
            }
            catch(e){};
        }
    })
}

exports.middleware = function (options) {

    let defaultOptions = {
        attachResponseBody: true
    };

    if (options)
        defaultOptions = Object.assign(defaultOptions, options);


    return function (req, res, next) {
        if(defaultOptions.attachResponseBody) {
            attachResponseBody(req, res);
        }
                  
        requestNamespace.run(() => {
            if(req.originalUrl.indexOf('/version') < 0) {
                let logId = generateLogId();
                requestNamespace.set('logId', logId);

                logger.info({
                    json: req.body || undefined,
                    requestHeaders: req.headers,
                    requestUrl: req.originalUrl,
                    requestMethod: req.method
                }, 'Incoming request');

                res.on('finish', async () => {
                    let parsedResponseBody = await parseResponseBody(req, res);

                    logger.info({
                        json:  parsedResponseBody || null,
                        responseStatus: res.statusCode,
                        requestUrl: req.originalUrl,
                        requestMethod: req.method,
                    }, 'Request completed');                
                });
            }   
            
            next();
        });
    }
};

exports.log = (mongoDoc) => {

    mongoDoc.timestamp = moment().format('YYYY-MM-DD HH:mm:ss');

    logger.info({json: {mongoDoc}});

    let mDoc = new LogEntry(mongoDoc);

    mDoc.save((err) => {
        if (err) {
            logger.warn(err);
        }
    });
};

exports.mongodb = mongodb;
exports.LogEntry = LogEntry;
exports.disconnect = () => { mongodb.disconnect() };
