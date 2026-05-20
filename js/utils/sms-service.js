/**
 * SMS GROUPING SERVICE
 * Handles grouping student results by Guardian Contact to send only 1 bundled SMS to parents with multiple children.
 * Integrates dynamically with Mnotify, Arkesel, or any custom API gateway configured in Settings.
 */

// Phone formatting utilities for Ghana telecom networks
function formatGhanaPhoneNumberLocal(phone) {
    if (!phone) return '';
    let clean = phone.replace(/[^0-9]/g, ''); // strip non-digits
    if (clean.startsWith('233') && clean.length === 12) {
        clean = '0' + clean.slice(3);
    } else if (!clean.startsWith('0') && clean.length === 9) {
        clean = '0' + clean;
    }
    return clean;
}

function formatGhanaPhoneNumberInt(phone) {
    if (!phone) return '';
    let clean = phone.replace(/[^0-9]/g, ''); // strip non-digits
    if (clean.startsWith('0') && clean.length === 10) {
        clean = '233' + clean.slice(1);
    } else if (!clean.startsWith('233') && clean.length === 9) {
        clean = '233' + clean;
    }
    return clean;
}

// Router to dispatch outbound request based on configured template
async function sendSmsViaCustomTemplate(settings, phone, message) {
    const { 
        sms_api_key, 
        sms_sender_id, 
        sms_gateway_url, 
        sms_http_method, 
        sms_headers, 
        sms_body_template 
    } = settings;
    
    if (!sms_gateway_url) {
        throw new Error("SMS Gateway URL is not configured. Please complete the SMS configuration in System Settings.");
    }
    
    const phoneLocal = formatGhanaPhoneNumberLocal(phone);
    const phoneInt = formatGhanaPhoneNumberInt(phone);
    const phoneRaw = phone;
    
    // Replace template placeholders
    const replacePlaceholders = (str) => {
        if (!str) return '';
        return str
            .replace(/\{\{API_KEY\}\}/g, sms_api_key || '')
            .replace(/\{\{SENDER_ID\}\}/g, sms_sender_id || '')
            .replace(/\{\{RECIPIENT_LOCAL\}\}/g, phoneLocal)
            .replace(/\{\{RECIPIENT_INT\}\}/g, phoneInt)
            .replace(/\{\{RECIPIENT\}\}/g, phoneInt) // fallback to international
            .replace(/\{\{RECIPIENT_RAW\}\}/g, phoneRaw)
            .replace(/\{\{MESSAGE\}\}/g, message.replace(/"/g, '\\"').replace(/\n/g, '\\n')); // JSON safe escape
    };
    
    const url = replacePlaceholders(sms_gateway_url);
    const method = (sms_http_method || 'POST').toUpperCase();
    
    let headers = {
        'Content-Type': 'application/json'
    };
    
    if (sms_headers) {
        try {
            const rawHeaders = JSON.parse(replacePlaceholders(sms_headers));
            headers = { ...headers, ...rawHeaders };
        } catch (e) {
            console.error("Failed to parse SMS Headers JSON, sending default Content-Type:", e);
        }
    }
    
    const fetchOptions = {
        method: method,
        headers: headers
    };
    
    if (method === 'POST' || method === 'PUT') {
        fetchOptions.body = replacePlaceholders(sms_body_template);
    }
    
    console.log(`[SMS-SERVICE] Outbound Request to: ${url}`, fetchOptions);
    const response = await fetch(url, fetchOptions);
    
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gateway responded with status ${response.status}: ${errText}`);
    }
    
    const responseData = await response.json().catch(() => ({ status: 'Success (Non-JSON)' }));
    console.log('[SMS-SERVICE] Gateway response:', responseData);
    return responseData;
}

// Sibling-grouped SMS broadcast for all students inside a specific class JHS/Primary
async function broadcastClassSMS(classId) {
    console.log(`Starting Sibling-Grouped SMS broadcast for Class ID: ${classId}...`);
    
    try {
        // 1. Fetch SMS Settings from Supabase
        const { data: settings } = await supabaseClient
            .from('school_settings')
            .select('*')
            .limit(1)
            .maybeSingle();
            
        if (!settings || !settings.sms_api_key) {
            throw new Error("SMS Gateway is not configured. Please add an API Key and config settings in School Settings page.");
        }
        
        // 2. Fetch Active Students in class
        const { data: students, error } = await supabaseClient
            .from('students')
            .select(`
                first_name, 
                student_id_number,
                guardian_contact,
                guardian_name
            `)
            .eq('class_id', classId)
            .eq('status', 'active');
            
        if (error) throw error;
        if (!students || students.length === 0) {
            throw new Error("No active students found in this class.");
        }
        
        // 3. Group by guardian contact
        const groupedParents = {};
        students.forEach(student => {
            let phone = student.guardian_contact;
            if(!phone) return;
            phone = phone.trim().replace(/\s+/g, '');
            if(phone.length < 9) return; // Skip invalid contacts
            
            if(!groupedParents[phone]) {
                groupedParents[phone] = {
                    guardian_name: student.guardian_name,
                    children: []
                };
            }
            groupedParents[phone].children.push(student);
        });
        
        const parentEntries = Object.entries(groupedParents);
        if (parentEntries.length === 0) {
            throw new Error("No students in this class have valid guardian phone numbers.");
        }
        
        // 4. Construct and dispatch the bundled payloads
        let successCount = 0;
        const portalUrl = `${window.location.origin}/check-results.html`;
        
        for (const [phone, family] of parentEntries) {
            let message = `Dear ${family.guardian_name || 'Parent/Guardian'}, official term results have been published! Access portal via: ${portalUrl}\n`;
            
            family.children.forEach(child => {
                message += `- ${child.first_name}: Use ID ${child.student_id_number}\n`;
            });
            
            await sendSmsViaCustomTemplate(settings, phone, message);
            successCount++;
        }
        
        return { success: true, parentsReached: successCount };
    } catch (err) {
        console.error("Class SMS Broadcast Failed:", err);
        return { success: false, error: err.message };
    }
}

// Global Sibling-grouped SMS broadcast for the entire school
async function broadcastGroupedSMS() {
    console.log("Starting Global Sibling-Grouped SMS broadcast...");
    
    try {
        const { data: settings } = await supabaseClient
            .from('school_settings')
            .select('*')
            .limit(1)
            .maybeSingle();
            
        if (!settings || !settings.sms_api_key) {
            throw new Error("SMS Gateway is not configured. Please add an API Key and config settings in School Settings page.");
        }
        
        const { data: students, error } = await supabaseClient
            .from('students')
            .select(`
                first_name, 
                student_id_number,
                guardian_contact,
                guardian_name
            `)
            .eq('status', 'active');
            
        if (error) throw error;
        if (!students || students.length === 0) {
            throw new Error("No active students found in the database.");
        }
        
        const groupedParents = {};
        students.forEach(student => {
            let phone = student.guardian_contact;
            if(!phone) return;
            phone = phone.trim().replace(/\s+/g, '');
            if(phone.length < 9) return;
            
            if(!groupedParents[phone]) {
                groupedParents[phone] = {
                    guardian_name: student.guardian_name,
                    children: []
                };
            }
            groupedParents[phone].children.push(student);
        });
        
        let successCount = 0;
        const portalUrl = `${window.location.origin}/check-results.html`;
        
        for (const [phone, family] of Object.entries(groupedParents)) {
            let message = `Dear ${family.guardian_name || 'Parent/Guardian'}, official term results have been published! Access portal via: ${portalUrl}\n`;
            
            family.children.forEach(child => {
                message += `- ${child.first_name}: Use ID ${child.student_id_number}\n`;
            });
            
            await sendSmsViaCustomTemplate(settings, phone, message);
            successCount++;
        }
        
        return { success: true, parentsReached: successCount };
    } catch (err) {
        console.error("Global SMS Broadcast Failed:", err);
        return { success: false, error: err.message };
    }
}

// Expose functions globally to be available in dashboard SPA templates
window.broadcastClassSMS = broadcastClassSMS;
window.broadcastGroupedSMS = broadcastGroupedSMS;
