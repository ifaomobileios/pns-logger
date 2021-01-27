let bunyan = require('bunyan'),
    zlib = require("zlib"),
    environment = process.env.NODE_ENV,
    localStorage = require('cls-hooked'),
    os = require("os"),
    hostname = os.hostname();

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

                        resolve(a)
                    }
                    catch(e){};
                }
            });
        } else  {
            try {
                resolve(res.responseBody.toString())
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
                let logId = req.headers['log-id'] || generateLogId();
                let extractedRequestFields = extractImportantLogFields(req.body);
                let stringifiedRequestBody = JSON.stringify(req.body) || "";

                requestNamespace.set('logId', logId);

                if (stringifiedRequestBody.length > 8190) { // Elasticsearch supports only 8192 UTF-8 characters per field
                    stringifiedRequestBody = stringifiedRequestBody.substring(0, 8190)
                }

                logger.info({
                    // json: req.body || undefined,
                    json: Object.assign(extractedRequestFields, {requestBody: stringifiedRequestBody}),
                    requestHeaders: req.headers,
                    requestUrl: req.originalUrl,
                    requestMethod: req.method
                }, 'Incoming request');

                res.on('finish', async () => {
                    let stringifiedResponseBody = await parseResponseBody(req, res);

                    if (stringifiedResponseBody.length > 8190) { // Elasticsearch supports only 8192 UTF-8 characters per field
                        stringifiedResponseBody = stringifiedResponseBody.substring(0, 8190)
                    }

                    let responseBody = {
                        responseBody: stringifiedResponseBody || null
                    };

                    logger.info({
                        json: responseBody,
                        status: res.statusCode,
                        requestUrl: req.originalUrl,
                        requestMethod: req.method,
                    }, 'Request completed');                
                });
            }   
            
            next();
        });
    }
};

function extractImportantLogFields(data){
    let importantFieldNames = {
        userguid: { name: 'userGUID', type: 'string'},
        tripid: { name: 'tripID', type: 'string'},
        eventtype: { name: 'eventType', type: 'string'},
        tripdescription: { name: 'tripDescription', type: 'string'},
        deviceid: { name: 'deviceID', type: 'string'},
        applicationid: { name: 'applicationID', type: 'string'},
        email: { name: 'email', type: 'string'}
    };
    let obj = {};

    for (let key in data) {
        if(importantFieldNames[key.toLowerCase()] && importantFieldNames[key.toLowerCase()].type == typeof data[key]){
            obj[importantFieldNames[key.toLowerCase()].name] = data[key]; 
        };
    }

    return obj
}

exports.generateLogId = generateLogId;