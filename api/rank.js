const cheerio = require('cheerio');

export default async function handler(req, res) {
    const { handle } = req.query;

    if (!handle) {
        return res.status(400).json({ error: 'Handle is required' });
    }

    const cleanHandle = handle.replace('@', '').toLowerCase();
    const targetUrl = 'https://www.zama.org/programs/creator-program';

    try {
        // 1. Fetch with "User-Agent" to mimic a real browser (prevents blocking)
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to load page: ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        let found = false;
        let rank = 0;
        let score = 0;

        // 2. Iterate over all table rows
        $('tr').each((i, row) => {
            const rowText = $(row).text().toLowerCase();
            
            // Check if the handle exists in this row
            if (rowText.includes('@' + cleanHandle) || rowText.includes(cleanHandle)) {
                const cols = $(row).find('td');
                
                // If we found the row, extract data safely
                if (cols.length > 0) {
                    // --- Extract Rank (Col 0) ---
                    const rankText = $(cols[0]).text().trim();
                    
                    // Handle Emojis for top 3
                    if (rankText.includes('🥇')) rank = 1;
                    else if (rankText.includes('🥈')) rank = 2;
                    else if (rankText.includes('🥉')) rank = 3;
                    else {
                        // Remove '#' and parse integer
                        rank = parseInt(rankText.replace(/[^0-9]/g, '')) || 0;
                    }

                    // --- Extract Score (Column 3) ---
                    // Try the 3rd column (index 2), but verify it's a number
                    // Sometimes tables have hidden columns, so we check carefully
                    let scoreText = $(cols[2]).text().trim(); 
                    
                    // Fallback: If 3rd column is empty, check the last column
                    if (!scoreText || scoreText.length === 0) {
                        scoreText = $(cols[cols.length - 1]).text().trim();
                    }

                    // Remove commas (e.g., "1,200") before parsing
                    score = parseFloat(scoreText.replace(/,/g, '')) || 0;
                    found = true;
                    return false; // Stop the loop
                }
            }
        });

        if (found) {
            return res.status(200).json({
                found: true,
                handle: cleanHandle,
                rank: rank,
                score: score
            });
        } else {
            return res.status(200).json({ found: false });
        }

    } catch (error) {
        console.error("Scraping error:", error);
        return res.status(500).json({ error: 'Failed to fetch external data' });
    }
}
