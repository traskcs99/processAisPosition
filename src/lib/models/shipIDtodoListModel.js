'use strict';

var mongoose = require('mongoose');

var ShipIDtodoListSchema = new mongoose.Schema({
    shipID: 'number'
}, {
    collection: 'ship_i_dtodo_list'
});

exports.ShipIDtodoList = mongoose.model('ShipIDtodoList', ShipIDtodoListSchema);
