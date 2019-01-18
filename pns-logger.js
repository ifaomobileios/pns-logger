let settings = require('/src/settings/settings_main').settings,
    bunyan = require('bunyan'),
    mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    mongodb,
    pns_instance = process.env.PNS_INSTANCE;

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

exports.logger = bunyan.createLogger({
    serializers: { err: bunyan.stdSerializers.err },
    name: 'pns-logger',
    context: pns_instance,
    type: '',
    msg: '',
    logId: '',
    content: {}
});

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

exports.generateLogId = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

exports.mongodb = mongodb;
exports.LogEntry = LogEntry;
exports.disconnect = () => { mongodb.disconnect() };