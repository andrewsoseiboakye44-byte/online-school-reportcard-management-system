// js/admin/academic-settings.js

var academicInitModule = window.initModule;
window.initModule = function(page) {
    if (academicInitModule) academicInitModule(page);
    
    if (page === 'academic-settings') {
        loadAcademicSettings();
        loadGradingSystem();
    }
};

let currentGradingScale = [];

function renderVisualCalendar(startDate, endDate) {
    const container = document.getElementById('visualCalendarContainer');
    if (!container) return;
    
    if (!startDate || !endDate) {
        container.innerHTML = '<div class="text-center py-4 text-muted">Please define a Term Start Date and Term End Date to generate the visual calendar.</div>';
        return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
        container.innerHTML = '<div class="alert alert-danger mb-0">Invalid date range.</div>';
        return;
    }

    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const startMonth = start.toLocaleString('default', { month: 'short', year: 'numeric' });
    const endMonth = end.toLocaleString('default', { month: 'short', year: 'numeric' });

    let html = `
        <div class="text-center mb-3">
            <h6 class="fw-bold text-dark mb-1">${startMonth} &mdash; ${endMonth}</h6>
            <span class="badge bg-light text-primary border shadow-sm">${totalDays} Total Days in Term</span>
        </div>
        <div class="d-flex align-items-center justify-content-between px-2 py-3 bg-light rounded" style="border-left: 4px solid var(--primary-green);">
            <div class="text-center" style="flex:1;">
                <small class="text-muted d-block fw-bold text-uppercase" style="font-size:0.7rem;">Starts</small>
                <span class="fw-bold text-success fs-5">${start.getDate()}</span>
                <span class="text-dark">${start.toLocaleString('default', { month: 'short' })}</span>
            </div>
            <div class="text-muted"><i class="fas fa-long-arrow-alt-right fa-lg"></i></div>
            <div class="text-center" style="flex:1;">
                <small class="text-muted d-block fw-bold text-uppercase" style="font-size:0.7rem;">Ends</small>
                <span class="fw-bold text-danger fs-5">${end.getDate()}</span>
                <span class="text-dark">${end.toLocaleString('default', { month: 'short' })}</span>
            </div>
        </div>
        <div class="mt-3 text-center">
            <p class="text-muted" style="font-size: 0.85rem;"><i class="fas fa-info-circle me-1"></i> Note: This defines the active timeframe for attendance logging and term reporting.</p>
        </div>
    `;
    
    container.innerHTML = html;
}

async function loadAcademicSettings() {
    try {
        const { data, error } = await supabaseClient
            .from('academic_settings')
            .select('*')
            .eq('is_active', true)
            .maybeSingle();
            
        if (data) {
            document.getElementById('acadYear').value = data.academic_year;
            document.getElementById('acadTerm').value = data.current_term;
            document.getElementById('acadStart').value = data.term_start_date;
            document.getElementById('acadEnd').value = data.term_end_date;
            if(document.getElementById('acadNextStart')) document.getElementById('acadNextStart').value = data.next_term_begin_date || '';
            document.getElementById('acadAttendances').value = data.total_attendances;
            
            window._academicTermDbId = data.id;
            
            renderVisualCalendar(data.term_start_date, data.term_end_date);
        }
    } catch(err) {
        console.error("Error loading academic settings:", err);
    }
}

