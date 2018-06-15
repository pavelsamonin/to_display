const config = require('./config'),
    express = require('express'),
    async = require('async'),
    request = require('request'),
    moment = require('moment'),
    server = express(),
    router = express.Router(),
    knex = require('knex')({
        client: config.knexClient,
        connection: config.knexConnection,
        pool: config.knexPool,
        migrations: {
            tableName: 'knex_migrations'
        }
    })


server.set('view engine', 'ejs')


let interval = 60 * 1000
if (process.env.ENVIRONMENT === 'production') {
    interval = 60 * 60 * 1000
}

startService()

function startService() {
    getCurrency()
    setInterval(getCurrency, interval)
}

function getCurrency() {
    async.parallel([
        function (callback) {
            request('https://api.exmo.com/v1/ticker/', function (error, response, body) {
                if (error) return callback(error)
                if (response.statusCode === 200) {
                    let data = [];
                    let resultLTC_USD = JSON.parse(body).LTC_USD
                    data.push({
                        buy_price: resultLTC_USD.buy_price,
                        sell_price: resultLTC_USD.sell_price,
                        rialto: config.configRialtos.exmo,
                        pair: config.configPairs.LTC_USD
                    })
                    let resultBTC_USD = JSON.parse(body).BTC_USD
                    data.push({
                        buy_price: resultBTC_USD.buy_price,
                        sell_price: resultBTC_USD.sell_price,
                        rialto: config.configRialtos.exmo,
                        pair: config.configPairs.BTC_USD
                    })
                    let resultETH_USD = JSON.parse(body).ETH_USD
                    data.push({
                        buy_price: resultETH_USD.buy_price,
                        sell_price: resultETH_USD.sell_price,
                        rialto: config.configRialtos.exmo,
                        pair: config.configPairs.ETH_USD
                    })
                    callback(null, data)
                } else {
                    callback(null, null)
                }
            })
        },
        function (callback) {
            request('https://api.kraken.com/0/public/Ticker?pair=LTCUSD', function (error, response, body) {
                if (error) return callback(error)
                if (response.statusCode === 200) {
                    let result = JSON.parse(body).result.XLTCZUSD
                    let data = {
                        buy_price: result.a[0],
                        sell_price: result.b[0],
                        rialto: config.configRialtos.kraken,
                        pair: config.configPairs.LTCUSD
                    }
                    callback(null, data)
                } else {
                    callback(null, null)
                }
            })
        },
        function (callback) {
            request('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', function (error, response, body) {
                if (error) return callback(error)
                if (response.statusCode === 200) {
                    let result = JSON.parse(body).result.XXBTZUSD
                    let data = {
                        buy_price: result.a[0],
                        sell_price: result.b[0],
                        rialto: config.configRialtos.kraken,
                        pair: config.configPairs.XBTUSD
                    }
                    callback(null, data)
                } else {
                    callback(null, null)
                }
            })
        },
        function (callback) {
            request('https://api.kraken.com/0/public/Ticker?pair=ETHUSD', function (error, response, body) {
                if (error) return callback(error)
                if (response.statusCode === 200) {
                    let result = JSON.parse(body).result.XETHZUSD
                    let data = {
                        buy_price: result.a[0],
                        sell_price: result.b[0],
                        rialto: config.configRialtos.kraken,
                        pair: config.configPairs.ETHUSD
                    }
                    callback(null, data)
                } else {
                    callback(null, null)
                }
            })
        },
    ], function (err, results) {
        if (err) {
            console.log(err)
        }
        let concatResults = [].concat(...results)
        insertData(concatResults)
    })
}

