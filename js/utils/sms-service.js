/**
 * SMS GROUPING SERVICE
 * Handles grouping student results by Guardian Contact to send only 1 bundled SMS to parents with multiple children.
 */

async function broadcastGroupedSMS() {
    console.log("Starting Sibling-Grouped SMS broadcast...");
    
    try {
        // 1. Fetch SMS Settings from Supabase
        const { data: settings } = await supabase.from('school_settings').select('sms_api_key, sms_sender_id').single();
        if(!settings || !settings.sms_api_key) {
            throw new Error("SMS Gateway is not configured. Please add an API Key in System Settings.");
        }
        
        // 2. Fetch all Active Students with their grades and guardian contacts
        // In a real scenario, this involves joining the grades table and term table.
        // For algorithm demonstration:
        const { data: students, error } = await supabase
            .from('students')
            .select(`
                first_name, 
                student_id_number,
                guardian_contact,
                guardian_name
            `)
            .eq('status', 'active');
            
        if (error) throw error;
        
        // 3. Group by Guardian Contact Phone Number
        const groupedParents = {};
        
        students.forEach(student => {
            const phone = student.guardian_contact;
            if(!phone || phone.length < 9) return; // Skip invalid numbers
            
            if(!groupedParents[phone]) {
                groupedParents[phone] = {
                    guardian_name: student.guardian_name,
                    children: []
                };
            }
            groupedParents[phone].children.push(student);
        });
        
        // 4. Construct and Send the Payload
        let successCount = 0;
        
        for (const [phone, family] of Object.entries(groupedParents)) {
            let message = `Dear ${family.guardian_name || 'Parent'}, official term results are ready! Login to the internal portal using your child's ID:\n`;
            
            family.children.forEach(child => {
                message += `- ${child.first_name}: ${child.student_id_number}\n`;
            });
            
            message += `\nVisit: https://sergioacademy.com/check-results.html`;
            
            console.log(`Sending to: ${phone}\nPayload: ${message}`);
            
            // NOTE: Here you would execute the actual fetch() POST request to your SMS Gateway (e.g. Africa's Talking, Twilio, SMSGH)
            /*
            await fetch('https://api.smsgateway.com/v1/send', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${settings.sms_api_key}` },
                body: JSON.stringify({ to: phone, message: message, sender: settings.sms_sender_id })
            });
            */
            successCount++;
        }
        
        return { success: true, parentsReached: successCount };
        
    } catch (err) {
        console.error("SMS Broadcast Failed:", err);
        return { success: false, error: err.message };
    }
}
