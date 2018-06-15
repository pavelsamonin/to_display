const request = require('request'),
    async = require('async'),
    moment = require('moment'),
    crypto = require('crypto'),
    email = process.env.MAILER_EMAIL_ID || 'auth_email_address@gmail.com';

// load up the currency model
const Currency = require('./app/models/currency');
// load up the user model
const User = require('./app/models/user'),
    Language = require('./app/models/translation'),
    mongooseIntl = require('mongoose-intl');

function parseBody(body, user) {
    if (typeof body === 'string') {
        try {
            let b = JSON.parse(body);
            let addr = [];
            let tr = [];
            if (b.requisites.addresses && b.requisites.addresses.length > 0)
                addr = b.requisites.addresses;
            if (b.transactions.length > 0) {
                tr = b.transactions.map((tx) => {
                    let l, oper, curr;
                    switch (tx.type.toLowerCase()) {
                        case "eth":
                            if (process.env.BLOCKCHAIN_ENVIRONMENT === 'development') {
                                l = "https://rinkeby.etherscan.io/tx/";
                            } else {
                                l = "https://etherscan.io/tx/"
                            }
                            break;
                        case "btc":
                            if (process.env.BLOCKCHAIN_ENVIRONMENT === 'development') {
                                l = "";
                            } else {
                                l = "https://bchain.info/BTC/tx/"
                            }
                            break;
                        case "ltc":
                            if (process.env.BLOCKCHAIN_ENVIRONMENT === 'development') {
                                l = "";
                            } else {
                                l = "https://bchain.info/LTC/tx/"
                            }
                            break;
                        default:
                            break;
                    }
                    switch (tx.txname.toLowerCase()) {
                        case "fund":
                            oper = "Перевод средств";
                            curr = tx.type.toUpperCase();
                            break;
                        case "mint":
                            oper = "Зачисление";
                            curr = tx.symbol.toUpperCase();
                            break;
                        case "calculate":
                            oper = "Просчет";
                            curr = tx.symbol.toUpperCase();
                            break;
                        default:
                            break;
                    }
                    return {
                        guid: tx.guid,
                        hash: tx.hash,
                        txname: oper,
                        assets: curr,
                        link: {
                            url: l + tx.hash,
                            text: "View on Explorer"
                        },
                        value: tx.value,
                        type: tx.type.toUpperCase() || "",
                        timestamp: moment(tx.timestamp, moment.ISO_8601).format("DD.MM.YY HH:mm") || ""
                    }
                })
            }
            return {
                contractStats: b.contractStats,
                requisites: {
                    addresses: addr.filter(d => d.type === 'req'),
                    defaultAddress: b.requisites.defaultCurrency,
                    user: user._doc.local
                },
                transactions: tr,
                tokens: b.tokens
            }
        } catch (e) {
            console.log(e)
        }
    }

}

