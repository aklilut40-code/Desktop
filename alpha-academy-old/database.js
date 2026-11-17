const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// ናይ ዳታቤዝ መዋቕር ምፍጣር
const initializeDatabase = async () => {
    try {
        // ናይ ተምሃሮ ሰሌዳ
        await pool.query(`
            CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                phone_number VARCHAR(15) UNIQUE NOT NULL,
                grade INTEGER CHECK (grade IN (6, 7, 8)),
                password_hash TEXT NOT NULL,
                summer_ambition TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // ናይ ትምህርታዊ ጸሓፊታት ሰሌዳ
        await pool.query(`
            CREATE TABLE IF NOT EXISTS resources (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                subject VARCHAR(50) NOT NULL,
                file_path TEXT NOT NULL,
                file_type VARCHAR(20) DEFAULT 'pdf',
                download_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // ናይ ጽሕፈት መዘከርታ (Journal) ሰሌዳ
        await pool.query(`
            CREATE TABLE IF NOT EXISTS journal_entries (
                id SERIAL PRIMARY KEY,
                student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                entry_text TEXT NOT NULL,
                week_number INTEGER,
                mood_rating INTEGER CHECK (mood_rating >= 1 AND mood_rating <= 5),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✓ ሁሉም ሰሌዳታት ብዓወት ተፈጢሮም');
        
        // ናይ ምርኢት ዳታ (Sample resources)
        await insertSampleResources();
        
    } catch (error) {
        console.error('✗ ናይ ዳታቤዝ ምፍጣር ኣይተሳናእን:', error);
    }
};

// ናይ ምርኢት ትምህርታዊ ጸሓፊታት
const insertSampleResources = async () => {
    const subjects = ['math', 'english', 'physics', 'chemistry'];
    const sampleFiles = [
        { title: 'ምዕራፍ 1 - መሰረታዊ ፅንሰ-ሓሳባት', file: 'chapter1.pdf', type: 'pdf' },
        { title: 'ምዕራፍ 2 - ልምምድ ምዕራፍ', file: 'chapter2.pdf', type: 'pdf' },
        { title: 'PowerPoint ማጠቃለያ', file: 'summary.pptx', type: 'powerpoint' },
    ];
    
    for (const subject of subjects) {
        for (const file of sampleFiles) {
            const result = await pool.query(
                'SELECT id FROM resources WHERE title = $1 AND subject = $2',
                [file.title, subject]
            );
            
            if (result.rows.length === 0) {
                await pool.query(
                    'INSERT INTO resources (title, subject, file_path, file_type) VALUES ($1, $2, $3, $4)',
                    [file.title, subject, `uploads/${subject}/${file.file}`, file.type]
                );
            }
        }
    }
    console.log('✓ ናይ ምርኢት ጸሓፊታት ተመሓላሊፎም');
};

module.exports = { pool, initializeDatabase };