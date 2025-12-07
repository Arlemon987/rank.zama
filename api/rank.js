const cheerio = require('cheerio');

export default async function handler(req, res) {
    const { handle } = req.query;

    if (!handle) {
        return res.status(400).json({ error: 'Handle is required' });
    }

    const cleanHandle = handle.replace('@', '').toLowerCase();
    
    // NOTE: If scraping fails, check the Network tab in your browser on the real site
    // and find the API endpoint they use to load the data (JSON), then use that URL here.
    const targetUrl = 'https://www.zama.org/programs/creator-program';

    try {
        console.log(`[Scraper] Fetching: ${targetUrl}`);

        // 1. Fetch with Browser Headers (Helps bypass simple bot protection)
        const response = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5"
            }
        });

        if (!response.ok) {
            console.error(`[Scraper] Failed to fetch page. Status: ${response.status}`);
            return res.status(response.status).json({ error: 'Failed to access target site' });
        }

        const html = await response.text();
        console.log(`[Scraper] Page fetched. Length: ${html.length} chars`);

        // 2. Load into Cheerio
        const $ = cheerio.load(html);

        let found = false;
        let rank = 0;
        let score = 0;

        // 3. SEARCH STRATEGY A: Standard Table
        $('tr').each((i, row) => {
            const rowText = $(row).text().toLowerCase();
            if (rowText.includes(cleanHandle)) {
                console.log(`[Scraper] Found handle in Table Row: ${i}`);
                
                const cols = $(row).find('td');
                // Attempt to parse columns. This assumes standard layout: Rank | Name | Score
                cols.each((j, col) => {
                    const txt = $(col).text().trim().replace(/,/g, ''); // Remove commas
                    
                    // Heuristics to identify data
                    if (txt.includes('#') || /^\d+$/.test(txt)) {
                        // Likely Rank
                        const r = parseInt(txt.replace('#', ''));
                        if (!isNaN(r)) rank = r;
                    } 
                    else if (/^[\d.]+$/.test(txt) && txt.includes('.')) {
                        // Likely Score (decimal)
                        const s = parseFloat(txt);
                        if (!isNaN(s)) score = s;
                    }
                });
                
                found = true;
                return false; // Break loop
            }
        });

        // 4. SEARCH STRATEGY B: Generic Divs (If tables aren't used)
        if (!found) {
            console.log("[Scraper] Checking generic divs...");
            // Look for any element containing the handle
            $('*').each((i, el) => {
                if (found) return; // Stop if already found
                
                // Get direct text of this element only (not children)
                const text = $(el).clone().children().remove().end().text().trim().toLowerCase();
                
                if (text.includes(cleanHandle) || text === '@' + cleanHandle) {
                    console.log(`[Scraper] Found handle in element: <${el.tagName}>`);
                    
                    // Look at siblings or parent for numbers
                    const parent = $(el).parent();
                    const siblings = parent.find('*'); // All elements in the same container
                    
                    siblings.each((j, sib) => {
                        const sibText = $(sib).text().trim().replace(/,/g, '');
                        
                        // Look for Rank (Integers like 1, 150, #20)
                        if (!rank && (sibText.startsWith('#') || /^\d+$/.test(sibText))) {
                            const r = parseInt(sibText.replace('#', ''));
                            if (r > 0 && r < 10000) rank = r; // Sanity check
                        }
                        
                        // Look for Score (Decimals like 12.5, 100.00)
                        if (!score && /^[\d.]+$/.test(sibText) && sibText.includes('.')) {
                            score = parseFloat(sibText);
                        }
                    });

                    found = true;
                }
            });
        }

        // 5. DEBUGGING: Check for "Client Side Rendering" indicators
        if (!found) {
            const bodyText = $('body').text().toLowerCase();
            if (bodyText.includes('loading') || html.length < 5000) {
                console.log("[Scraper] WARNING: Page might be loading via JavaScript (CSR). Fetch cannot see data.");
            }
            if (!bodyText.includes('rank') && !bodyText.includes('leaderboard')) {
                console.log("[Scraper] WARNING: 'Rank' or 'Leaderboard' keywords not found in HTML. Wrong URL?");
            }
        }

        if (found) {
            return res.status(200).json({
                found: true,
                handle: cleanHandle,
                rank: rank || 9999, // Fallback if rank wasn't parsed clearly
                score: score || 0
            });
        } else {
            console.log(`[Scraper] User ${cleanHandle} not found in static HTML.`);
            return res.status(200).json({ found: false });
        }

    } catch (error) {
        console.error("Scraping error:", error);
        return res.status(500).json({ error: 'Failed to fetch external data' });
    }
}
