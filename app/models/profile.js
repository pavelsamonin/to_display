// load the things we need
var mongoose = require('mongoose');

// define the schema for our profile model
var profileSchema = mongoose.Schema({

    passportId:  String,
    email: String,
    date: { type: Date, default: Date.now }

});

// create the model for users and expose it to our app
module.exports = mongoose.model('Profile', profileSchema);
