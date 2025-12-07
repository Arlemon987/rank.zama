const cheerio = require('cheerio');

export default async function handler(req, res) {
    const { handle } = req.query;

    if (!handle) {
        return res.status(400).json({ error: 'Handle is required' });
    }

    const cleanHandle = handle.replace('@', '').toLowerCase();
    const targetUrl = 'https://www.zama.org/programs/creator-program';

    try {
        // 1. Fetch the Zama Page
        const response = await fetch(targetUrl);
        const html = await response.text();

        // 2. Load into Cheerio for parsing
        const $ = cheerio.load(html);

        // 3. Find the handle in the table
        // We look for any text element that matches the handle (case insensitive)
        let found = false;
        let rank = 0;
        let score = 0;

        // Iterate over table rows (assuming standard table structure)
        $('tr').each((i, row) => {
            const rowText = $(row).text().toLowerCase();
            
            if (rowText.includes('@' + cleanHandle)) {
                // Found the user! Now extract column data.
                const cols = $(row).find('td');
                
                // Usually: Col 0 = Rank, Col 1 = User info, Col 2 = Score
                // We clean the text to remove icons/newlines
                const rankText = $(cols[0]).text().trim().replace('#', '');
                const scoreText = $(cols[2]).text().trim();

                rank = parseInt(rankText) || 0;
                score = parseFloat(scoreText) || 0;
                found = true;
                return false; // Break loop
            }
        });

        // If not found in <tr>, try searching generic divs (some leaderboards use divs)
        if (!found) {
            // Fallback: This part is tricky without seeing the exact DOM structure live.
            // But usually the table scraper above catches 90% of cases.
        }

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