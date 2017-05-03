'use strict';

var AWS = require("aws-sdk");
var moment = require("moment");

var docClient = new AWS.DynamoDB.DocumentClient();

var latestSumpPumpAlert = null;

function sendSNS(message) {
    var sns = new AWS.SNS();
    var params = {
        Message : message, 
        Subject : 'Sump Pump Water Level Change',
        TopicArn : process.env.SUMP_PUMP_ALERTS_TOPIC
    };
    sns.publish(params, function(err, data) {
        if (err) {
            console.error("Unable to publish message to SNS. Error JSON:", JSON.stringify(err, null, 2));
        }
    });    
}

function writeSumpPumpAlert(alert) {
    var params = {
        TableName : process.env.SUMP_PUMP_ALERTS_TABLE,
        Item : alert
    };

    docClient.put(params, function(err, data) {
        if (err) {
            console.error("Unable to write new sump pump alert. Error JSON:", JSON.stringify(err, null, 2));
        }
    });
}

function processWaterLevel(event) {
    var currentLevel = parseFloat(event['water-level'] / 60);
    var savedLevel = parseFloat(latestSumpPumpAlert['greater-than-level']);
    if (currentLevel > savedLevel + 0.1) {
        // transition to next level - send alert
        latestSumpPumpAlert = {
            'sump-pump' : event['sump-pump'],
            'timestamp-initial' : event['timestamp'],
            'timestamp-latest' : event['timestamp'],
            'greater-than-level' : Math.floor(currentLevel * 10) / 10
        };
        writeSumpPumpAlert(latestSumpPumpAlert);
        sendSNS('Sump pump water level has exceeded ' + (latestSumpPumpAlert['greater-than-level'] * 100) + '%.');
    } else if (currentLevel > savedLevel) {
        // refresh timestamp for this level
        latestSumpPumpAlert['timestamp-latest'] = event['timestamp'];
        writeSumpPumpAlert(latestSumpPumpAlert);
    } else {
        // check to see if it is time to downgrade level
        var now = moment(event['timestamp']);
        var then = moment(latestSumpPumpAlert['timestamp-latest']);
        var hoursSinceLevel = parseFloat(moment.duration(now.diff(then)).asHours());
        if (hoursSinceLevel > 1) {
            sendSNS('Sump pump water level has dropped below ' + (latestSumpPumpAlert['greater-than-level'] * 100) + '%.');
            latestSumpPumpAlert = {
                'sump-pump' : event['sump-pump'],
                'timestamp-initial' : latestSumpPumpAlert['timestamp-latest'],
                'timestamp-latest' : event['timestamp'],
                'greater-than-level' : Math.floor(currentLevel * 10) / 10
            };
            writeSumpPumpAlert(latestSumpPumpAlert);
        }
    }
}

function queryLatestSumpPumpAlert(event) {
    var params = {
        TableName : process.env.SUMP_PUMP_ALERTS_TABLE,
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
        },
        ScanIndexForward : false,
        Limit : 1
    };

    docClient.query(params, function(err, data) {
        if (err) {
            console.error("Unable to query latest sump pump alert. Error:", JSON.stringify(err, null, 2));
        } else if (data.Items.length == 0) {
            // cold start - seed table with initial 'alert'
            var currentLevel = parseFloat(event['water-level'] / 60);
            latestSumpPumpAlert = {
                'sump-pump' : event['sump-pump'],
                'timestamp-initial' : event['timestamp'],
                'timestamp-latest' : event['timestamp'],
                'greater-than-level' : Math.floor(currentLevel * 10) / 10
            };
            writeSumpPumpAlert(latestSumpPumpAlert);
        } else {
            latestSumpPumpAlert = data.Items[0];
            processWaterLevel(event);
        }
    });
}

/**
 * Lambda entry point.
 * @param {Object} event - Sump pump water level data point.
 * @param {string} event.sump-pump - The name of the sump pump being monitored.
 * @param {string} event.timestamp - The timestamp (UTC) of the collected data point.
 * @param {string} event.water-level - The height (cm) of the water level for the sump pump. 
 */
exports.handler = (event, context, callback) => {
    var params = {
        'TableName' : process.env.SUMP_PUMP_WATER_LEVEL_TABLE,
        'Item' : event
    };
    docClient.put(params, function(err, data) {
        if (err) {
            console.error("Unable to write sump pump data. Error JSON:", JSON.stringify(err, null, 2));
        }
    });
    if (null == latestSumpPumpAlert) {
        queryLatestSumpPumpAlert(event);
    } else {
        processWaterLevel(event);
    }
};
