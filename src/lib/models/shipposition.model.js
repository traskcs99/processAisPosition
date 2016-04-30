'use strict';

var mongoose = require('mongoose');

var ShipPositionSchema = new mongoose.Schema({
    ship_id: Number,
    shipname: String,
    destination: String,
    datetime: Date,
    heading: Number,
    position: {
        type: {type: String, default: 'Point'},
        coordinates: [Number]
    },
    length: Number,
    rot: Number,
    shiptype: Number,
    width: Number,
    ship: {type: mongoose.Schema.Types.ObjectId, ref: 'Ship'}
    },{
    collection: 'position'
    }
);

exports.ShipPosition = mongoose.model('ShipPosition', ShipPositionSchema);
