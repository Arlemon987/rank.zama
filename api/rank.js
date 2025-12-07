const cheerio = require('cheerio');

export default async function handler(req, res) {
    const { handle } = req.query;

    if (!handle) {
        return res.status(400).json({ error: 'Handle is required' });
    }

    const cleanHandle = handle.replace('@', '').toLowerCase();
    
    // OPTIONAL: If scraping fails, find the API URL in your browser DevTools (Network tab) 
    // and paste it here. It usually looks like a long JSON file or an API endpoint.
    const MANUAL_API_URL = ""; 
    
    const MAIN_PAGE_URL = "https://www.zama.org/programs/creator-program";

    let responseData = {
        found: false,
        handle: cleanHandle,
        stats: {
            "24h": { rank: "---", score: "---" },
            "7d": { rank: "---", score: "---" },
            "30d": { rank: "---", score: "---" }
        }
    };

    try {
        let rawData = null;

        // --- STRATEGY 1: Fetch from Manual API (If user provided it) ---
        if (MANUAL_API_URL) {
            try {
                const apiRes = await fetch(MANUAL_API_URL);
                if (apiRes.ok) rawData = await apiRes.json();
            } catch (e) {
                console.error("Manual API fetch failed:", e);
            }
        }

        // --- STRATEGY 2: Scrape __NEXT_DATA__ (Standard for Vercel/Next.js sites) ---
        // This is usually where the data lives before the page is hydrated.
        if (!rawData) {
            const pageRes = await fetch(MAIN_PAGE_URL, {
                headers: {
                    // Fake a real browser to avoid basic bot blocking
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
                }
            });
            
            const html = await pageRes.text();
            const $ = cheerio.load(html);

            const nextDataScript = $('#__NEXT_DATA__').html();
            
            if (nextDataScript) {
                try {
                    const json = JSON.parse(nextDataScript);
                    rawData = json; 
                } catch (e) {
                    console.error("Failed to parse Next.js data");
                }
            }
        }

        // --- PROCESS FOUND DATA ---
        if (rawData) {
            // Find the specific user object within the massive JSON tree
            const userObj = findUserInDeepJSON(rawData, cleanHandle);

            if (userObj) {
                responseData.found = true;
                
                // 1. Extract 30D Data (Standard View)
                responseData.stats["30d"] = {
                    rank: userObj.rank || userObj.position || "---",
                    score: parseScore(userObj.score || userObj.points || userObj.mindshare)
                };

                // 2. Extract 24H and 7D Data
                // The data structure varies, but often looks like history: { '24h': {...}, '7d': {...} }
                // or specific fields like score_24h, rank_24h
                
                if (userObj.history) {
                    // Structure A: Nested history object
                    if (userObj.history['24h']) responseData.stats["24h"] = formatStat(userObj.history['24h']);
                    if (userObj.history['7d']) responseData.stats["7d"] = formatStat(userObj.history['7d']);
                } else {
                    // Structure B: Flat fields (common fallback)
                    if (userObj.rank_24h || userObj.score_24h) {
                        responseData.stats["24h"] = {
                            rank: userObj.rank_24h || "---",
                            score: parseScore(userObj.score_24h)
                        };
                    }
                    if (userObj.rank_7d || userObj.score_7d) {
                        responseData.stats["7d"] = {
                            rank: userObj.rank_7d || "---",
                            score: parseScore(userObj.score_7d)
                        };
                    }
                }
            }
        }

        return res.status(200).json(responseData);

    } catch (error) {
        console.error("Handler Error:", error);
        return res.status(500).json({ error: "Server Error" });
    }
}

// --- HELPERS ---

function parseScore(val) {
    if (!val && val !== 0) return "---";
    if (typeof val === 'number') return val.toFixed(2); // Format to 2 decimals
    if (typeof val === 'string') return parseFloat(val).toFixed(2);
    return val;
}

function formatStat(obj) {
    return {
        rank: obj.rank || obj.position || "---",
        score: parseScore(obj.score || obj.points || obj.mindshare)
    };
}

// Recursively search for a user object containing the handle
function findUserInDeepJSON(obj, handle) {
    if (!obj || typeof obj !== 'object') return null;

    // Check if THIS object is the user we want
    if (
        (obj.handle && String(obj.handle).toLowerCase().includes(handle)) ||
        (obj.username && String(obj.username).toLowerCase().includes(handle)) ||
        (obj.twitter && String(obj.twitter).toLowerCase().includes(handle))
    ) {
        return obj;
    }

    // Recursion
    if (Array.isArray(obj)) {
        for (let item of obj) {
            const found = findUserInDeepJSON(item, handle);
            if (found) return found;
        }
    } else {
        for (let key in obj) {
            // Optimization: Skip massive irrelevant keys if possible, but for safety check all
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const found = findUserInDeepJSON(obj[key], handle);
                if (found) return found;
            }
        }
    }

    return null;
}