module.exports = function (app, passport) {

// normal routes ===============================================================

    // show the home page (will also have our login links)
    app.get('/', isLoggedIn, function (req, res) {
        let options = {
            uri: 'http://' + process.env.DEVSTAGING_HOST + ':' + process.env.BLOCKCHAIN_PORT + '/users/pivot/' + req.user._id,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // form: {'user': JSON.stringify(req.user._id)}
        };
        request(options, function (error, response, body) {
            if (error) console.error(error)
            if (!error && response.statusCode === 200) {
                req.user = {
                    ...req.user,
                    currency: {
                        currentCurrency: null
                    }
                }
                res.render('index.ejs', {
                    blockchainExplorer: "https://etherscan.io/tx/",
                    href: "/logout",
                    text: "Logout",
                    currency: JSON.stringify(Currency.getLastValue),
                    user: JSON.stringify(req.user),
                    userInfo: JSON.stringify(parseBody(body, req.user)),
                    defaultPair: JSON.stringify(Currency.getDefaultValue)
                });
            }
        })
    })
    ;

// LANGUAGE SECTION =========================
    app.get('/lang/', isLoggedIn, function (req, res) {
        Language.plugin(mongooseIntl, {languages: ['en', 'de', 'fr'], defaultLanguage: 'en'});

    });


// PROFILE SECTION =========================

    app.get('/profile', isLoggedIn, function (req, res) {

        res.render('profile.ejs', {
            href: "/logout",
            text: "Logout",
            user: req.user
        });
        let options = {
            uri: 'http://' + process.env.DEVSTAGING_HOST + ':' + process.env.BLOCKCHAIN_PORT + '/users/pivot/' + req.user._id,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
        };
        request(options, function (error, response, body) {
            if (error) console.error(error)
            if (!error && response.statusCode === 200) {
                // Print out the response body
                req.user = {
                    ...req.user,
                    currency: {
                        currentCurrency: null
                    }
                }
                res.render('profile.ejs', {
                    currency: JSON.stringify(Currency.getLastValue),
                    user: JSON.stringify(req.user),
                    userInfo: body,
                    defaultPair: JSON.stringify(Currency.getDefaultValue)
                });
            }
        })
    });

// process the ETH wallet
    app.post('/sign_wallet', isLoggedIn, function (req, res) {

        User.findByIdAndUpdate({_id: req.user._id}, {
            'local.wallet': req.body.wallet
        }, {upsert: true, new: true}).exec(function (err, user) {
            if (err) return res.send(500, {error: err});
            let options = {
                uri: 'http://' + process.env.DEVSTAGING_HOST + ':' + process.env.BLOCKCHAIN_PORT + '/users/setEthAddress/' + req.user._id,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                form: {'address': JSON.stringify(user.local.wallet)}
            };
            request(options, function (error, response, body) {
                if (error) console.error(error)
                if (!error && response.statusCode === 200) {
                    res.redirect('/profile');
                }
            })
        });
    });
    app.post('/sign_wallet_form', isLoggedIn, function (req, res) {

        User.findByIdAndUpdate({_id: req.user._id}, {
            'local.wallet': req.body.wallet.toLowerCase()
        }, {upsert: true, new: true}).exec(function (err, user) {
            if (err) return res.send(500, {error: err});
            let options = {
                uri: 'http://' + process.env.DEVSTAGING_HOST + ':' + process.env.BLOCKCHAIN_PORT + '/users/setEthAddress/' + req.user._id,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                form: {'address': user.local.wallet}
            };
            request(options, function (error, response, body) {
                if (error) console.error(error)
                if (!error && response.statusCode === 200) {
                    res.json({"statusCode": 200, "wallet": JSON.parse(body), "user": user.local});
                }
            })
        });
    });

    // CURRENCY SECTION =========================
    app.get('/currency', isLoggedIn, function (req, res) {
        res.json({
            "currency": Currency.getLastValue,
            "defaultPair": Currency.getDefaultValue
        });
    });

    if (process.env.ENVIRONMENT === 'production') {


        app.post('/getTotalTokens', isLoggedIn, function (req, res) {
            let options = {
                uri: 'http://' + process.env.HOST + ':' + process.env.BLOCKCHAIN_PORT + '/bitgo/getTotalTokens',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                form: {'user': JSON.stringify(req.user._id)}
            };
            request(options, function (error, response, body) {
                if (error) console.error(error)
                if (!error && response.statusCode === 200) {
                    res.json({
                        "tokens": body.tokens
                    });
                }
            })
        });

        app.post('/getTokensByUserId', isLoggedIn, function (req, res) {
            let options = {
                uri: 'http://' + process.env.HOST + ':' + process.env.BLOCKCHAIN_PORT + '/bitgo/getTokensByUserId',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                form: {'user': JSON.stringify(req.user._id)}
            };
            request(options, function (error, response, body) {
                if (error) console.error(error)
                if (!error && response.statusCode === 200) {
                    res.json({
                        "userTokens": body.userTokens
                    });
                }
            })
        });

        app.post('/getTxByUserId', isLoggedIn, function (req, res) {
            let options = {
                uri: 'http://' + process.env.HOST + ':' + process.env.BLOCKCHAIN_PORT + '/bitgo/getTxByUserId',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                form: {'user': JSON.stringify(req.user._id)}
            };
            request(options, function (error, response, body) {
                if (error) console.error(error)
                if (!error && response.statusCode === 200) {
                    res.json({
                        "transactions": body.transactions
                    });
                }
            })
        });
    }

// SOCIAL NETWORKS SECTION =========================
    app.get('/social', isLoggedIn, function (req, res) {
        res.render('social.ejs', {
            user: req.user
        });
    });

// LOGOUT ==============================
    app.get('/logout', function (req, res) {
        req.logout();
        res.redirect('/');
    });

// =============================================================================
// AUTHENTICATE (FIRST LOGIN) ==================================================
// =============================================================================

// locally --------------------------------
// DROP USERS ===============================
// show the login form
    app.post('/drop_all_qwe', function (req, res) {
        User.remove({}, function (err) {
                if (err) {
                    console.log(err)
                } else {
                    res.end('success');
                }
            }
        );
    });
// locally -----------------------------
// LOGIN ===============================
// show the login form
    app.get('/login', function (req, res) {
        res.render('login.ejs', {message: req.flash('loginMessage')});
    });

// process the login form
    app.post('/login', passport.authenticate('local-login', {
        successRedirect: '/', // redirect to the secure profile section
        failureRedirect: '/login', // redirect back to the signup page if there is an error
        failureFlash: true // allow flash messages
    }));

// SIGNUP =================================
// process the signup form
    app.route('/signup')
        .get(signup_template)
        .post(signup)

// process the confirm form
    app.route('/confirm_password')
        .get(confirmPassword_template)
        .post(confirmPassword);


// process the recovery form
    app.route('/forgot_password')
        .get(forgotPassword_template)
        .post(forgotPassword);


// process the reset password
    app.route('/reset_password')
        .get(resetPassword_template)
        .post(resetPassword);

// facebook -------------------------------

// send to facebook to do the authentication
    app.get('/auth/facebook', passport.authenticate('facebook', {scope: 'email'}));

// handle the callback after facebook has authenticated the user
    app.get('/auth/facebook/callback',
        passport.authenticate('facebook', {
            successRedirect: '/',
            failureRedirect: '/'
        }));

// twitter --------------------------------

// send to twitter to do the authentication
    app.get('/auth/twitter', passport.authenticate('twitter', {scope: 'email'}));

// handle the callback after twitter has authenticated the user
    app.get('/auth/twitter/callback',
        passport.authenticate('twitter', {
            successRedirect: '/',
            failureRedirect: '/'
        }));


// google ---------------------------------

// send to google to do the authentication
    app.get('/auth/google', passport.authenticate('google', {scope: ['profile', 'email']}));

// the callback after google has authenticated the user
    app.get('/auth/google/callback',
        passport.authenticate('google', {
            successRedirect: '/',
            failureRedirect: '/'
        }));

// =============================================================================
// AUTHORIZE (ALREADY LOGGED IN / CONNECTING OTHER SOCIAL ACCOUNT) =============
// =============================================================================

// locally --------------------------------
    app.get('/connect/local', function (req, res) {
        res.render('connect-local.ejs', {message: req.flash('loginMessage')});
    });
    app.post('/connect/local', passport.authenticate('local-signup', {
        successRedirect: '/', // redirect to the secure profile section
        failureRedirect: '/connect/local', // redirect back to the signup page if there is an error
        failureFlash: true // allow flash messages
    }));

// facebook -------------------------------

// send to facebook to do the authentication
    app.get('/connect/facebook', passport.authorize('facebook', {scope: 'email'}));

// handle the callback after facebook has authorized the user
    app.get('/connect/facebook/callback',
        passport.authorize('facebook', {
            successRedirect: '/',
            failureRedirect: '/'
        }));

// twitter --------------------------------

// send to twitter to do the authentication
    app.get('/connect/twitter', passport.authorize('twitter', {scope: 'email'}));

// handle the callback after twitter has authorized the user
    app.get('/connect/twitter/callback',
        passport.authorize('twitter', {
            successRedirect: '/',
            failureRedirect: '/'
        }));


// google ---------------------------------

// send to google to do the authentication
    app.get('/connect/google', passport.authorize('google', {scope: ['profile', 'email']}));

// the callback after google has authorized the user
    app.get('/connect/google/callback',
        passport.authorize('google', {
            successRedirect: '/',
            failureRedirect: '/'
        }));

// =============================================================================
// UNLINK ACCOUNTS =============================================================
// =============================================================================
// used to unlink accounts. for social accounts, just remove the token
// for local account, remove email and password
// user account will stay active in case they want to reconnect in the future

// local -----------------------------------
    app.get('/unlink/local', isLoggedIn, function (req, res) {
        let user = req.user;
        user.local.email = undefined;
        user.local.password = undefined;
        user.save(function (err) {
            res.redirect('/');
        });
    });

// facebook -------------------------------
    app.get('/unlink/facebook', isLoggedIn, function (req, res) {
        let user = req.user;
        user.facebook.token = undefined;
        user.save(function (err) {
            res.redirect('/');
        });
    });

// twitter --------------------------------
    app.get('/unlink/twitter', isLoggedIn, function (req, res) {
        let user = req.user;
        user.twitter.token = undefined;
        user.save(function (err) {
            res.redirect('/');
        });
    });

// google ---------------------------------
    app.get('/unlink/google', isLoggedIn, function (req, res) {
        let user = req.user;
        user.google.token = undefined;
        user.save(function (err) {
            res.redirect('/');
        });
    });
};

