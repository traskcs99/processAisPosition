#!/usr/bin/env node
var config = require('config');
var fs = require('fs');
var Log = require('./logger.js');
var argv = require('minimist')(process.argv.slice(2));
var mongoose = require('mongoose');
var Progressbar = require('progress');
var targz = require('targz');
var path = require('path');
var ShipPosition = require('./models/shipposition.model.js');
var ProcessedFile = require('./models/ProcessedFile.js');
var ShipIDtodoList = require('./models/shipIDtodoListModel.js');

/**
 * Represents a ProcessFile.
 *
 * @constructor
 * @param {argv} argv
 */
function ProcessFile(argv) {
    this.log = new Log('process-ais-position');
    this.argv = argv;
    this.shipSet = new Set();
    this.completedFiles = new Set();
}

/*
 * run - starts the ProcessFile script
 *
 * responsible for running all the correct functions
 * in order
 */
ProcessFile.prototype.run = function() {
    this.log.info('Program has started.');
    var dbConfig = config.get('processFile.dbConfig');
    this.connectDB(dbConfig.server, dbConfig.dbName)
        .then(() => {
            this.parseCLI();
        }).catch((err) => {
            this.log.error(err);
            this.log.error('Exiting with connection error.');
            process.exit(1);
        });
    //get files from FS that have not been processed into DB
    this.getFilesToProcess()
        .then((filesToProcess) => {
            this.log.info('Processing JSON Files.');
            return this.processFileList(filesToProcess);
        })
        .then(() => {
            this.log.info('Updating ShipTodo Database.');
            return this.addShipSetToDB(p.shipSet);
        })
        .then((ships) => {
            if (this.archive){
                this.log.info('Archiving Processed JSON files');
                return this.doArchive();
            } else {
                return Promise.resolve();
            }
        })
        .then(() => {
            this.log.success('All finished');
            return Promise.resolve();
        })
        .then(() => {
            process.exit();
        }).catch((err) => {
            console.log('test: ' + err);
            console.log(err.stack);
        });
};

