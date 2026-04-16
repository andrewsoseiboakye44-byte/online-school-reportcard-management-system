// js/admin/report-publishing.js

window.loadReportPublishing = async function() {
    const termBadge = document.getElementById('publishingActiveTermBadge');
    if (!termBadge) return;
    
    try {
        // Get active term
        const { data: activeTerm, error } = await supabaseClient
            .from('academic_settings')
            .select('id, academic_year, current_term')
            .eq('is_active', true)
            .single();
            
        if (error || !activeTerm) {
            termBadge.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i> No Active Term Setup';
            termBadge.className = 'badge bg-danger fs-6 py-2 px-3 shadow-sm';
            window._publishingTermId = null;
            return;
        }
        
        termBadge.innerHTML = `<i class="fas fa-calendar-check me-1"></i> ${activeTerm.academic_year} - ${activeTerm.current_term}`;
        termBadge.className = 'badge bg-success fs-6 py-2 px-3 shadow-sm';
        window._publishingTermId = activeTerm.id;
        
        // Listeners
        const btn = document.getElementById('loadPublishingClassesBtn');
        if (btn) {
            btn.removeEventListener('click', window.loadClassesForPublishing);
            btn.addEventListener('click', window.loadClassesForPublishing);
        }
        
    } catch (err) {
        console.error("Publishing Init Error:", err);
    }
};

window.loadClassesForPublishing = async function() {
    const dept = document.getElementById('publishDeptSelect').value;
    const tbody = document.getElementById('publishingTableBody');
    const termId = window._publishingTermId;
    
    if (!dept) {
        alert("Please select a department first.");
        return;
    }
    
    if (!termId) {
        alert("Cannot load publishing status without an active academic term.");
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Loading department classes...</p></td></tr>';
    
    try {
        // 1. Fetch Classes for this department
        const { data: classes, error: classErr } = await supabaseClient
            .from('classes')
            .select('id, name, users(first_name, last_name)')
            .eq('department', dept)
            .order('name');
            
        if (classErr) throw classErr;
        
        if (!classes || classes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">No classes found in this department.</td></tr>';
            return;
        }
        
        // 2. Fetch Publishing Statuses
        const classIds = classes.map(c => c.id);
        const { data: pubData, error: pubErr } = await supabaseClient
            .from('term_publishing_status')
            .select('*')
            .eq('term_id', termId)
            .in('class_id', classIds);
            
        if (pubErr) throw pubErr;
        
        // Build map for quick access
        const pubMap = {};
        if (pubData) {
            pubData.forEach(p => pubMap[p.class_id] = p.is_published);
        }
        
        // 3. Render
        tbody.innerHTML = classes.map(c => {
            const isPublished = pubMap[c.id] === true;
            const masterName = c.users ? `${c.users.first_name} ${c.users.last_name}` : '<span class="text-danger fw-bold">Unassigned</span>';
            
            // Dummy readiness tracker for UI. In production, this would query grades count vs student count.
            const readinessHtml = `<div class="progress" style="height: 8px;"><div class="progress-bar bg-success" style="width: 100%;"></div></div><small class="text-muted">100% Data Synced</small>`;
            
            const publishBtnAttr = isPublished ? 'checked' : '';
            const publishLabelText = isPublished ? 'Published <i class="fas fa-check-circle text-success ms-1"></i>' : 'Draft Mode';
            
            return `
            <tr>
                <td class="fw-bold text-dark fs-6">${c.name}</td>
                <td>${masterName}</td>
                <td style="width: 25%;" class="text-center align-middle">${readinessHtml}</td>
                <td class="text-center align-middle">
                    <span id="pubLabel_${c.id}" class="badge ${isPublished ? 'bg-success' : 'bg-warning text-dark'}">${publishLabelText}</span>
                </td>
                <td class="text-end align-middle">
                    <button class="btn btn-sm btn-outline-info fw-bold me-1" onclick="adminViewClass('${c.id}')" title="Preview Grid"><i class="fas fa-eye"></i> View</button>
                    <button class="btn btn-sm btn-secondary fw-bold me-2" onclick="adminBulkPrintClass('${c.id}', '${c.name.replace(/'/g, "\\'")}')" title="Print All Reports"><i class="fas fa-print"></i> Bulk Print</button>
                    <div class="form-check form-switch custom-switch-lg d-inline-block m-0" style="transform: scale(1.2); vertical-align: middle;">
                        <input class="form-check-input" type="checkbox" role="switch" id="pubSwitch_${c.id}" ${publishBtnAttr} onchange="toggleReportPublishing('${c.id}', '${dept}', this.checked)">
                    </div>
                </td>
            </tr>
            `;
        }).join('');
        
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle"></i> Error: ${err.message}</td></tr>`;
    }
};

window.toggleReportPublishing = async function(classId, dept, isPublished) {
    const termId = window._publishingTermId;
    if (!termId) return;
    
    const label = document.getElementById(`pubLabel_${classId}`);
    
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const userId = session ? session.user.id : null;
        
        const payload = {
            term_id: termId,
            class_id: classId,
            department: dept,
            is_published: isPublished,
            published_by: userId,
            published_at: isPublished ? new Date().toISOString() : null
        };
        
        const { error } = await supabaseClient
            .from('term_publishing_status')
            .upsert(payload, { onConflict: 'term_id, class_id' });
            
        if (error) throw error;
        
        // Update local label
        if(isPublished) {
            label.className = 'badge bg-success';
            label.innerHTML = 'Published <i class="fas fa-check-circle text-white ms-1"></i>';
        } else {
            label.className = 'badge bg-warning text-dark';
            label.innerHTML = 'Draft Mode';
        }
        
    } catch (err) {
        alert("Failed to toggle publish status: " + err.message);
        // Revert switch visually
        const sw = document.getElementById(`pubSwitch_${classId}`);
        if(sw) sw.checked = !isPublished;
    }
};

