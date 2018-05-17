/* Class imports */
var crypto = require('crypto');
var async = require('async');
var DB = require('../service/db/MongodbService');

/* Class Static Contants */
var SALT_LENGTH = 64; // Length of the salt, in bytes
var TOKEN_LENGTH = 64;
var HASH_LENGTH = 64; // Length of the hash, in bytes
var HASH_ITERATIONS = 1000; // Number of pbkdf2 iterations

/*
 * Options:
 * - hostname: The MongoDB server hostname. Default: 'localhost'
 * - port: The MongoDB server port. Default: 27017
 * - database: The MongoDB database. Default: 'user_management'
 * - tokenExpiration: The amount of time, in hours, that a token is valid for. Default is 168 (a week).
 */
    
module.exports = function() {
    var options = global.userDBOptions || {};

    var tokenExpiration = 24 * 7;
    if (typeof options.tokenExpiration == 'number') {
        if (options.tokenExpiration > 0 && options.tokenExpiration < 8760) {
            tokenExpiration = options.tokenExpiration;
        } else {
            console.warn('Token Expiration must be between 1 hour and 8760 hours (1 year). Using the default of 168 (a week)');
        }
    } else if (typeof options.tokenExpiration != 'undefined') {
        console.warn('Token Expiration must be a number. Using the default of 168 (a week)');
    }
    tokenExpiration *= 1000 * 60 * 60;

    var loaded = false;
    var db = new DB(options);
    var COLLECTION = 'users';
    var errorMessage;

    function generateSalt(cb) {
        crypto.randomBytes(SALT_LENGTH, cb);
    }

    function generateToken(cb) {
        crypto.randomBytes(TOKEN_LENGTH, cb);
    }

    function hash(data, salt, cb) {
        crypto.pbkdf2(data, salt, HASH_ITERATIONS, HASH_LENGTH, 'sha512', function(err, hash) {
            if (err) {
                cb(err);
                return;
            }
            cb(null, {
                salt: salt,
                hash: hash
            });
        });
    }

    function saltAndHash(data, cb) {
        generateSalt(function(err, salt) {
            if (err) {
                cb(err);
                return;
            }
            hash(data, salt, cb);
        });
    }

    this.getErrorMessage = function getErrorMessage() {
        return errorMessage;
    };

    this.load = function load(cb) {
        if (loaded) {
            cb(null);
        } else {
            db.connect(function(err) {
                if (err) {
                    cb(err);
                    return;
                }
                db.loadCollection(COLLECTION, function(err) {
                    if (err) {
                        cb(err);
                        return;
                    }
                    loaded = true;
                    cb(null);
                });
            });
        }
    };

    this.close = function close(cb) {
        db.disconnect(cb);
        loaded = false;
    };

    this.getUserList = function getUserList(cb) {
        if (!loaded) {
            throw new Error('Cannot call "userExists" on unloaded user management object');
        }
        db.findAll(COLLECTION, function(err, items) {
            if (err) {
                cb(err);
                return;
            }
            cb(null, (items || []).map(function(item) {
                return item.username;
            }));
        });
    };
    
    this.emailExists = function emailExists(email, cb) {
        if (!loaded) {
            throw new Error('Cannot call "emailExists" on unloaded user management object');
        }
        db.find(COLLECTION, {
            email: email
        }, function(err, item) {
            if (err) {
                cb(err);
                return;
            }
            cb(null, !!item);
        });
    };
    
    this.userFromUpdatePasswordTokenExists = function userFromUpdatePasswordTokenExists(token, cb){
        if (!loaded) {
            throw new Error('Cannot call "userFromUpdatePasswordTokenExists" on unloaded user management object');
        }
        db.find(COLLECTION, {
            'extras.updatePasswordToken': token
        }, function(err, item) {
            if (err) {
                cb(err);
                return;
            }
            cb(null, !!item);
        });
    };
    
    this.userFromEmailConfirmationCodeExists = function userFromEmailConfirmationCodeExists(token, cb){
        if (!loaded) {
            throw new Error('Cannot call "userFromEmailConfirmationCodeExists" on unloaded user management object');
        }
        db.find(COLLECTION, {
            'extras.emailConfirmationCode': token
        }, function(err, item) {
            if (err) {
                cb(err);
                return;
            }
            cb(null, !!item);
        });
    }

    this.userExists = function userExists(username, cb) {
        if (!loaded) {
            throw new Error('Cannot call "userExists" on unloaded user management object');
        }
        db.find(COLLECTION, {
            username: username
        }, function(err, item) {
            if (err) {
                cb(err);
                return;
            }
            cb(null, !!item);
        });
    };

    this.createUser = function createUser(username, email, password, extras, cb) {
        var that = this;
        if (!loaded) {
            throw new Error('Cannot call "createUser" on unloaded user management object');
        }
        that.userExists(username, function(err, exists) {
            if (err) {
                cb(err);
                return;
            } else if (exists) {
                cb('User already exists');
                return;
            }
            that.emailExists(email, function(err, exists) {
              if (err) {
                  cb(err);
                  return;
              } else if (exists) {
                  cb('Email already exists');
                  return;
              }
              saltAndHash(password, function(err, results) {
                  if (err) {
                      cb(err);
                      return;
                  }
                  db.create(COLLECTION, {
                      username: username,
                      email: email,
                      password: results.hash.toString('base64'),
                      passwordSalt: results.salt.toString('base64'),
                      extras: extras,
                      token: null,
                      tokenExpires: null
                  }, cb);
                
              });
            });
        });
    };

    this.removeUser = function removeUser(email, cb) {
        if (!loaded) {
            throw new Error('Cannot call "removeUser" on unloaded user management object');
        }
        db.delete(COLLECTION, {
            email: email
        }, function(err) {
            cb(err);
        });
    };
    
    this.isPasswordValid = function isPasswordValid(email, password, cb) {
        if (!loaded) {
            throw new Error('Cannot call "isPasswordVAlid" on unloaded user management object');
        }
        var SUPPRESS = '#@suppress callback';
        var item;
        async.series([

            // Make sure the user exists
            function(next) {
                this.emailExists(email, function(err, exists) {
                    if (err) {
                        next(err);
                    } else if (!exists) {
                        cb(null, {
                            emailExists: false,
                            passwordsMatch: null
                        });
                        next(SUPPRESS);
                    } else {
                        next();
                    }
                });
            }.bind(this),

            // Look up the user
            function(next) {
                db.find(COLLECTION, {
                    email: email
                }, function(err, i) {
                    item = i;
                    next(err);
                });
            }.bind(this),

            // Salt and hash the password, and check it against the DB. We do these two operations in one step to avoid having to
            // cache the hashed salt and password anymore than we have to
            function(next) {
                hash(password, new Buffer(item.passwordSalt, 'base64'), function(err, hashedPassword) {
                    if (err) {
                        next(err);
                    } else if (item.password != hashedPassword.hash.toString('base64')) {
                        cb(null, {
                            emailExists: true,
                            passwordsMatch: false,
                            token: null
                        });
                        next(SUPPRESS);
                    } else {
                        cb(null, {
                            emailExists: true,
                            passwordsMatch: true
                        });
                        next(SUPPRESS);
                    }
                });
            }.bind(this)
        ], function(err, result) {
            if (err != SUPPRESS) {
                cb(err || null, result);
            }
        });
    };

    this.authenticateUser = function authenticateUser(email, password, cb) {
        if (!loaded) {
            throw new Error('Cannot call "authenticateUser" on unloaded user management object');
        }
        var SUPPRESS = '#@suppress callback';
        var item;
        async.series([

            // Make sure the user exists
            function(next) {
                this.emailExists(email, function(err, exists) {
                    if (err) {
                        next(err);
                    } else if (!exists) {
                        cb(null, {
                            emailExists: false,
                            passwordsMatch: null,
                            token: null
                        });
                        next(SUPPRESS);
                    } else {
                        next();
                    }
                });
            }.bind(this),

            // Look up the user
            function(next) {
                db.find(COLLECTION, {
                    email: email
                }, function(err, i) {
                    item = i;
                    next(err);
                });
            }.bind(this),

            // Salt and hash the password, and check it against the DB. We do these two operations in one step to avoid having to
            // cache the hashed salt and password anymore than we have to
            function(next) {
                hash(password, new Buffer(item.passwordSalt, 'base64'), function(err, hashedPassword) {
                    if (err) {
                        next(err);
                    } else if (item.password != hashedPassword.hash.toString('base64')) {
                        cb(null, {
                            emailExists: true,
                            passwordsMatch: false,
                            token: null
                        });
                        next(SUPPRESS);
                    } else {
                        next();
                    }
                });
            }.bind(this),

            // Generate the token and store it to the database
            function(next) {
                generateToken(function(err, token) {
                    if (err) {
                        next(err);
                        return;
                    }
                    token = token.toString('base64');
                    db.update(COLLECTION, {
                        email: email
                    }, {
                        token: token,
                        tokenExpires: Date.now() + tokenExpiration
                    }, function(err) {
                        if (err) {
                            next(err);
                            return;
                        }
                        cb(null, {
                            userExists: true,
                            passwordsMatch: true,
                            token: token
                        });
                        next(SUPPRESS);
                    });
                });
            }.bind(this),
        ], function(err, result) {
            if (err != SUPPRESS) {
                cb(err || null, result);
            }
        });
    };

    this.expireToken = function expireToken(token, cb) {
        db.update(COLLECTION, {
            token: token
        }, {
            token: null,
            tokenExpires: null
        }, function(err) {
            cb(err);
        });
    };

    this.isTokenValid = function isTokenValid(token, cb) {
        if (!loaded) {
            throw new Error('Cannot call "isTokenValid" on unloaded user management object');
        }
        db.find(COLLECTION, {
            token: token
        }, function(err, item) {
            if (err) {
                cb(err);
                return;
            }
            cb(null, !!item && item.tokenExpires >= Date.now());
        });
    };

    this.getUsernameForToken = function getUsernameForToken(token, cb) {
        if (!loaded) {
            throw new Error('Cannot call "getUsernameForToken" on unloaded user management object');
        }
        db.find(COLLECTION, {
            token: token
        }, function(err, item) {
            if (err) {
                cb(err);
                return;
            }
            cb(null, item && item.username);
        });
    };

    this.getTokenForUsername = function getTokenForUsername(username, cb) {
        if (!loaded) {
            throw new Error('Cannot call "getTokenForUsername" on unloaded user management object');
        }
        db.find(COLLECTION, {
            username: username
        }, function(err, item) {
            if (err) {
                cb(err);
                return;
            }
            cb(null, item && item.token);
        });
    };
    
    this.getTokenForEmail = function getTokenForEmail(email, cb) {
        if (!loaded) {
            throw new Error('Cannot call "getTokenForEmail" on unloaded user management object');
        }
        db.find(COLLECTION, {
            email: email
        }, function(err, item) {
            if (err) {
                cb(err);
                return;
            }
            cb(null, item && item.token);
        });
    };
    
    function getUser(filter, cb) {
        if (!loaded) {
            throw new Error('Cannot call "getUser" on unloaded user management object');
        }
        db.find(COLLECTION, filter, function(err, item) {
            if (err) {
                cb(err);
                return;
            }
            var user = new Object();
            user.username = item.username;
            user.email = item.email;
            user.extras = item.extras;
            cb(null, user);
        });
    }
    
    this.getUserForEmail = function getExtrasForUsername(email, cb) {
        getUser({
            email: email
        }, cb);
    };

    this.getUserForToken = function getExtrasForToken(token, cb) {
        getUser({
            token: token
        }, cb);
    };
    
    this.getUserForUpdatePasswordToken = function getUserForUpdatePasswordToken(token, cb){
        getUser({
            'extras.updatePasswordToken': token
        }, cb);
    };
    
    this.getUserForEmailConfirmationCode = function getUserForEmailConfirmationCode(token, cb){
        getUser({
            'extras.emailConfirmationCode': token
        }, cb);
    };
    
    this.getUserForUsername = function getExtrasForToken(username, cb) {
        getUser({
            username: username
        }, cb);
    };

    function getExtras(filter, cb) {
        if (!loaded) {
            throw new Error('Cannot call "getExtrasForUsername" on unloaded user management object');
        }
        db.find(COLLECTION, filter, function(err, item) {
            if (err) {
                console.log(err)
                cb(err);
                return;
            }
            cb(null, item && item.extras);
        });
    }
    
    /*var getExtras  = function(filter, cb) {
        db.connect(function(err) {
            if (err) {
                cb(err);
                return;
            }
            db.loadCollection(COLLECTION, function(err) {
                if (err) {
                    cb(err);
                    db.disconnect()
                    return;
                }
                db.find(COLLECTION, filter, function(err, item) {
                    if (err) {
                        cb(err);
                        db.disconnect()
                        return;
                    }
                    cb(null, item && item.extras);
                    db.disconnect()
                });
                
            });
        });
    };*/
    
    this.getExtrasForUsername = function getExtrasForUsername(username, cb) {
        getExtras({
            username: username
        }, cb);
    };
    
    this.getExtrasForEmail = function getExtrasForUsername(email, cb) {
        getExtras({
            email: email
        }, cb);
    };

    this.getExtrasForToken = function getExtrasForToken(token, cb) {
        getExtras({
            token: token
        }, cb);
    };

    function setExtras(filter, value, cb) {
        if (!loaded) {
            throw new Error('Cannot call "setExtrasForUsername" on unloaded user management object');
        }
        db.update(COLLECTION, filter, {
            extras: value
        }, cb);
        
    }
    
    this.addExtras = function(filter, values, cb) {
        if (!loaded) {
            throw new Error('Cannot call "setExtrasForUsername" on unloaded user management object');
        }
        db.find(COLLECTION, filter, function(err, item) {
            if (err) {
                cb(err);
                return;
            }
            for(var index in values){
                item.extras[index] = values[index] 
            }
            db.update(COLLECTION, filter, {
                extras: item.extras
            }, function(err){
                if(err){
                    cb(err);
                    return;
                }
                cb(null);
                return;
            });
        });
    }

    this.setExtrasForUsername = function setExtrasForUsername(username, extras, cb) {
        setExtras({
            username: username
        }, extras, cb);
    };
    
    this.setExtrasForEmail = function setExtrasForUsername(email, extras, cb) {
        setExtras({
            email: email
        }, extras, cb);
    };

    this.setExtrasForToken = function setExtrasForToken(token, extras, cb) {
        setExtras({
            token: token
        }, extras, cb);
    };
    
    this.changeUsername = function changeUsername(oldUsername, newUsername, cb){
        if (!loaded) {
            throw new Error('Cannot call "changeEmail" on unloaded user management object');
        }
        async.series([
            function(next) {
                this.userExists(oldUsername, function(err, exists) {
                    if (err) {
                        next(err);
                    } else if (!exists) {
                        next('Invalid email');
                    } else {
                        next();
                    }
                });
            }.bind(this),
            
            function(next) {
                db.update(COLLECTION, {
                    username: oldUsername
                }, {
                    username: newUsername
                }, next);
            }.bind(this)
        ], function(err) {
            cb(err || null);
        });
    }
    
    this.changeEmail = function changeEmail(oldEmail, newEmail, emailConfirmationCode, cb){
        if (!loaded) {
            throw new Error('Cannot call "changeEmail" on unloaded user management object');
        }
        var userToUpdate;
        async.series([
            function(next) {
                this.emailExists(oldEmail, function(err, exists) {
                    if (err) {
                        next(err);
                    } else if (!exists) {
                        next('Invalid email');
                    } else {
                        next();
                    }
                });
            }.bind(this),
            
            function(next) {
                this.getUserForEmail(oldEmail, function(err, user) {
                    if (err) {
                        next(err);
                    } else if (!user) {
                        next('Invalid email');
                    } else {
                        userToUpdate = user;
                        next();
                    }
                });
            }.bind(this),

            function(next) {
                var newExtrasForEmailUpdate = userToUpdate.extras;
                newExtrasForEmailUpdate.emailConfirmationCode = emailConfirmationCode;
                newExtrasForEmailUpdate.emailConfirmed = false;
                db.update(COLLECTION, {
                    email: oldEmail
                }, {
                    email: newEmail,
                    extras : newExtrasForEmailUpdate
                }, next);
            }.bind(this)
        ], function(err) {
            cb(err || null);
        });
    }

    this.changePassword = function changePassword(token, oldPassword, newPassword, cb) {
        if (!loaded) {
            throw new Error('Cannot call "changePassword" on unloaded user management object');
        }
        var email;
        var newToken;
        async.series([

            // Validate the token
            function(next) {
                this.isTokenValid(token, function(err, valid) {
                    if (err) {
                        next(err);
                    } else if (!valid) {
                        next('Invalid token');
                    } else {
                        next();
                    }
                });
            }.bind(this),

            // Fetch the username
            function(next) {
                this.getUserForToken(token, function(err, user) {
                    if (err) {
                        next(err);
                    } else if (!user) {
                        next('Invalid token');
                    } else {
                        email = user.email;
                        next();
                    }
                });
            }.bind(this),

            // Validate the old password by doing a quick auth
            function(next) {
                this.isPasswordValid(email, oldPassword, function(err, result) {
                    if (err) {
                        next(err);
                    } else if (!result.emailExists) {
                        next('Internal error: could not look up email');
                    } else if (!result.passwordsMatch) {
                        next('Invalid password');
                    } else {
                        next();
                    }
                });
            }.bind(this),

            // Salt and hash the password, and store it in the DB. We do these two operations in one step to avoid having to
            // cache the hashed salt and password anymore than we have to
            function(next) {
                saltAndHash(newPassword, function(err, results) {
                    if (err) {
                        next(err);
                        return;
                    }
                    db.update(COLLECTION, {
                        email: email
                    }, {
                        password: results.hash.toString('base64'),
                        passwordSalt: results.salt.toString('base64'),
                    }, next);
                });
            }.bind(this)
        ], function(err) {
            cb(err || null);
        });
    };
    
    /*
    this.resetPassword = function resetPassword(username, cb) {
        if (!loaded) {
            throw new Error('Cannot call "userExists" on unloaded user management object');
        }
        crypto.randomBytes(8, function(err, newPassword) {
            if (err) {
                cb(err);
                return;
            }
            newPassword = newPassword.toString('base64');
            saltAndHash(newPassword, function(err, results) {
                if (err) {
                    cb(err);
                    return;
                }
                db.update(COLLECTION, {
                    username: username
                }, {
                    password: results.hash.toString('base64'),
                    passwordSalt: results.salt.toString('base64'),
                    token: null,
                    tokenExpires: null
                }, function(err) {
                    if (err) {
                        cb(err);
                        return;
                    }
                    cb(null, newPassword);
                });
            });
        });
    };*/
    
    this.resetPassword = function resetPassword(email, newPassword,cb) {
        if (!loaded) {
            throw new Error('Cannot call "userExists" on unloaded user management object');
        }

        saltAndHash(newPassword, function(err, results) {
            if (err) {
                cb(err);
                return;
            }
            db.update(COLLECTION, {
                email: email
            }, {
                password: results.hash.toString('base64'),
                passwordSalt: results.salt.toString('base64'),
                token: null,
                tokenExpires: null
            }, function(err) {
                if (err) {
                    cb(err);
                    return;
                }
                cb(null, newPassword);
                return;
            });
        });

    };

    Object.defineProperty(this, '_resetForTests', {
        value: function(cb) {
            db.dropCollection(COLLECTION, cb);
        }
    });
};