// route middleware to ensure user is logged in
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated())
        return next();

    res.redirect('/login');
}

function signup(req, res) {
    console.log(1)
    async.auto({
        findUser: function (callback) {
            console.log('findUser')
            let email = req.body.email;
            email = email.toLowerCase();
            User.findOne({'local.email': email}, function (err, user) {
                console.log('user ', user)
                console.log('err _user ', err)
                if (err)
                    return callback(err);
                if (user) {
                    return callback(null, req.flash('loginMessage', 'That email is already taken.'));
                } else {
                    let newUser = new User();
                    newUser.local.email = email;
                    newUser.local.state = false;
                    newUser.save(function (err) {
                        console.log('newUser.save newUser', newUser)
                        console.log('newUser.save err', err)
                        if (err)
                            return callback(err);
                        callback(null, newUser);
                    });
                }
            });
        },
        createtoken: function (callback) {
            console.log('createtoken')
            crypto.randomBytes(20, function (err, buffer) {
                console.log('err', err)
                if (err)
                    return callback(err);
                let token = buffer.toString('hex');
                callback(null, token);
            });
        },
        updateUser: ['findUser', 'createtoken', function (results, callback) {
            console.log('updateUser')
            if (results.findUser === 1) {
                return callback(null, null);
            }
            User.findByIdAndUpdate(
                {
                    _id: results.findUser._id
                },
                {
                    'local.confirm_token': results.createtoken
                },
                {
                    upsert: true, new: true
                }
            ).exec(function (err, new_user) {
                callback(null, new_user);
            });
        }],
        subscribe: ['findUser', 'createtoken', function (results, callback) {
            if (results.findUser === 1) {
                return callback(null, null);
            }
            let options = {
                uri: 'http://' + process.env.HOST + ':' + process.env.MAILPORT + '/mail/subscribe',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                form: {
                    "email": results.findUser.local.email
                }
            }
            request(options, function (error, response, body) {
                if (error) return callback(null, JSON.parse(response.body));
                if (!error && response.statusCode === 200) {
                    let data = JSON.parse(response.body);
                    User.findByIdAndUpdate({_id: results.findUser._id}, {
                        'local.mailChimpUserId': data.mailChimpUserId
                    }, {upsert: true, new: true}).exec(function (err, new_user) {
                        callback(null, data);
                    });
                }

            });
        }],
        sendEmail: ['findUser', 'createtoken', function (results, callback) {
            console.log('sendEmail')
            if (results.findUser === 1) {
                return callback(null, null);
            }
            let options = {
                uri: 'http://' + process.env.HOST + ':' + process.env.MAILPORT + '/mail/send',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                form: {
                    data: JSON.stringify({
                        to: results.findUser.local.email,
                        from: email,
                        template: 'confirm-password-email',
                        subject: 'Confirm Your registration!',
                        context: {
                            url: 'http://' + process.env.DEVSTAGING_HOST + ':' + process.env.PORT + '/confirm_password?token=' + results.createtoken,
                            email: results.findUser.local.email.split(' ')[0]
                        }
                    })
                }
            }
            request(options, function (error, response, body) {
                console.log('request')
                console.log('error request ', error)
                if (error) return callback(null, null);
                if (!error && response.statusCode === 200) {
                    let data = JSON.parse(response.body);
                    return callback(null, req.flash(data.message, data.text));
                }
                if (!error && response.statusCode === 500) {
                    let data = JSON.parse(response.body);
                    return callback(null, req.flash(data.message, data.text));
                }
            });
        }]
    }, function (err, results) {
        console.log('results ', results)
        res.render('signup.ejs', {message: req.flash('loginMessage')});
    });
}

