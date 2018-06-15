const moment = require('moment')
const async = require("async")
const axios = require("axios")
// const config = require('../configFile');

class CoinLib {

    constructor(params) {
        this.type = params.type;
        this.insight_api_host = params.insight_api_host ;
    }

    /**
     * fills db with fake accounts
     * */
    fillFakeAddresses() {
        const th = this;
        let a = [];
        let i = 0;
        while (i < 100) {
            a.push({
                address: parseInt(Math.random() * 999999),
                type: th.type,
                watch: true
            });
            ++i;
        }
        knex.batchInsert('accounts', a, 30)
            .then(() => {
                console.log('ok')
            })
    }

    /**
     * creates queue of priority for watched addresses
     * */
    reorderPriorityAccounts(callback) {
        const th = this;
        const accountslimit = parseInt(process.env.bitcoinaccountslimit);
        getAccountsPortion(0, (err, res) => {
            if (err) return callback(err);
            if (!res || !res.length) return callback('no accounts results');
            async.parallelLimit(res.map((r, i) => {
                return (callback) => {
                    updatePriorities(i, r, callback)
                }
            }), 5, (err, results) => {

                callback(err, results)
            })
        });

        /**
         * Internal recursive function for accounts gathering
         * */
        function getAccountsPortion(offset, callback) {
            let results = [];
            return knex('accounts')
                .select('guid', 'address')
                .where('watch', true)
                .andWhere('type', th.type)
                .orderBy('address')
                .offset(offset)
                .limit(accountslimit)
                .then((res) => {
                    if (res.length > 0)
                        results = [...results, res.map(r => r.address)];
                    if (res.length < accountslimit) return callback(null, results)
                    getAccountsPortion(offset + accountslimit, (err, res) => {
                        if (err) return callback(err);
                        results = [...results, ...res];
                        callback(null, results);
                    })
                })
                .catch(err => callback(err))
        }

        /**
         * Internal function for accounts priorities update
         * */
        function updatePriorities(priority, addresses, callback) {
            const th = this;
            if ((!priority && priority !== 0)) return callback('no priority to update')
            if (!addresses || !addresses.length) return callback('no addresses')
            const addressesString = '(\'' + addresses.join('\',\'') + '\')';
            knex.raw('UPDATE accounts set priority = ' + parseInt(priority) + ' ' +
                ' where address in ' + addressesString)
                .then((res) => {
                    callback(null, true)
                })
                .catch(err => callback(err))
        }
    }

    /**
     * Get priority corresponding to current iterator value
     * */
    getPriorityNumberByIterator(i, callback) {
        this.getMaxPriorityofAccounts((err, res) => {
            if (err) return callback(err);
            if (res === 0) return callback(null, res)
            callback(null, i % res)
        })
    }

    /**
     * Get max priority in table
     * */
    getMaxPriorityofAccounts(callback) {
        const th = this;
        knex('accounts')
            .select(knex.raw('MAX(priority) as maxpriority'))
            .where('type', th.type)
            .andWhere('watch', true)
            // .on('query', cb => console.log(cb))
            .then((r) => {
                const err = r[0] && (r[0].maxpriority || r[0].maxpriority === 0) ? null : 'no priorities have been set';
                if (err) return callback(err);
                callback(null, r[0].maxpriority);
            })
            .catch(err => callback(err))
    }


    /**
     * Priority : Batch number
     * makes get request to insight api and retrieves result of txs  for addresses Array
     * triggers callback with err , res. if no err -> res = Array of tx
     * */
    getTxsByPriority(priority, callback) {
        const th = this;
        let items = [];
        let addressList;
        knex.select('address').from('accounts').where('priority', priority).andWhere('type', th.type)
            .then((result) => {
                let addressArr = result.map(item => item['address']);
                addressList = addressArr.join();
                getTxs(0, parseInt(process.env.bitcointxsOffset), (err, res) => {
                    if (err) return callback(err, null);
                    let txsArr = [];
                    if (res.length) {
                        res.forEach((tx, i, arr) => {
                            tx.vin.map((item) => {
                                let index = addressArr.indexOf(item.addr)
                                if (index > -1) {
                                    txsArr.push({
                                        'hash': tx.txid + item.n,
                                        'blockNumber': tx.blockheight,
                                        'blockHash': tx.blockhash,
                                        'to': item.addr,
                                        'value': item.value,
                                        'type': th.type,
                                        'timestamp': moment.unix(tx.time).format("YYYY-MM-DD H:m:s")
                                    })
                                }
                            })
                        })
                    }
                    callback(null, txsArr);
                })
            })
            .catch((error) => {
                console.log(error)
                callback(error, null);
            });

        /**
         * Get txs from insight-api
         * */
        function getTxs(from, to, cb) {
            axios.get(th.insight_api_host + 'addrs/' + addressList + '/txs?from=' + from + '&to=' + to)
                .then((res) => {
                    if (res.data && res.data.items) {
                        items = [...items, ...res.data.items]
                        let totalItems = res.data.totalItems;
                        if (totalItems > items.length) {
                            let newfrom = items.length;
                            let newto = newfrom + parseInt(process.env.bitcointxsOffset);
                            getTxs(newfrom, newto, (err2, res2) => {
                                if (err2) return cb(err2, null);
                                return cb(null, res2);
                            })
                        } else {
                            return cb(null, items)
                        }
                    }
                    return cb(null, res)
                })
                .catch((e) => {
                    cb(e, null);
                })
        }

    }

    /**
     *  txs : Array of  records for transactions tables
     *  callback with err res. if no err -> res = true
     * */

    insertTxs(txs, callback) {
        knex.batchInsert('transactions', txs)
            .then(function (res) {
                callback(null, res)
            })
            .catch(function (error) {
                callback(error, null)
            });

    }

    /**
     * batchnumber: Integer
     * synctime: Timestamp string
     * callback with err res, if no error -> res=true
     * */
    updatePrioritySyncTime(addressarray, synctime, callback) {
        let a = 0;
        addressarray.forEach((item, i, arr) => {
            // console.log('item ', item)
            // console.log('synctime ', synctime)
            knex('accounts')
                .where('address', item)
                .update({
                    sync_time: synctime
                })
                .then((res) => {
                    a = i + 1;
                })
        })
        if (a === addressarray.length)
            callback(null, true)
    }


}

module
    .exports = CoinLib;