function insertData(results) {
    if (process.env.ENVIRONMENT === 'development') {
        console.log(results)
    }
    async.auto({
            insertRialtos: function (callback) {
                insertArray = []
                results.forEach(function (item, i, results) {
                    if (item !== null) {
                        let buyPrice = parseFloat(item.buy_price).toFixed(8) * 1
                        let sellPrice = parseFloat(item.sell_price).toFixed(8) * 1
                        let avPrice = parseFloat((buyPrice + sellPrice) / 2).toFixed(8) * 1
                        insertArray.push({
                            'rialto': item.rialto,
                            'pair': item.pair,
                            'av_price': avPrice,
                            'buy_price': buyPrice,
                            'sell_price': sellPrice
                        })
                    }
                })
                knex.batchInsert('currency', insertArray, 20)
                    .then(() => {
                            callback(null)
                        }
                    )
                    .catch(
                        (error) => {
                            console.log(error)
                            callback(null)
                        }
                    )
            },
            insertFlat: ['insertRialtos', function (results, callback) {
                knex.column(['name', 'id'])
                    .avg('av_price as value')
                    .from(function () {
                        this.select(['t3.custom_alias as name', 't3.id as id', 'currency.pair', 'currency.av_price'])
                            .from('currency')
                            .as('t1')
                            .join(
                                knex.select('rialto as t2_rialto')
                                    .from('currency')
                                    .as('t2')
                                    .max('date as m_date')
                                    .groupBy('rialto'),
                                function () {
                                    this.on('date', '=', 't2.m_date')
                                        .andOn('rialto', '=', 't2_rialto')
                                }
                            )
                            .join(
                                knex.select('*')
                                    .from('pairs')
                                    .as('t3'),
                                function () {
                                    this.on('pair', '=', 't3.id')
                                }
                            )
                    })
                    .groupBy('pair', 'id', 'name')
                    .then((values) => {
                        if (!values.length) return callback(null)

                        knex.batchInsert('flat_currency', values, 20)
                            .then(() => {
                                    callback(null)
                                }
                            )
                            .catch(
                                (error) => {
                                    console.log(error)
                                    callback(null)
                                }
                            )
                    })
                    .catch(
                        (error) => {
                            console.log(error)
                            callback(null)
                        })
                    .finally(() => {
                    })
            }]
        }, function (err, results) {
            if (err)
                console.log(err)
        }
    )
}

server.get('/poloniex/currency', (req, res) => {
    const rp = require('request-promise')
    rp('https://poloniex.com/public?command=returnTicker').then(body => {
        let result = JSON.parse(body).USDT_ETH
        let data = {
            buy_price: result.lowestAsk,
            sell_price: result.highestBid,
        }
        res.send(data)
    }).catch(err => {
        'use strict'
        console.log(err)
    })
})

server.use(express.static('public'))

server.post('/pairs', function (req, res) {
    knex.select('*')
        .from('pairs')
        .then(function (values) {
            res.json({
                message: 'hooray! here you got pairs!',
                data: values
            })
        })
        .catch(function (err) {
            console.log(err)
        })
        .finally(function () {
            // knex.destroy()
        })
})
server.post('/lastcurrency', function (req, res) {
    knex.column(['name', 'id'])
        .avg('av_price as value')
        .from(function () {
            this.select(['t3.custom_alias as name', 't3.id as id', 'currency.pair', 'currency.av_price'])
                .from('currency')
                .as('t1')
                .join(
                    knex.select('rialto as t2_rialto')
                        .from('currency')
                        .as('t2')
                        .max('date as m_date')
                        .groupBy('rialto'),
                    function () {
                        this.on('date', '=', 't2.m_date')
                            .andOn('rialto', '=', 't2_rialto')
                    }
                )
                .join(
                    knex.select('*')
                        .from('pairs')
                        .as('t3'),
                    function () {
                        this.on('pair', '=', 't3.id')
                    }
                )
        })
        .groupBy('pair', 'id', 'name')
        .then(function (values) {
            res.json({
                message: 'hooray! here you got lastcurrency!',
                data: values
            })
        })

        .catch(function (err) {
            console.log(err)
        })
        .finally(function () {
            // knex.destroy()
        })
})
server.post('/currency/:date', function (req, res) {
    if (!moment(req.params.date, 'YYYY-MM-DD HH:mm:ss', true).isValid()) {
        return res.json({'error': true, 'message': 'use  YYYY-MM-DD HH:mm:ss format'})
    }
    knex.raw('select date, flat_currency.id, name, value as rate from flat_currency join (select max(date) as md, id from flat_currency where date<=\'' + req.params.date + '\' group by id) as m on m.id=flat_currency.id and m.md=flat_currency.date')
        .on('query', (d) => {
            // console.log(d)
        })
        .then(function (rows) {
            res.json({
                message: 'date: ' + req.params.date,
                data: rows.rows
            })
        })
        .catch(function (err) {
            console.log(err)
        })
        .finally(function () {
            //  knex.destroy()
        })
})

server.use('/api', router)

server.listen(config.port, (req, res) => {
    console.log('Server listening on port ', config.port)
})