function forgotPassword(req, res) {
    async.auto({
        findUser: function (callback) {
            let email = req.body.email;
            email = email.toLowerCase();
            User.findOne({
                'local.email': email
            }).exec(function (err, user) {
                if (err)
                    return callback(err);
                if (user) {
                    return callback(null, user);
                } else {
                    return callback(null, req.flash('loginMessage', 'User not found.'));
                }
            });
        },
        createtoken: function (callback) {
            crypto.randomBytes(20, function (err, buffer) {
                if (err)
                    return callback(err);
                let token = buffer.toString('hex');
                callback(null, token);
            });
        },
        updateUser: ['findUser', 'createtoken', function (results, callback) {
            if (results.findUser === 1) {
                return callback(null, null);
            }
            User.findByIdAndUpdate({_id: results.findUser._id}, {
                'local.reset_password_token': results.createtoken,
                'local.reset_password_expires': Date.now() + 86400000
            }, {upsert: true, new: true}).exec(function (err, new_user) {
                callback(null, new_user);
            });
        }],
        sendEmail: ['findUser', 'createtoken', function (results, callback) {
            if (results.findUser === 1) {
                return callback(null, null);
            }
            let options = {
                uri: 'http://' + process.env.HOST + ':' + process.env.MAILPORT + '/mail/send',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                form: {
                    data: JSON.stringify({
                        to: results.findUser.local.email,
                        from: email,
                        template: 'forgot-password-email',
                        subject: 'Password help has arrived!',
                        context: {
                            url: 'http://' + process.env.DEVSTAGING_HOST + ':' + process.env.PORT + '/reset_password?token=' + results.createtoken,
                            email: results.findUser.local.email.split(' ')[0]
                        }
                    })
                }
            }
            request(options, function (error, response, body) {
                if (error) return callback(null, null);
                if (!error && response.statusCode === 200) {
                    let data = JSON.parse(response.body);
                    return callback(null, req.flash(data.message, data.text));
                }
                if (!error && response.statusCode === 500) {
                    return callback(null, req.flash(response.body.message, response.body.text));
                }
            });
        }]
    }, function (err, results) {
        res.render('forgot-password.ejs', {message: req.flash('loginMessage')});
    });
}

