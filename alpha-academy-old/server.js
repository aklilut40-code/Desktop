const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { pool, initializeDatabase } = require('./database');
const { authenticateToken, generateToken } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// ============ API መንገድታት ============

// 1. ምዝገባ
app.post('/api/register', async (req, res) => {
    try {
        const { full_name, phone_number, grade, password, summer_ambition } = req.body;
        
        if (!full_name || !phone_number || !grade || !password) {
            return res.status(400).json({ error: 'በጃኹም ኩሉ ኣድላዪ ሓበሬታ ኣእትዉ' });
        }
        
        const existingStudent = await pool.query(
            'SELECT id FROM students WHERE phone_number = $1',
            [phone_number]
        );
        
        if (existingStudent.rows.length > 0) {
            return res.status(400).json({ error: 'እዚ ቁጽሪ ተሌፎን ቀደም ተመዝጊቡ። በጃኹም ካልእ ቁጽሪ ምዝገቡ' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            `INSERT INTO students (full_name, phone_number, grade, password_hash, summer_ambition) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, phone_number, grade, summer_ambition`,
            [full_name, phone_number, grade, hashedPassword, summer_ambition || null]
        );
        
        const token = generateToken(result.rows[0]);
        
        res.status(201).json({
            message: 'ምዝገባካ ብዓወት ተዛዚሙ!',
            token,
            user: result.rows[0]
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'ኣብ ምዝገባ ጸገም ኣጋጠመ' });
    }
});

// 2. ምእታው
app.post('/api/login', async (req, res) => {
    try {
        const { phone_number, password } = req.body;
        
        if (!phone_number || !password) {
            return res.status(400).json({ error: 'ቁጽሪ ተሌፎንን ሓሳዊ ቃልን ኣእትዉ' });
        }
        
        const result = await pool.query(
            'SELECT * FROM students WHERE phone_number = $1',
            [phone_number]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'ትክክለኛ ቁጽሪ ተሌፎን ወይ ሓሳዊ ቃል ኣይኮነን' });
        }
        
        const student = result.rows[0];
        const validPassword = await bcrypt.compare(password, student.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'ትክክለኛ ቁጽሪ ተሌፎን ወይ ሓሳዊ ቃል ኣይኮነን' });
        }
        
        const token = generateToken({
            id: student.id,
            phone_number: student.phone_number,
            grade: student.grade
        });
        
        res.json({
            message: 'እንቋዕ ብደሓን ኣተኻ!',
            token,
            user: {
                id: student.id,
                full_name: student.full_name,
                phone_number: student.phone_number,
                grade: student.grade,
                summer_ambition: student.summer_ambition
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'ኣብ ምእታው ጸገም ኣጋጠመ' });
    }
});

// 3. ናይ ተምሃራይ ሓበሬታ
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, full_name, phone_number, grade, summer_ambition, created_at FROM students WHERE id = $1',
            [req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'ተምሃራይ ኣይተረኽበን' });
        }
        
        res.json(result.rows[0]);
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'ናይ መገለጺ ሓበሬታ ምርካብ ኣይተኻኣለን' });
    }
});

// 4. ናይ ትምህርታዊ ጸሓፊታት
app.get('/api/resources', authenticateToken, async (req, res) => {
    try {
        const { subject } = req.query;
        let query = 'SELECT * FROM resources';
        let params = [];
        
        if (subject && subject !== 'all') {
            query += ' WHERE subject = $1 ORDER BY created_at DESC';
            params = [subject];
        } else {
            query += ' ORDER BY subject, created_at DESC';
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
        
    } catch (error) {
        console.error('Resources error:', error);
        res.status(500).json({ error: 'ትምህርታዊ ጸሓፊታት ምርካብ ኣይተኻኣለን' });
    }
});

// 5. ጽሕፈት መዘከርታ
app.post('/api/journal', authenticateToken, async (req, res) => {
    try {
        const { entry_text, week_number, mood_rating } = req.body;
        
        if (!entry_text) {
            return res.status(400).json({ error: 'በጃኹም ጽሑፍ ኣእትዉ' });
        }
        
        const result = await pool.query(
            'INSERT INTO journal_entries (student_id, entry_text, week_number, mood_rating) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.user.id, entry_text, week_number || null, mood_rating || null]
        );
        
        res.status(201).json({
            message: 'መዘከርታኻ ተቐሚጡ!',
            entry: result.rows[0]
        });
        
    } catch (error) {
        console.error('Journal error:', error);
        res.status(500).json({ error: 'መዘከርታ ምቅማጥ ኣይተኻኣለን' });
    }
});

// 6. ናይ ተምሃራይ መዘከርታታት
app.get('/api/journal', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM journal_entries WHERE student_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        
        res.json(result.rows);
        
    } catch (error) {
        console.error('Get journal error:', error);
        res.status(500).json({ error: 'መዘከርታታት ምርካብ ኣይተኻኣለን' });
    }
});

// 7. Dashboard statistics
app.get('/api/dashboard-stats', authenticateToken, async (req, res) => {
    try {
        const journalCount = await pool.query(
            'SELECT COUNT(*) FROM journal_entries WHERE student_id = $1',
            [req.user.id]
        );
        
        const quizCount = await pool.query(
            'SELECT COUNT(*), COALESCE(AVG(score), 0) as avg_score FROM quiz_results WHERE student_id = $1',
            [req.user.id]
        );
        
        res.json({
            journal_entries_count: parseInt(journalCount.rows[0].count),
            quiz_count: parseInt(quizCount.rows[0].count),
            avg_quiz_score: parseFloat(quizCount.rows[0].avg_score),
            member_since: new Date().toLocaleDateString('ti-ER'),
            weekly_goal: "እዚ ሰሙን 3 መዘከርታታት ጽሓፍ",
            progress: Math.min(100, (journalCount.rows[0].count / 10) * 100)
        });
        
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.json({
            journal_entries_count: 0,
            progress: 0,
            message: 'ስታቲስቲክ ምርካብ ኣይተኻኣለን'
        });
    }
});

// ሰርቨር ምጅማር
const startServer = async () => {
    await initializeDatabase();
    
    app.listen(PORT, () => {
        console.log(`\n🚀 አልፋ አካዳሚ ሰርቨር ተጀሚሩ!`);
        console.log(`📡 ኣድራሻ: http://localhost:${PORT}`);
        console.log(`🔐 ንምእታው ገጽ: http://localhost:${PORT}/login.html`);
        console.log(`📝 ንምዝገባ ገጽ: http://localhost:${PORT}/register.html`);
        console.log(`📊 ንዳሽቦርድ: http://localhost:${PORT}/dashboard.html`);
        console.log(`📚 ንቤት መጻሕፍቲ: http://localhost:${PORT}/learning-hub.html`);
        console.log(`⭐ ንገጽ ስነ-ምግባር: http://localhost:${PORT}/legacy.html`);
        console.log(`\n💡 ሓሳብ: ትምህርታዊ ጸሓፊታትኩም ኣብ 'uploads/' ፎልደር ኣንብሩ\n`);
    });
};

startServer();