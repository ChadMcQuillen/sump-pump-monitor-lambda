'use strict';

var AWS = require("aws-sdk");

AWS.config.update({region: 'us-east-1'});

var lambda = new AWS.Lambda();

/**
 *
 * From http://stackoverflow.com/questions/14286671/comparing-two-json-arrays
 *
 * Deep compare of two objects.
 *
 * Note that this does not detect cyclical objects as it should.
 * Need to implement that when this is used in a more general case. It's currently only used
 * in a place that guarantees no cyclical structures.
 *
 * @param {*} x
 * @param {*} y
 * @return {Boolean} Whether the two objects are equivalent, that is,
 *         every property in x is equal to every property in y recursively. Primitives
 *         must be strictly equal, that is "1" and 1, null an undefined and similar objects
 *         are considered different
 */
function equals ( x, y ) {
    // If both x and y are null or undefined and exactly the same
    if ( x === y ) {
        return true;
    }

    // If they are not strictly equal, they both need to be Objects
    if ( ! ( x instanceof Object ) || ! ( y instanceof Object ) ) {
        return false;
    }

    // They must have the exact same prototype chain, the closest we can do is
    // test the constructor.
    if ( x.constructor !== y.constructor ) {
        return false;
    }

    for ( var p in x ) {
        // Inherited properties were tested using x.constructor === y.constructor
        if ( x.hasOwnProperty( p ) ) {
            // Allows comparing x[ p ] and y[ p ] when set to undefined
            if ( ! y.hasOwnProperty( p ) ) {
                return false;
            }

            // If they have the same strict value or identity then they are equal
            if ( x[ p ] === y[ p ] ) {
                continue;
            }

            // Numbers, Strings, Functions, Booleans must be strictly equal
            if ( typeof( x[ p ] ) !== "object" ) {
                return false;
            }

            // Objects and Arrays must be tested recursively
            if ( !equals( x[ p ],  y[ p ] ) ) {
                return false;
            }
        }
    }

    for ( p in y ) {
        // allows x[ p ] to be set to undefined
        if ( y.hasOwnProperty( p ) && ! x.hasOwnProperty( p ) ) {
            return false;
        }
    }
    return true;
}

function verifyAlertsTable() {
    var docClient = new AWS.DynamoDB.DocumentClient();
    var params = {
        TableName : "sump-pump-alerts-stage",
        ProjectionExpression : '#sp, #tsi, #tsl, #gtl',
        KeyConditionExpression : '#sp = :sp',
        ExpressionAttributeNames : {
            '#sp' : 'sump-pump',
            '#tsi' : 'timestamp-initial',
            '#tsl' : 'timestamp-latest',
            '#gtl' : 'greater-than-level'
        },
        ExpressionAttributeValues : {
            ':sp' : 'primary'
        }
    };

    docClient.query(params, function(err, data) {
        if (err) {
            console.log(err);
            process.exit(1);
        } else {
            if (equals(alerts, data.Items)) {
                console.log("SUCCESS");
            } else {
                console.log("Alerts Table does not contain expected values.");
                console.log("Expected:");
                console.log(alerts);
                console.log("Actual:");
                console.log(data.Items);
                process.exit(1);
            }
        }
    });
}

function verifyWaterLevelTable() {
    var docClient = new AWS.DynamoDB.DocumentClient();
    var params = {
        TableName : "sump-pump-water-level-stage",
        ProjectionExpression : '#sp, #ts, #wl',
        KeyConditionExpression : '#sp = :sp',
        ExpressionAttributeNames : {
            '#sp' : 'sump-pump',
            '#ts' : 'timestamp',
            '#wl' : 'water-level'
        },
        ExpressionAttributeValues : {
            ':sp' : 'primary'
        }
    };

    docClient.query(params, function(err, data) {
        if (err) {
            console.log(err);
            process.exit(1);
        } else {
            if (equals(waterLevels, data.Items)) {
                verifyAlertsTable();
            } else {
                console.log("Water Level Table does not contain expected values.");
                console.log("Expected:");
                console.log(waterLevels);
                console.log("Actual:");
                console.log(data.Items);
                process.exit(1);
            }
        }
    });
}

function reportWaterLevel(waterLevel) {
    var params = {
        FunctionName : 'sump-pump-monitor-stage',
        LogType : 'None',
        Payload : JSON.stringify(waterLevel)
    };
    lambda.invoke(params, function(err, data) {
        if (err) {
            console.log(err);
            process.exit(1);
        } else {
            index += 1;
            if (index < waterLevels.length) {
                // Space out writes to avoid rate limits
                setTimeout(function() {
                    reportWaterLevel(waterLevels[index]);
                }, 1000);
            } else {
                verifyWaterLevelTable();
            }
        }
    });
}

var fs = require('fs');

var waterLevels = JSON.parse(fs.readFileSync('tests/water-levels.json'));
var alerts = JSON.parse(fs.readFileSync('tests/alerts.json'));

var index = 0;

reportWaterLevel(waterLevels[index]);