function confirmPassword(req, res) {
    async.waterfall([
        function (done) {
            User.findOne({
                'local.confirm_token': req.body.token
            }).exec(function (err, user) {
                if (!err && user) {
                    if (req.body.password === req.body.verifyPassword) {
                        user.local.password = user.generateHash(req.body.password);
                        user.local.state = true;
                        user.local.confirm_token = undefined;
                        user.save(function (err) {
                            if (err) {
                                return res.status(422).send({
                                    message: err
                                });
                            } else {
                                res.redirect('/login');
                            }
                        });
                    } else {
                        return done(null, false, req.flash('loginMessage', 'Passwords do not match'));
                    }
                } else {
                    return done(null, false, req.flash('loginMessage', 'Confirm token is invalid'));
                }
            });
        }
    ], function (err) {
        if (!err) {
            res.render('confirm.ejs', {message: req.flash('loginMessage')});
        }
    });
}


function signup_template(req, res) {
    res.render('signup.ejs', {message: req.flash('signupMessage')});
}


function confirmPassword_template(req, res) {
    res.render('confirm.ejs', {message: req.flash('signupMessage')});
}

function forgotPassword_template(req, res) {
    res.render('forgot-password.ejs', {message: req.flash('loginMessage')});
}

function resetPassword(req, res, next) {
    async.waterfall([
        function (done) {
            User.findOne({
                'local.reset_password_token': req.body.token,
                'local.reset_password_expires': {
                    $gt: Date.now()
                }
            }).exec(function (err, user) {
                if (!err && user) {
                    if (req.body.newPassword === req.body.verifyPassword) {
                        user.local.password = user.generateHash(req.body.newPassword);
                        user.local.reset_password_token = undefined;
                        user.local.reset_password_expires = undefined;
                        user.save(function (err) {
                            if (err) {
                                return res.status(422).send({
                                    message: err
                                });
                            } else {
                                let options = {
                                    uri: 'http://' + process.env.DEVSTAGING_HOST + ':' + process.env.MAILPORT + '/mail/send',
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    form: {
                                        data: JSON.stringify({
                                            to: user.local.email,
                                            from: email,
                                            template: 'reset-password-email',
                                            subject: 'Password Reset Confirmation',
                                            context: {
                                                url: 'http://' + process.env.DEVSTAGING_HOST + ':' + process.env.PORT + '/login',
                                                email: user.local.email.split(' ')[0]
                                            }
                                        })
                                    }
                                }
                                request(options, function (error, response, body) {
                                    if (error) console.error(error)
                                    if (!error && response.statusCode === 200) {
                                        let data = JSON.parse(response.body);
                                        return done(null, false, req.flash(data.message, data.text));
                                    }
                                    if (!error && response.statusCode === 500) {
                                        return done(null, false, req.flash(response.body.message, response.body.text));
                                    }
                                });
                            }
                        });
                    } else {
                        return done(null, false, req.flash('loginMessage', 'Passwords do not match'));
                    }
                } else {
                    return done(null, false, req.flash('loginMessage', 'Password reset token is invalid or has expired'));
                }
            });
        }
    ], function (err) {
        if (!err) {
            res.render('reset-password.ejs', {message: req.flash('loginMessage')});
        }
    });
}

function resetPassword_template(req, res) {
    res.render('reset-password.ejs', {message: req.flash('loginMessage')});
}