ProcessFile.prototype.connectDB = function(server, dataBase) {
    var self = this;
    return new Promise((fulfill, reject) => {
        mongoose.connect(server, dataBase);

        // CONNECTION EVENTS
        // When successfully connected
        mongoose.connection.on('connected', function() {
            self.log.info('Mongoose default connection open to ' +
                server + '/' + dataBase);
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

/** Responsible for parsing the CLI arguments
 *
 * -i or --input is the directory of json files
 *  this is saved in this.input
 *
 * -a or --archive is used to save the json files
 *  into an archive folder
 */
ProcessFile.prototype.parseCLI = function() {
    var pathConfig = config.get('processFile.paths');
    this.log.info('Processing CLI');
    // Use `-i` or `--input` to specify the source directory
    this.input = (this.argv.i || this.argv.input ||
        pathConfig.data).trim();

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
            //converts the mongoose array of model objects to arr of filens
            var parsedProcessedFiles = Object.keys(files)
                .map((key) => {
                    return files[key].jsonFile; //jsonFile is name of DB colu
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
        self.filesPreviouslyProcessed = [...fsFiles].filter(x => {
            var inList = (processedFiles.indexOf(x) >= 0);
            return inList;
        });

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

/** processFile -- responsible for all functions with taking
 * the data inside the file and placing it in the database
 *
 * {string} file -- the json file to process
 * {object} filesPB -- progressbar for tracking the file process
 */
ProcessFile.prototype.processFile = function(file, filesPB) {
    var self = this;

    return self.getPositionDataFromFile(file)
        .then((jsonData) => {
            return self.processAllRows(jsonData);
        })
        .then((rows) => {
            self.completedFiles.add(file);
            filesPB.tick(1);
            return self.addCompletedFileToDB(file);
        })
        .catch((err) => {
            self.log.error('260: ' + err.stack);
        });
};

/** ProcessFileList - wrapper function that is responsible for the
 * sequencing of taking the list of files to process them and
 * parse the rows, add poition data to DB, add processedFile to DB
 * and save completed files to this.completedFiles.
 * {Array} - files to process
 * returns null
 */
ProcessFile.prototype.processFileList = function(files) {
    var self = this;
    var filesPB = new Progressbar('saving positions to DB ' +
        '[:bar] [:current/:total] (:percent) :etas', {
        width: 20,
        complete: '=',
        incomplete: ' ',
        total: files.length}
    );

    function doNextFile() {
        var f = files.shift();
        if (f) {
            return self.processFile(f, filesPB);
        }
    }

    function startChain() {
        return Promise.resolve().then(function next() {
            var f = doNextFile();
            if (f) {
                return f.then(next);
            }else {
                return f;
            }
        });
    }

    var N = 3;
    var k;
    var chains = [];
    for (k = 0; k < N; k += 1) {
        chains.push(startChain());
    }
    return Promise.all(chains);

};
/** getPositionDataFromFile  --opens a position file and returns the row and a datetime object
 *
 * {string} filename
 * returns jsonData object with rows and timestamp
 */
ProcessFile.prototype.getPositionDataFromFile = function(filename) {
    var self = this;
    var jsonData = {};
    return new Promise((fulfill, reject) => {
        fs.readFile(filename, (err, data) => {
            if (err) {
                self.log.error('330: ' + err);
                self.log.error(filename);
                reject(err);
            }
            try { 
            jsonData.rows = JSON.parse(data).data.rows;
            } catch (e){
                console.log(filename);
                reject(e);
            }
            jsonData.timestamp = new Date(Date.parse(filename.slice(40, -6)));
            fulfill(jsonData);
        });
    });
};

/** processPositionRow responsible for processing a single row
 * of position data and saving to the database.  Function also
 * adds the shipID to this.shipSet Set
 *
 * {object} row - one row of jsonData.rows contains the pos data
 * {string} dt - a timestamp string associated with pos data
 *
 * returns a promise of a document containing the daved data
 */
ProcessFile.prototype.processPositionRow = function(row, dt) {
    var position = new ShipPosition.ShipPosition({
        ship_id: row.SHIP_ID,
        shipname: row.SHIPNAME,
        destination: row.DESTINATION,
        datetime: dt.toISOString(),
        heading: row.HEADING,
        position: {
            type: 'Point',
            coordinates: [parseFloat(row.LON), parseFloat(row.LAT)]
        },
        length: (row.LENGTH || 0).toString(),
        rot: (row.ROT || 0).toString(),
        shiptype: row.SHIPTYPE,
        speed: (row.SPEED || 0).toString(),
        width: (row.WIDTH || 0).toString(),
    });
    this.shipSet.add(row.SHIP_ID);
    return position.save();
};

/** processAllRows - responsible for processing all rows in a
 * JSON position file.
 *
 * {object} jsonData - the jsonData from a position file
 * returns a promise to return an array containing the saved docs
 */
ProcessFile.prototype.processAllRows = function(jsonData) {
    var self = this;
    return Promise.all(jsonData.rows.map((row) => {
        return self.processPositionRow(row, jsonData.timestamp);
    }));
};

ProcessFile.prototype.addCompletedFileToDB = function(filename) {
    var pf = new ProcessedFile.ProcessedFile({
        jsonFile: filename
    });
    return pf.save();
};

/**
 * addShipSetToDB - responsible to add this.shipSet to the
 * DB od ships that need to be checked.  It will only add
 * the shipID once.
 *
 * requires the this.shipSet to contain shipIDs
 * returns a promise of an array with ShipIDtodoList models
 */
ProcessFile.prototype.addShipSetToDB = function() {
    var shipPB = new Progressbar('saving ships to DB [:bar]', {
        width: 20,
        complete: '=',
        incomplete: ' ',
        total: this.shipSet.size});
    return Promise.all([...this.shipSet].map((shipID) => {
        shipPB.tick();
        return ShipIDtodoList.ShipIDtodoList
            .findOneAndUpdate({'shipID': shipID},
                {'shipID': shipID}, {'upsert': true, 'new': true})
            .exec();
    }));
};

ProcessFile.prototype.doArchive = function() {
    var self = this;
    var pathConfig = config.get('processFile.paths');
    var destination = pathConfig.archive + 'test.tar.gz';

    //  filenames is only the base of the filename no path
    //  used by targz

    function compressFiles(files, destination) {
        return new Promise((fulfill, reject) => {
            targz.compress({
                src: pathConfig.data,
                dest: destination,
                tar: {
                    entries: files || []
                }
            }, (err) => {
                if (err) {
                    reject(err);
                }
                fulfill();
            });
        });
    }

    function removeArcivedFiles(filenames) {
        return new Promise((fulfill, reject) => {
            filenames.map(x => {
                fs.unlink(x, (err) => {
                    if (err) {
                        reject(err);
                    }
                    fulfill();
                });
            });
        });
    }
    var filenames = self.filesPreviouslyProcessed.concat(
        [...self.completedFiles]).map(x => {
            return path.parse(x).base;
        });

    return compressFiles(filenames, destination)
        .then(() => {
            filenames = self.filesPreviouslyProcessed.concat(
                [...self.completedFiles]);
            return removeArcivedFiles(filenames);
        })
        .catch((err) => {
            self.log.error(err);
        });
};
/**
 * Application
 */

var p = new ProcessFile(argv);
p.run();

//var dbConfig = config.get('processFile.dbConfig');

/*p.parseCLI();*/
//p.connectDB(dbConfig.server, dbConfig.dbName)
    //.then(() => {
        //return p.getFilesToProcess();
    //})
    //.then((files) => {
        //return p.processFileList(files);
    //})
    //.then(() => {
        //return p.addShipSetToDB(p.shipSet);
    //})
    //.then((ships) => {
        //console.log('archiving');
        //return p.doArchive();
    //})
    //.then(() => {
        //process.exit();
    //}).catch((err) => {
        //console.log('test: ' + err);
        //console.log(err.stack);
    /*});*/
