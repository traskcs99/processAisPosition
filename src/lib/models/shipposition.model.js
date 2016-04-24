'use strict';

import mongoose from 'mongoose';

var ShipPositionSchema = new mongoose.Schema({
    shipname: String,
    destination: String,
    datetime: Date,
    heading: Number,
    position: {
        type: { type: String},
        coordinates: []
    },
    length: Number,
    rot: Number,
    shiptype: Number,
    width: Number,
    ship: {type: mongoose.Schema.Types.ObjectId, ref:'Ship'}
});

export default mongoose.model('ShipPosition', ShipPositionSchema);
