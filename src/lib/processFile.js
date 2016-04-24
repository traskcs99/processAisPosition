#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var log = require('verbalize');
var argv = require('minimist')(process.argv.slice(2));
var mongoose = require('mongoose');

var ShipPosition = require('./models/shipposition.model.js');
var ProcessedFile = require('./models/ProcessedFile.js');

var db = mongoose.connect('localhost', 'ais');

// CONNECTION EVENTS
// When successfully connected
mongoose.connection.on('connected', function() {
    log.info('Mongoose default connection open to ');
});
// If the connection throws an error
mongoose.connection.on('error', function(err) {
    logi.error('Mongoose default connection error: ' + err);
});

// When the connection is disconnected
mongoose.connection.on('disconnected', function() {
    log.info('Mongoose default connection disconnected');
});

/**
 * Represents a ProcessFile.
 * @constructor
 * @param {verbalize} log - console log reporter
 * @param {minimilist} minimilist - command line argument parser
 */
function ProcessFile(log, argv) {
    this.log = log;
    this.argv = argv;
}


ProcessFile.prototype.run = function() {

    this.log.runner = 'process-ais-position';
    this.parseCLI();
    this.getFiles();
    this.log.success(this.log.runner + " Program complete");
};

ProcessFile.prototype.parseCLI = function() {

    // Use `-i` or `--input` to specify the source directory
    this.input = (this.argv.i || this.argv.input || '/home/traskcs/dev/python/ais/data/')
        .trim();

    // Use `-a` or `--archive` to specify the text to append
    this.archive = this.argv.a || this.argv.archive || false;

    if (this.input) {
        this.log.info(this.log.runner + ' [INPUT DIRECTORY] ' + this.input);
    }
    if (!this.input) {
        this.log.error(this.log.runner +
            ' Please provide an input directory, either as a first argument or with `-i`');
    }

    if (this.archive) {
        this.log.info(this.log.runner + ' Source files are being archived');
    }
};

ProcessFile.prototype.getFiles = function() {
    return ProcessedFile.ProcessedFile.find({})
        .exec((err, files) => {
            if (err) {
                this.log.error(err);
            }
            this.files = files;
            this.log.info('files: ' + files);
            return;
        });
};

/**
 * Application
 */
var p = new ProcessFile(log, argv);
p.run();
