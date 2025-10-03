import '../config.js'
import pool from './client.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function setup() {
    try {
        const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')

        await pool.query(schema)

        console.log('✅ Database schema created successfully!')

        await pool.end()
    } catch (error) {
        console.error('❌ Error setting up database:', error)
        process.exit(1)
    }
}

setup()

// node db/setup.js