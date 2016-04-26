var log = require('verbalize');
var util = require('util');

function Logger(name) {
    log.call(this);
    this.name = name;
}

util.inherits(Logger, log);

Logger.prototype.info = function(data) {
    Logger.super_.info.call(this,'[' + this.name + '] ' + data);
};

Logger.prototype.error = function(data) {
    Logger.super_.error.call(this,'[' + this.name +  '] ' + data);
};

Logger.prototype.log = function(data) {
    Logger.super_.log.call(this, '[' + this.name + '] '  + data);
};

Logger.prototype.success = function(data) {
    Logger.super_.success.call( '[' + this.name + '] '  + data);
};

module.exports = Logger;
