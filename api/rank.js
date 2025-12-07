const cheerio = require('cheerio');

export default async function handler(req, res) {
    const { handle } = req.query;

    if (!handle) {
        return res.status(400).json({ error: 'Handle is required' });
    }

    const cleanHandle = handle.replace('@', '').toLowerCase();
    const targetUrl = 'https://www.zama.org/programs/creator-program';

    // Prevent Vercel from caching this response so it's always real-time
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
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

        // Iterate over table rows
        $('tr').each((i, row) => {
            const rowText = $(row).text().toLowerCase();
            
            // Flexible matching: check for @handle or just handle
            if (rowText.includes('@' + cleanHandle) || rowText.includes(cleanHandle + ' ')) {
                const cols = $(row).find('td');
                
                if (cols.length > 0) {
                    // Extract Rank
                    const rankText = $(cols[0]).text().trim();
                    if (rankText.includes('🥇')) rank = 1;
                    else if (rankText.includes('🥈')) rank = 2;
                    else if (rankText.includes('🥉')) rank = 3;
                    else rank = parseInt(rankText.replace(/[^0-9]/g, '')) || 0;

                    // Extract Score (Look for decimal numbers in later columns)
                    let scoreText = $(cols[2]).text().trim();
                    // If col 2 isn't a number, check col 3 (sometimes structure varies)
                    if (!scoreText || isNaN(parseFloat(scoreText.replace(',', '.')))) {
                         scoreText = $(cols[3]).text().trim();
                    }
                    
                    score = parseFloat(scoreText.replace(/,/g, '')) || 0;
                    found = true;
                    return false; // Stop loop
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
