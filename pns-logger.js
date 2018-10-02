var settings = require('/src/settings/settings_main').settings,
    bunyan = require('bunyan'),
    mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    mongodb,
    ObjectId = Schema.ObjectId,
    pns_instance = process.env.PNS_INSTANCE;

    console.log(settings.mongo_dsn_logs)

    

    try {
        mongodb = mongoose.connect(settings.mongo_dsn_logs)
    } catch(error) {
        console.error(error);
    }

mongoose.Promise = global.Promise;

// mongo logger
var LogEntrySchema = new Schema({
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
});

LogEntrySchema.path('message', {
    set: function (data) {
        if ('string' === typeof data) {
            return data;
        } else {
            return JSON.stringify(data);
        }
    }
});


var LogEntry = mongodb.model('pnslog', LogEntrySchema);

exports.logger = bunyan.createLogger({ 
    name: 'pns-logger',
    context: pns_instance,
    type: '',
    log: '',
    content: {},
    streams: [
        {
            level: 'info',
            name: 'info',
            stream: process.stdout
        },
        {
            level: 'warn',
            name: 'warn',
            stream: process.stdout
        },
        {
            level: 'error',
            name: 'error',
            stream: process.stdout
        }
    ]
});

exports.log = function (mongoDoc, elkToken) {
    var elkTokenRegex = elkToken ? `[${elkToken}] ` : '';

    mongoDoc.timestamp = Date.parse('now').toString('yyyy-MM-dd HH:mm:ss');

    console.log('doc for logging:');
    console.log(`${elkTokenRegex}`, JSON.stringify(mongoDoc, null, 4));

    var mDoc = new LogEntry(mongoDoc);
    mDoc.save(function (err) {
        if (err) {
            console.log('Error in logging!');
            console.log(err);
        }
    });
}

exports.mongodb = mongodb;
exports.LogEntry = LogEntry;
exports.disconnect = function () { mongodb.disconnect() };
