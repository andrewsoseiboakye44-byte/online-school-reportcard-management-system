window.loadMyClassRoster = async function() {
    const tbody = document.getElementById('myClassTbody');
    const headerObj = document.getElementById('myClassTitle');
    const subTitle = document.getElementById('myClassSubtitle');
    if (!tbody) return;

    try {
        const { data: { session }, error: authErr } = await supabaseClient.auth.getSession();
        if (authErr || !session) throw new Error("Authentication failed");

        // Get Teacher's class
        const { data: classData, error: classErr } = await supabaseClient
            .from('classes')
            .select('id, name')
            .eq('form_master_id', session.user.id)
            .single();

        if (classErr || !classData) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted">You are not currently assigned to any class as a Form Master.</td></tr>';
            
            // Overwrite titles
            if(headerObj) headerObj.textContent = "Class Roster";
            if(subTitle) subTitle.textContent = "No Class Assigned";
            return;
        }

        // Fetch students
        const { data: students, error: stdErr } = await supabaseClient
            .from('students')
            .select('*')
            .eq('class_id', classData.id)
            .eq('status', 'active')
            .order('first_name', { ascending: true });

        if (stdErr) throw stdErr;

        // Update header block
        if(headerObj) headerObj.textContent = `${classData.name} Roster`;
        if(subTitle) subTitle.textContent = `${students ? students.length : 0} Active Students Enrolled`;

        if (!students || students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted">No students registered in this class.</td></tr>';
            return;
        }

        // Output students
        tbody.innerHTML = students.map(s => {
            const dobParsed = s.dob ? new Date(s.dob).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}) : '--';
            const genderDisplay = s.gender ? s.gender.charAt(0).toUpperCase() + s.gender.slice(1) : '--';
            
            return `
            <tr>
                <td><span class="badge bg-light border text-dark shadow-sm">${s.student_id_number || '--'}</span></td>
                <td><strong>${s.first_name} ${s.last_name}</strong></td>
                <td>${genderDisplay}</td>
                <td>${dobParsed}</td>
                <td>${s.guardian_name || 'Guardian'} <br> <small class="text-muted"><i class="fas fa-phone-alt fa-xs me-1"></i>${s.guardian_contact || '--'}</small></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary shadow-sm" title="View Profile" onclick="alert('Student Profile System Loading...')">
                        <i class="fas fa-user-circle me-1"></i> Profile
                    </button>
                </td>
            </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("My Class Loader Error:", err);
        if(subTitle) subTitle.textContent = "Error Loading Class";
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle me-2"></i> ${err.message || 'Failed to load class roster'}</td></tr>`;
    }
};

// Also auto-invoke for backwards compatibility with dynamic script injection
window.loadMyClassRoster();
