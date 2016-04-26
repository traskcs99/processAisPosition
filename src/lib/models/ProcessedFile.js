'use strict';

var mongoose = require('mongoose');

var ProcessedFileSchema = new mongoose.Schema({
    jsonFile: String
    },
    {collection: 'processed_file'}
);

exports.ProcessedFile = mongoose.model('ProcessedFile', ProcessedFileSchema);