window.adminViewClass = function(classId) {
    if(!classId) return;
    localStorage.setItem('adminViewingClassId', classId);
    
    // Attempt dynamic navigation
    if(typeof loadPageDynamic === 'function') {
        loadPageDynamic('class-reports');
    } else {
        alert("Unable to navigate dynamically.");
    }
};

window.adminBulkPrintClass = async function(classId, className) {
    if(!classId) return;
    const termId = window._publishingTermId;
    if(!termId) return alert("System error: No active term identified.");
    
    // Inject Loading Overlay natively
    const oldOverlay = document.getElementById('bPrintOverlay');
    if(oldOverlay) oldOverlay.remove();
    const overlay = document.createElement('div');
    overlay.id = 'bPrintOverlay';
    overlay.style = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.85); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:white;';
    overlay.innerHTML = `
        <div class="spinner-border text-primary" style="width: 4rem; height: 4rem;" role="status"></div>
        <h3 class="mt-4 fw-bold">Generating Bulk Report PDF</h3>
        <p class="text-muted">Fetching all students and crunching grades... Please do not close this window.</p>
        <p id="bPrintCount" class="text-info fw-bold fs-5"></p>
    `;
    document.body.appendChild(overlay);
    
    try {
        const pCount = document.getElementById('bPrintCount');
        
        // 1. Fetch Students
        pCount.textContent = "Loading Roster...";
        const { data: students, error: errSt } = await supabaseClient.from('students').select('*').eq('class_id', classId).eq('status', 'active').order('first_name');
        if(errSt || !students || students.length === 0) throw new Error("No active students found in this class.");
        
        // 2. Fetch Grades, Remarks, Attendance
        pCount.textContent = "Pulling Term Data...";
        const stuIds = students.map(s => s.id);
        const [
            { data: grades }, 
            { data: remarks }, 
            { data: attendance }, 
            { data: activeTermDef },
            { data: allSubjects },
            { data: gradingSystem }
        ] = await Promise.all([
            supabaseClient.from('grades').select('*').eq('term_id', termId).in('student_id', stuIds),
            supabaseClient.from('remarks').select('*').eq('term_id', termId).in('student_id', stuIds),
            supabaseClient.from('attendance').select('*').eq('term_id', termId).in('student_id', stuIds),
            supabaseClient.from('academic_settings').select('*').eq('id', termId).single(),
            supabaseClient.from('subjects').select('id, name'),
            supabaseClient.from('grading_system').select('*').order('min_score', { ascending: false })
        ]);
        
        const subjectDict = {};
        if (allSubjects) allSubjects.forEach(s => subjectDict[s.id] = s.name);
        
        // 3. Compile Raw Structure iteratively without sorting (Bulk print doesn't need ranking unless printed in order)
        pCount.textContent = "Merging HTML Fragments (This takes a moment)...";
        let masterHtml = '';
        const scaleFactor = gradingSystem || [];
        
        for(let i=0; i<students.length; i++) {
            const stu = students[i];
            
            // Build pseudo payload matching `historical-results.js` requirements
            const payloadStudent = {
                id: stu.id,
                first_name: stu.first_name,
                last_name: stu.last_name,
                student_id_number: stu.student_id_number,
                program: '', // Add mapping if program exists
                grades: grades ? grades.filter(g => g.student_id === stu.id) : [],
                remarks: remarks ? remarks.filter(r => r.student_id === stu.id) : [],
                attendance: attendance ? attendance.find(a => a.student_id === stu.id) : null,
                classes: { name: className }
            };
            
            const singleReportHtml = await window.compileTermReportCard(
                payloadStudent, 
                termId, 
                subjectDict, 
                activeTermDef, 
                scaleFactor
            );
            
            // Append with aggressive CSS page-breaking to split natively in PDF Formatter
            masterHtml += `<div>${singleReportHtml}</div><div class="html2pdf__page-break"></div>`;
        }
        
        // 4. Inject into hidden DOM node securely
        pCount.textContent = "Mounting to Engine...";
        const hiddenBin = document.createElement('div');
        hiddenBin.style.position = 'absolute';
        hiddenBin.style.left = '-9999px';
        hiddenBin.style.top = '-9999px';
        hiddenBin.style.width = '800px';
        hiddenBin.style.backgroundColor = '#ffffff';
        hiddenBin.innerHTML = masterHtml;
        document.body.appendChild(hiddenBin);
        
        pCount.textContent = "Finalizing PDF Download. Browser may freeze briefly...";
        
        // 5. Fire html2pdf
        const opt = {
            margin:       0,
            filename:     `${className.replace(/\s+/g,'_')}_BulkReports.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, windowWidth: 800, logging: false },
            jsPDF:        { unit: 'in', format: 'A4', orientation: 'portrait' },
            pagebreak:    { mode: 'css' }
        };
        
        await new Promise(r => setTimeout(r, 2000)); // Allow browser to download remote image assets
        await html2pdf().set(opt).from(hiddenBin).save();
        
        document.body.removeChild(hiddenBin);
        overlay.remove();
        
    } catch(err) {
        console.error(err);
        overlay.innerHTML = `
            <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
            <h3 class="mb-3 text-danger">Generation Failed</h3>
            <p>${err.message}</p>
            <button class="btn btn-light mt-4" onclick="document.getElementById('bPrintOverlay').remove()">Close Error</button>
        `;
    }
};
