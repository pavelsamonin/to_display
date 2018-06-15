module.exports = {
    port: process.env.DB_PORT || 3000,
    configRialtos: {
        'exmo': 1,
        'kraken': 2,
        'poloniex': 3
    },
    configPairs: {
        'ETH_USD': 1,
        'BTC_USD': 2,
        'LTC_USD': 3,
        'ETHUSD': 1,
        'XBTUSD': 2,
        'LTCUSD': 3,
        'USDT_ETH': 1,
        'USDT_BTC': 2,
        'USDT_LTC': 3
    },
    knexClient: 'pg',
    knexConnection: {
        host: process.env.POSTGRES_HOST,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB
    },
    knexPool: {
        min: 2,
        max: 10
    },
    knexMigrations: {
        tableName: 'knex_migrations'
    }
}
