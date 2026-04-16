const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://irnzcefanuvzhjswveta.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlybnpjZWZhbnV2emhqc3d2ZXRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTgwNzgsImV4cCI6MjA5MDE3NDA3OH0.bbh05YXss9XJVpNZhV2sKSm4X3WIMTOSC4-xYhkFBSc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    console.log("Checking users...");
    const { data: users, error: err1 } = await supabase.from('users').select('*');
    if (err1) console.error("Error users:", err1);
    else console.log("Users count:", users.length, users);

    console.log("Checking school_settings...");
    const { data: schools, error: err2 } = await supabase.from('school_settings').select('*');
    if (err2) console.error("Error school_settings:", err2);
    else console.log("School settings count:", schools.length, schools);
}

check();
