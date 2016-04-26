#!/usr/bin/env node

var fs = require('fs');
var Log = require('./logger.js');
var argv = require('minimist')(process.argv.slice(2));
var mongoose = require('mongoose');

//var path = require('path');
//var ShipPosition = require('./models/shipposition.model.js');
var ProcessedFile = require('./models/ProcessedFile.js');


/**
 * Represents a ProcessFile.
 *
 * @constructor
 * @param {argv} argv
 */
function ProcessFile(argv) {
    this.log = new Log('process-ais-position');
    this.argv = argv;
}

/*
 * run - starts the ProcessFile script
 *
 * responsible for running all the correct functions
 * in order
 */
ProcessFile.prototype.run = function() {
    this.log.info('Program has started.');
    this.connectDB('localhost', 'ais').then(() => {
        this.parseCLI();
    }).catch((err)=>{
        this.log.error(err);
        this.log.error('Exiting with connection error.');
        process.exit(1);
    });
    //get files from FS that have not been processed into DB
    this.getFilesToProcess()
        .then((filesToProcess) => {
            this.log.success(this.log.runner + ' Program complete');
            process.exit();
        });
};

ProcessFile.prototype.connectDB = function(server,dataBase) {
    var self = this;
    return new Promise((fulfill, reject) => {
        mongoose.connect(server, dataBase);

        // CONNECTION EVENTS
        // When successfully connected
        mongoose.connection.on('connected', function() {
            self.log.info('Mongoose default connection open to ' + server + '/' + dataBase);
            fulfill();
        });
        // If the connection throws an error
        mongoose.connection.on('error', function(err) {
            self.log.error('Mongoose default connection error: ' + err);
            reject(err);
        });

        // When the connection is disconnected
        mongoose.connection.on('disconnected', function() {
            self.log.info('Mongoose default connection disconnected');
            reject('Connection Error');
        });
    });
};

/**
 * Responsible for parsing the CLI arguments
 *
 * -i or --input is the directory of json files
 *  this is saved in this.input
 *
 * -a or --archive is used to save the json files
 *  into an archive folder
 */
ProcessFile.prototype.parseCLI = function() {
    this.log.info('Processing CLI');
    // Use `-i` or `--input` to specify the source directory
    this.input = (this.argv.i || this.argv.input ||
        '/home/traskcs/dev/python/ais/data/').trim();

    // Use `-a` or `--archive` to specify the text to append
    this.archive = this.argv.a || this.argv.archive || false;

    if (this.input) {
        this.log.info('[INPUT DIRECTORY] ' + this.input);
    }
    if (!this.input) {
        this.log.error(this.log.runner +
            ' Please provide an input directory, ' +
            'either as a first argument or with `-i`');
    }

    if (this.archive) {
        this.log.info(this.log.runner + ' Source files are being archived');
    }
};

/**
 * Retrieves the files that have been processed from the
 * DB table
 *
 * places the array of processed files into this.processedFiles
 *
 * returns a promise to return an array of already processed files
 */
ProcessFile.prototype.getProcessedFiles = function() {
    var self = this;
    return ProcessedFile.ProcessedFile.find({})
        .exec((err, files) => {
            if (err) {
                this.log.error(err);
            }
            //converts the mongoose array of objects to array of filenames
            var parsedProcessedFiles = Object.keys(files)
                .map((key) => {
                    return files[key].jsonFile;
                });
            self.processedFiles = parsedProcessedFiles;
            return parsedProcessedFiles;
        });
};

/**
 * Generates an array of the files with full path that are in the
 * this.input directory.  It filters out non .json files and directories
 *
 * saves the array of files into this.fsFiles
 *
 * returns promise to return an array of files in the this.input directory
 */
ProcessFile.prototype.getFilesFS = function() {
    var self = this;
    return new Promise((fulfill, reject) => {
        fs.readdir(this.input, (err, files) => {
            var tempFiles;
            if (err) {
                reject(err);
            } else {
                //filter out the directories and non .json files
                tempFiles = files.filter(x => {
                    fs.stat(this.input + x, (err, stats) => {
                        if (err) {
                            this.log.error(err);
                        }
                        if (stats.isDirectory()) {
                            return false;
                        }
                    });
                    if (x.match(/\.json$/)) {
                        return true;
                    }
                    return false;
                });
                this.log.info('Contains ' + files.length +
                    ' files in input directory.');
                this.log.info('Contains ' + tempFiles.length + ' json files.');
                tempFiles = tempFiles.map(x => {
                    return this.input + x;
                });
                self.fsFiles = tempFiles;
                fulfill(tempFiles);
            }
        });
    });
};

/**
 * getDifferenceDbFs returns a promise to return the files
 * that are in the filesystem and not already processed.
 *
 * fsFiles - array of files in the filesystem that may need to be processed
 * processedFiles - array of already processed files from db
 *
 * return fsFiles not in processedFiles
 * places return value in this.filesToProcess
 */
ProcessFile.prototype.getDifferenceDbFs = function(fsFiles, processedFiles) {
    var self = this;
    return new Promise((fulfill) => {
        //removes the fsFiles that are allready processed in processedFiles array
        var filesToProcess = [...fsFiles].filter(x => {
            var inList = (processedFiles.indexOf(x) >= 0);
            return (!inList);
        });
        this.log.info('There are ' + filesToProcess.length +
            ' new files that need to be processed');
        self.filesToProcess = filesToProcess;
        fulfill(filesToProcess);
    });
};

/** getFilesToProcess - wrapper function to get files from FS and remove files
 *  already processed by database.
 *
 *  returns a promise to return an array of files that are new and need to be
 *  processed.
 */
ProcessFile.prototype.getFilesToProcess = function() {
    var self = this;
    return new Promise((fulfill) => {
        self.getProcessedFiles() //get files from DB
            .then((files) => { //get files from FS
                this.log.info('Database contains ' + files.length +
                ' processed files.');
                return this.getFilesFS();
            })
            .then((fsFiles) => { //trims the file list to only new files
                return this.getDifferenceDbFs(fsFiles, this.processedFiles);
            })
            .then((filesToProcess) => {
                fulfill(filesToProcess);
            });
    });
};

/**
 * Application
 */

var p = new ProcessFile(argv);
p.run();
