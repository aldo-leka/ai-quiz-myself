import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false
})

export default pool