document.addEventListener('submit', async function(e) {
    if (e.target && e.target.id === 'academicConfigForm') {
        e.preventDefault();
        
        const btn = document.querySelector('button[form="academicConfigForm"]');
        const origText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
        
        try {
            const year = document.getElementById('acadYear').value;
            const term = document.getElementById('acadTerm').value;
            const start = document.getElementById('acadStart').value || null;
            const end = document.getElementById('acadEnd').value || null;
            const nextStart = document.getElementById('acadNextStart') ? document.getElementById('acadNextStart').value || null : null;
            const attendances = parseInt(document.getElementById('acadAttendances').value) || 60;
            
            const payload = {
                academic_year: year,
                current_term: term,
                term_start_date: start,
                term_end_date: end,
                next_term_begin_date: nextStart,
                total_attendances: attendances,
                is_active: true
            };
            
            let req;
            if (window._academicTermDbId) {
                req = supabaseClient.from('academic_settings').update(payload).eq('id', window._academicTermDbId);
            } else {
                // If it's a completely new DB, deactivate all and insert
                await supabaseClient.from('academic_settings').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000');
                req = supabaseClient.from('academic_settings').insert([payload]);
            }
            
            const { error } = await req;
            
            if (error) throw error;
            alert("Academic Configuration Saved Successfully!");
            renderVisualCalendar(start, end);
        } catch(err) {
            alert("Failed to save: " + err.message);
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    }
    
    // Grading Form
    if (e.target && e.target.id === 'gradingForm') {
        e.preventDefault();
        const id = document.getElementById('gradeId').value;
        const letter = document.getElementById('gradeLetter').value;
        const min = parseFloat(document.getElementById('gradeMin').value);
        const max = parseFloat(document.getElementById('gradeMax').value);
        const remark = document.getElementById('gradeRemark').value;
        const badge = document.getElementById('gradeBadge').value;
        
        try {
            const payload = {
                grade: letter,
                min_score: min,
                max_score: max,
                remark: remark,
                badge_class: badge
            };
            
            if (id) {
                payload.id = id;
            }
            
            const btn = document.getElementById('btnSaveGrade');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            
            const { error } = await supabaseClient.from('grading_system').upsert(payload);
            if (error) throw error;
            
            const modalEl = document.getElementById('gradingModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if(modal) modal.hide();
            
            await loadGradingSystem();
        } catch(err) {
            alert("Failed to save grade boundary: " + err.message);
        } finally {
            const btn = document.getElementById('btnSaveGrade');
            btn.disabled = false;
            btn.innerHTML = 'Save Boundary';
        }
    }
});

async function loadGradingSystem() {
    const list = document.getElementById('dynamicGradingList');
    if (!list) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('grading_system')
            .select('*')
            .order('min_score', { ascending: false });
            
        if (error) throw error;
        
        currentGradingScale = data || [];
        
        if (currentGradingScale.length === 0) {
            list.innerHTML = `<li class="list-group-item text-center py-4 text-muted">No grading bounds configured yet.<br><small>Click + to add.</small></li>`;
            return;
        }
        
        list.innerHTML = currentGradingScale.map(g => `
            <li class="list-group-item d-flex justify-content-between align-items-center" style="cursor: pointer;" onclick='editGrade(${JSON.stringify(g)})'>
                <div>
                    <span class="badge ${g.badge_class || 'bg-secondary'} me-2 fs-6">${g.grade}</span>
                    <span class="fw-bold">${g.min_score}% - ${g.max_score}%</span>
                </div>
                <div class="text-end">
                    <small class="text-dark d-block">${g.remark}</small>
                </div>
            </li>
        `).join('');
        
    } catch(err) {
        console.error("Grading loading error:", err);
        list.innerHTML = `<li class="list-group-item text-danger py-4">Failed to load grading system: <br>${err.message}</li>`;
    }
}

window.openAddGradeModal = function() {
    document.getElementById('gradingForm').reset();
    document.getElementById('gradeId').value = '';
    document.getElementById('btnDeleteGrade').classList.add('d-none');
    
    const modalEl = document.getElementById('gradingModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl);
    modal.show();
};

window.editGrade = function(gradeObj) {
    document.getElementById('gradeId').value = gradeObj.id;
    document.getElementById('gradeLetter').value = gradeObj.grade;
    document.getElementById('gradeMin').value = gradeObj.min_score;
    document.getElementById('gradeMax').value = gradeObj.max_score;
    document.getElementById('gradeRemark').value = gradeObj.remark;
    document.getElementById('gradeBadge').value = gradeObj.badge_class || 'bg-secondary';
    
    document.getElementById('btnDeleteGrade').classList.remove('d-none');
    
    const modalEl = document.getElementById('gradingModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl);
    modal.show();
};

window.deleteGrade = async function() {
    const id = document.getElementById('gradeId').value;
    if (!id) return;
    
    if(!confirm("Are you sure you want to delete this grade boundary?")) return;
    
    try {
        const btn = document.getElementById('btnDeleteGrade');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        const { error } = await supabaseClient.from('grading_system').delete().eq('id', id);
        if (error) throw error;
        
        const modalEl = document.getElementById('gradingModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if(modal) modal.hide();
        
        await loadGradingSystem();
    } catch(err) {
        alert("Failed to delete: " + err.message);
    } finally {
        const btn = document.getElementById('btnDeleteGrade');
        btn.disabled = false;
        btn.innerHTML = 'Delete';
    }
};

// Auto-execute if the DOM elements are already present 
// (handles async loading via SPA router)
if (document.getElementById('dynamicGradingList')) {
    loadAcademicSettings();
    loadGradingSystem();
}

// ---------------------------------------------------------------------------
// END OF YEAR BULK PROMOTION SYSTEM
// ---------------------------------------------------------------------------

window.openPromotionModal = async function() {
    console.log("openPromotionModal clicked!");
    const tbody = document.getElementById('promotionMappingBody');
    if (!tbody) {
        alert("System Error: Cannot find promotionMappingBody in the DOM!");
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading class dynamics...</td></tr>';
    
    try {
        const modalEl = document.getElementById('promotionModal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        // Fetch all classes
        const { data: classes, error } = await supabaseClient
            .from('classes')
            .select('id, name, department')
            .order('department')
            .order('name');
            
        if (error) throw error;
        
        if (!classes || classes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-danger">No active classes found in the database.</td></tr>';
            return;
        }
        
        // Render UI
        tbody.innerHTML = classes.map(cls => {
            // Predict next class name standard algorithms
            let predictedTargetId = 'none';
            
            const numMatch = cls.name.match(/\d+/);
            if (numMatch) {
                const currentNum = parseInt(numMatch[0]);
                if (currentNum === 9 || (cls.name.toLowerCase().includes('basic') && currentNum === 9)) {
                    // Graduating class
                    predictedTargetId = 'graduate';
                } else {
                    const nextNum = currentNum + 1;
                    const predictedName = cls.name.replace(numMatch[0], nextNum.toString());
                    const potentialMatch = classes.find(c => c.name === predictedName || c.name.startsWith(predictedName));
                    if (potentialMatch) {
                        predictedTargetId = potentialMatch.id;
                    }
                }
            } else if (cls.name.toLowerCase().includes('preschool') || cls.name.toLowerCase().includes('nursery')) {
                // If it's a kindergarten trying to map to a basic 1
                const basicOne = classes.find(c => c.name.toLowerCase().includes('basic 1') || c.name.toLowerCase().includes('b1'));
                if (basicOne) predictedTargetId = basicOne.id;
            }
            
            // Build Dropdown
            let optionsHtml = `<option value="none" ${predictedTargetId === 'none' ? 'selected' : ''}>-- Do Not Promote (Keep) --</option>`;
            optionsHtml += `<option value="graduate" ${predictedTargetId === 'graduate' ? 'selected' : ''} class="text-danger fw-bold">[ Graduate / Archive ]</option>`;
            
            classes.forEach(targetClass => {
                const isSelected = targetClass.id === predictedTargetId ? 'selected' : '';
                optionsHtml += `<option value="${targetClass.id}" ${isSelected}>${targetClass.name} (${targetClass.department.replace('_', ' ')})</option>`;
            });
            
            return `
            <tr class="promotion-row" data-class-id="${cls.id}">
                <td class="fw-bold text-dark fs-6">${cls.name} <br><small class="text-muted fw-normal">${cls.department.replace('_', ' ').toUpperCase()}</small></td>
                <td class="text-center text-muted"><i class="fas fa-arrow-right"></i></td>
                <td>
                    <select class="form-select form-select-sm shadow-sm border-secondary target-class-select">
                        ${optionsHtml}
                    </select>
                </td>
            </tr>
            `;
        }).join('');
        
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-danger"><i class="fas fa-exclamation-circle me-2"></i> Error: ${err.message}</td></tr>`;
    }
};

window.executeBulkPromotion = async function() {
    const btn = document.getElementById('executePromotionBtn');
    const rows = document.querySelectorAll('.promotion-row');
    
    if (!rows || rows.length === 0) return;
    
    // Build Mappings
    const mappings = [];
    rows.forEach(row => {
        const oldId = row.getAttribute('data-class-id');
        const targetVal = row.querySelector('.target-class-select').value;
        
        if (targetVal !== 'none' && oldId !== targetVal) {
            mappings.push({ old_id: oldId, target: targetVal });
        }
    });
    
    if (mappings.length === 0) {
        alert("No promotions configured. All classes are set to 'Do Not Promote'.");
        return;
    }
    
    const count = mappings.length;
    const confirmExec = confirm(`CRITICAL ACTION:\n\nYou are about to execute a bulk promotion across ${count} classes.\n\nAre you absolutely sure you want to run this? This will immediately move students to their new classes or graduate them from active view!`);
    if (!confirmExec) return;
    
    const ogText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Executing Massive Migration...';
    btn.disabled = true;
    
    try {
        const { data: students, error: studentErr } = await supabaseClient
            .from('students')
            .select('id, class_id')
            .eq('status', 'active');
            
        if (studentErr) throw studentErr;
        
        if (!students || students.length === 0) {
            throw new Error("No active students found in the database to promote.");
        }
        
        const updateGroups = {}; 
        const graduateIds = [];
        let totalMoved = 0;
        
        mappings.forEach(m => {
            const applicableStudentIds = students.filter(s => s.class_id === m.old_id).map(s => s.id);
            if (applicableStudentIds.length === 0) return;
            
            if (m.target === 'graduate') {
                graduateIds.push(...applicableStudentIds);
                totalMoved += applicableStudentIds.length;
            } else {
                if (!updateGroups[m.target]) updateGroups[m.target] = [];
                updateGroups[m.target].push(...applicableStudentIds);
                totalMoved += applicableStudentIds.length;
            }
        });
        
        for (const targetClassId in updateGroups) {
            const targetIds = updateGroups[targetClassId];
            if (targetIds.length > 0) {
                const { error: pushErr } = await supabaseClient
                    .from('students')
                    .update({ class_id: targetClassId })
                    .in('id', targetIds);
                    
                if (pushErr) console.error("Error migrating to class " + targetClassId, pushErr);
            }
        }
        
        if (graduateIds.length > 0) {
            const { error: gradErr } = await supabaseClient
                .from('students')
                .update({ class_id: null, status: 'graduated' })
                .in('id', graduateIds);
                
            if (gradErr) console.error("Error graduating students", gradErr);
        }
        
        alert(`✅ Massive Academic Promotion Complete!\n\n${totalMoved} students have been successfully transitioned to their new academic blocks.`);
        
        const modalEl = document.getElementById('promotionModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        
    } catch (err) {
        alert("System Migration Failed: " + err.message);
    } finally {
        btn.innerHTML = ogText;
        btn.disabled = false;
    }
};
