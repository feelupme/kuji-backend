const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 🗄️ 대표님의 Railway DB 정보로 수정하는 곳!
const pool = mysql.createPool({
    host: 'mysql-production-6029.up.railway.app',
    port: 45124, // 여기에_MYSQLPORT_숫자입력
    user: 'root', // 보통 root 입니다
    password: 'zTKRkTjEsgfikDIAgRRYANmSOoWbMbfu',
    database: 'railway', // 보통 railway 입니다
    waitForConnections: true,
    connectionLimit: 10,
    ssl: { rejectUnauthorized: false }
});

// 🪄 DB 뼈대 자동 생성 마법 함수
async function initDatabase() {
    try {
        const connection = await pool.getConnection();
        console.log("DB 접속 성공! 테이블 세팅을 시작합니다...");

        await connection.query(`
            CREATE TABLE IF NOT EXISTS Kuji_Board (
                board_id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(100) NOT NULL, total_count INT NOT NULL, price INT NOT NULL, status VARCHAR(20) DEFAULT '진행중'
            )
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS Prize_Item (
                prize_id INT AUTO_INCREMENT PRIMARY KEY, board_id INT NOT NULL, grade VARCHAR(10) NOT NULL, name VARCHAR(100) NOT NULL, total_qty INT NOT NULL, remain_qty INT NOT NULL
            )
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS Ticket_Pool (
                ticket_id INT AUTO_INCREMENT PRIMARY KEY, board_id INT NOT NULL, prize_id INT NOT NULL, is_drawn CHAR(1) DEFAULT 'N'
            )
        `);

        // 초기 데이터가 없을 때만 80개 세팅
        const [rows] = await connection.query(`SELECT COUNT(*) as cnt FROM Kuji_Board`);
        if (rows[0].cnt === 0) {
            await connection.query(`INSERT INTO Kuji_Board (title, total_count, price) VALUES ('산리오 스페셜 쿠지', 80, 12000)`);
        }

        console.log("✨ DB 세팅 완료!");
        connection.release();
    } catch (error) {
        console.error("DB 세팅 에러:", error);
    }
}
initDatabase();

// 🎲 쿠지 뽑기 API
app.post('/api/draw', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [tickets] = await connection.query(`SELECT ticket_id, prize_id FROM Ticket_Pool WHERE is_drawn = 'N' AND board_id = 1 ORDER BY RAND() LIMIT 1 FOR UPDATE`);
        
        if (tickets.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: '모든 쿠지가 소진되었습니다.' });
        }

        const pickedTicket = tickets[0];
        await connection.query(`UPDATE Ticket_Pool SET is_drawn = 'Y' WHERE ticket_id = ?`, [pickedTicket.ticket_id]);
        await connection.query(`UPDATE Prize_Item SET remain_qty = remain_qty - 1 WHERE prize_id = ?`, [pickedTicket.prize_id]);
        
        const [prizes] = await connection.query(`SELECT name, grade, image_url, remain_qty FROM Prize_Item WHERE prize_id = ?`, [pickedTicket.prize_id]);
        
        const [remainCheck] = await connection.query(`SELECT COUNT(*) as cnt FROM Ticket_Pool WHERE is_drawn = 'N' AND board_id = 1`);
        const isLastOne = (remainCheck[0].cnt === 0);

        await connection.commit();
        res.status(200).json({ success: true, prize: prizes[0], isLastOne: isLastOne });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
    } finally {
        connection.release();
    }
});

// 서버 포트 설정 (Railway가 알아서 포트를 잡도록 process.env.PORT 사용)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`서버가 ${PORT}번 포트에서 실행 중입니다 🚀`);
});




