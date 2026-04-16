/**
 * SUPABASE CLIENT CONFIGURATION
 * 
 * 1. Create a project at https://supabase.com
 * 2. Get your Project URL and anon public key from Project Settings > API
 * 3. Replace the placeholder values below with your actual keys.
 */

// Supabase Project REST URL
const SUPABASE_URL = 'https://irnzcefanuvzhjswveta.supabase.co';

// Supabase Project Public ANON Key
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlybnpjZWZhbnV2emhqc3d2ZXRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTgwNzgsImV4cCI6MjA5MDE3NDA3OH0.bbh05YXss9XJVpNZhV2sKSm4X3WIMTOSC4-xYhkFBSc';

// Initialize the Supabase Client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Utility function to dynamically get the active school name (so Sergio Academy can be changed later)
async function fetchSchoolSettings() {
    try {
        const { data, error } = await supabaseClient
            .from('school_settings')
            .select('*')
            .limit(1)
            .maybeSingle();
            
        if (error) throw error;
        return data;
    } catch (error) {
        console.warn('Could not fetch school settings:', error.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// GLOBAL DYNAMIC BRANDING INJECTION
// ---------------------------------------------------------------------------
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', async () => {
        const settings = await fetchSchoolSettings();
        if (settings && (settings.school_name || settings.school_motto)) {
            const dbName = settings.school_name || 'SERGIO ACADEMY';
            const dbMotto = settings.school_motto || 'Knowledge is Power';
            
            // 1. Update Title
            if (document.title.includes('SERGIO ACADEMY')) {
                document.title = document.title.replace('SERGIO ACADEMY', dbName);
            }
            if (document.title.includes('SCHOOL NAME')) {
                document.title = document.title.replace('SCHOOL NAME', dbName);
            }
            
            // 2. Update text nodes dynamically
            function replaceTextInNode(node) {
                if (node.nodeType === 3) { // Text node
                    if (node.nodeValue.includes('SERGIO ACADEMY')) {
                        node.nodeValue = node.nodeValue.replace(/SERGIO ACADEMY/g, dbName);
                    }
                    if (node.nodeValue.includes('SCHOOL NAME')) {
                        node.nodeValue = node.nodeValue.replace(/SCHOOL NAME/g, dbName);
                    }
                    if (node.nodeValue.includes('Knowledge is Power')) {
                        node.nodeValue = node.nodeValue.replace(/Knowledge is Power/g, dbMotto);
                    }
                    if (node.nodeValue.includes('School Motto Here')) {
                        node.nodeValue = node.nodeValue.replace(/School Motto Here/g, dbMotto);
                    }
                } else if (node.nodeType === 1 && node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE') {
                    node.childNodes.forEach(replaceTextInNode);
                }
            }
            
            replaceTextInNode(document.body);
            
            // 3. Fallback specifically for dynamically loaded elements via router
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((addedNode) => {
                        replaceTextInNode(addedNode);
                    });
                });
            });
            
            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            }
        }
    });
}
