const config = require('../../config');
const knex = require('knex')({
    client: config.knexClient,
    connection: config.knexConnection
});

const Currency = {};
getLastValue((lv) => {
    Currency.getLastValue = lv
});

getDefaultValue((dv) => {
    Currency.getDefaultValue = dv
});

function getDefaultValue(cb) {
    cb = cb || function () {
    };
    knex.select('id')
        .from('pairs')
        .where('default_pair', 1)
        .then(function (values) {
            cb(values[0].id);
        })
        .catch(function (err) {
            console.log(err);
        })
        .finally(function () {
            // To close the connection pool
            //knex.destroy();
        });

}

function getLastValue(cb) {
    cb = cb || function () {};
    knex.column(['name', 'id'])
        .avg('av_price as value')
        .from(function () {
            this.select(['t3.custom_alias as name', 't3.id as id', 'currency.pair', 'currency.av_price',])
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
        .groupBy('pair','id','name')
        .then(function (values) {
            cb(values);
        })
        .catch(function (err) {
            console.log(err);
        })
        .finally(function () {
            // To close the connection pool
            //knex.destroy();
        });

}

module.exports = Currency;