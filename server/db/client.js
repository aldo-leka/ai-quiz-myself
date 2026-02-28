import pg from 'pg'
import log from "../log.js";

const { Pool } = pg

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false
})

pool.on("error", (err, client) => {
    log('Unexpected error on idle client', err)
})

export default pool