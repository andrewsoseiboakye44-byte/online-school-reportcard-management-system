// grading.js - Handles Teacher Portals (Subject Teacher & Class Teacher)

const adminInitModule = window.initModule;
window.initModule = function(page) {
    // Call the original admin init if it exists
    if (adminInitModule) adminInitModule(page);
    
    // Teacher Routes
    if (page === 'my-subjects') loadMySubjects();
    else if (page === 'grading-sheet') loadGradingMatrix();
    else if (page === 'my-class') {
        if (typeof window.loadMyClassRoster === 'function') {
            window.loadMyClassRoster();
        }
    }
};

// ---------------------------------------------------------------------------
// 1. MY SUBJECTS VISUALIZER 
// ---------------------------------------------------------------------------
window.loadMySubjects = async function() {
    const container = document.getElementById('teacherSubjectsContainer');
    const form = document.getElementById('gradingSelectionForm');
    const loading = document.getElementById('selectionLoading');
    const classSelect = document.getElementById('gradingClassSelect');
    const subjectSelect = document.getElementById('gradingSubjectSelect');
    const openBtn = document.getElementById('openClassBtn');
    
    if (!container || !form) return;
    
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error("Authentication required.");
        
        // Fetch subjects assigned to this specific teacher
        const { data: assignments, error } = await supabaseClient
            .from('subject_teachers')
            .select(`
                id,
                subject_id,
                class_id,
                subjects ( name, department ),
                classes ( name, capacity )
            `)
            .eq('teacher_id', session.user.id);
            
        if (error) throw error;
        
        if (!assignments || assignments.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <div style="font-size: 3rem; color: #e2e8f0; margin-bottom: 1rem;"><i class="fas fa-folder-open"></i></div>
                    <h5 class="text-dark">No Subjects Assigned</h5>
                    <p class="text-muted">You have not been assigned to teach any subjects yet. Contact the Administrator.</p>
                </div>
            `;
            return;
        }
        
        // Hide loading, show form
        loading.style.display = 'none';
        form.style.display = 'block';
        
        // Group assignments by class to populate class dropdown
        const classMap = new Map();
        assignments.forEach(a => {
            if (a.classes) {
                if (!classMap.has(a.class_id)) {
                    classMap.set(a.class_id, {
                        id: a.class_id,
                        name: a.classes.name,
                        subjects: []
                    });
                }
                if (a.subjects) {
                    classMap.get(a.class_id).subjects.push({
                        id: a.subject_id,
                        name: a.subjects.name,
                        department: a.subjects.department
                    });
                }
            }
        });
        
        // Populate class dropdown
        classSelect.innerHTML = '<option value="" selected disabled>Choose a class...</option>';
        for (const [id, c] of classMap.entries()) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = c.name;
            classSelect.appendChild(opt);
        }
        
        // Store classMap for easy access
        window.teacherClassMap = classMap;
        
        // Event Listeners
        // Remove old listeners by replacing elements to avoid duplicates on re-render
        const newClassSelect = classSelect.cloneNode(true);
        classSelect.parentNode.replaceChild(newClassSelect, classSelect);
        
        const newSubjectSelect = subjectSelect.cloneNode(true);
        subjectSelect.parentNode.replaceChild(newSubjectSelect, subjectSelect);
        
        const newOpenBtn = openBtn.cloneNode(true);
        openBtn.parentNode.replaceChild(newOpenBtn, openBtn);
        
        newClassSelect.addEventListener('change', function() {
            const selectedClassId = this.value;
            newSubjectSelect.innerHTML = '<option value="" selected disabled>Select a subject...</option>';
            
            if (selectedClassId && window.teacherClassMap.has(selectedClassId)) {
                const subjects = window.teacherClassMap.get(selectedClassId).subjects;
                subjects.forEach(sub => {
                    const opt = document.createElement('option');
                    opt.value = sub.id;
                    opt.textContent = sub.name + " (" + (sub.department || 'General').toUpperCase().replace('_', ' ') + ")";
                    opt.dataset.cleanName = sub.name;
                    newSubjectSelect.appendChild(opt);
                });
                newSubjectSelect.disabled = false;
            } else {
                newSubjectSelect.disabled = true;
            }
            newOpenBtn.disabled = true; // reset button
        });
        
        newSubjectSelect.addEventListener('change', function() {
            if (this.value) {
                newOpenBtn.disabled = false;
            } else {
                newOpenBtn.disabled = true;
            }
        });
        
        newOpenBtn.addEventListener('click', function() {
            const cId = newClassSelect.value;
            const sId = newSubjectSelect.value;
            const cName = newClassSelect.options[newClassSelect.selectedIndex].text;
            const sName = newSubjectSelect.options[newSubjectSelect.selectedIndex].dataset.cleanName;
            
            if (cId && sId) {
                openGradingSheet(cId, sId, cName, sName);
            }
        });
        
    } catch(err) {
        container.innerHTML = `
            <div class="text-center py-5">
                <p class="text-danger fw-bold"><i class="fas fa-exclamation-triangle me-2"></i> Failed to load assignments: ${err.message}</p>
            </div>
        `;
    }
};

// Routing stub for the Grading Sheet Matrix
window.openGradingSheet = function(classId, subjectId, className, subjectName) {
    // Store context for the grading module to read when the page loads
    window.currentGradingSession = {
        classId, subjectId, className, subjectName
    };
    
    // Inject active grading into standard dashboard loader
    // This expects our generic dashboard.html loader framework.
    if(typeof window.loadPageDynamic === 'function') {
        window.loadPageDynamic('grading-sheet');
    } else {
        alert("Dashboard routing failure. Please refresh.");
    }
};

window.loadGradingMatrix = async function() {
    const session = window.currentGradingSession;
    if(!session) {
        document.getElementById('dynamicContent').innerHTML = '<div class="alert alert-danger m-4">Grading Session Expired. Go back to My Subjects.</div>';
        return;
    }
    
    // Set UI Headers based on session
    document.getElementById('gradingClassName').textContent = session.className;
    document.getElementById('gradingSubjectName').textContent = session.subjectName;
    document.getElementById('gradingModeBadge').textContent = 'Continuous & Exam Grading';
    
    const tbody = document.getElementById('gradingTableBody');
    tbody.innerHTML = '<tr><td colspan="12" class="text-center py-5"><div class="spinner-border text-primary-custom"></div><p class="mt-2 text-muted fw-bold">Generating Grading Matrix...</p></td></tr>';
    
    try {
        // Query active students in this class
        const { data: students, error: studentError } = await supabaseClient
            .from('students')
            .select('id, student_id_number, first_name, last_name')
            .eq('class_id', session.classId)
            .eq('status', 'active')
            .order('first_name');
            
        if (studentError) throw studentError;
        
        if(!students || students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-4 text-danger fw-bold">No active students found in this class yet.</td></tr>';
            return;
        }
        
        // Fetch current active term definition to ensure grades map to the right term.
        const { data: activeTerm } = await supabaseClient
            .from('academic_settings')
            .select('id')
            .eq('is_active', true)
            .maybeSingle();
            
        let termId = activeTerm ? activeTerm.id : null;
        
        // Fetch existing grades for this matrix
        let existingGrades = [];
        if(termId) {
            const { data: grades } = await supabaseClient
                .from('grades')
                .select('*')
                .eq('subject_id', session.subjectId)
                .eq('term_id', termId);
            if(grades) existingGrades = grades;
        }
        
        // Thead is now natively in grading-sheet.html, so we no longer need to dynamically replace it.

        // Map students into HTML row by row
        tbody.innerHTML = students.map((s, i) => {
            const gradeRec = existingGrades.find(g => g.student_id === s.id) || {};
            
            let c1 = gradeRec.class_exercise || '';
            let c2 = gradeRec.group_work || '';
            let c3 = gradeRec.project_work || '';
            let c4 = gradeRec.individual_assessment || '';
            let exm = gradeRec.raw_exam_score || '';
            
            return `
            <tr data-student-id="${s.id}" class="grade-row">
                <td class="text-muted text-center align-middle d-none d-md-table-cell">${i + 1}</td>
                <td class="align-middle d-none d-md-table-cell"><span class="fw-bold" style="color:var(--primary-green); font-family:monospace;">${s.student_id_number}</span></td>
                <td class="align-middle fw-bold text-dark" style="min-width:140px; font-size:0.9rem;">${s.first_name} ${s.last_name}</td>
                
                <td class="align-middle px-1"><input type="number" class="form-control form-control-sm text-center fw-bold mark-input sba-c1 px-1" style="min-width:50px;" min="0" max="15" placeholder="0" value="${c1}"></td>
                <td class="align-middle px-1"><input type="number" class="form-control form-control-sm text-center fw-bold mark-input sba-c3 px-1" style="min-width:50px;" min="0" max="15" placeholder="0" value="${c3}"></td>
                <td class="align-middle px-1"><input type="number" class="form-control form-control-sm text-center fw-bold mark-input sba-c4 px-1" style="min-width:50px;" min="0" max="15" placeholder="0" value="${c4}"></td>
                <td class="align-middle px-1"><input type="number" class="form-control form-control-sm text-center fw-bold mark-input sba-c2 px-1" style="min-width:50px;" min="0" max="15" placeholder="0" value="${c2}"></td>
                
                <td class="align-middle text-center bg-light px-1">
                    <span class="fw-bold text-dark sba-scaled">--</span>
                </td>
                
                <td class="align-middle px-1 border-start border-end">
                    <input type="number" class="form-control form-control-sm text-center fw-bold mark-input exam-input px-1" style="min-width:60px;" min="0" max="100" placeholder="Raw" value="${exm}">
                </td>

                <td class="align-middle text-center bg-light">
                    <span class="fw-bold text-dark exam-scaled">--</span>
                </td>
                
                <td class="align-middle text-center" style="background-color: var(--light-bg);">
                    <span class="fw-bold fs-5 text-primary-red total-score">0.0</span>
                    <input type="hidden" class="numeric-total" value="0">
                </td>
                
                <td class="align-middle text-center">
                    <span class="badge bg-secondary position-badge fs-6">--</span>
                </td>

                <td class="align-middle text-center">
                    <button type="button" class="btn btn-sm btn-light calc-next-btn shadow-sm" title="Calculate & Move to Next Student">
                        <i class="fas fa-calculator text-primary-custom" style="font-size: 1.1rem;"></i>
                    </button>
                </td>
            </tr>
            `;
        }).join('');
        
        // Attach auto-calc listeners
        document.querySelectorAll('.mark-input').forEach(inp => {
            inp.addEventListener('input', function(e) {
                calculateRowTotal(e.target.closest('tr'));
                recalculatePositions();
            });
        });

        // Attach calc-next listener
        document.querySelectorAll('.calc-next-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                const tr = btn.closest('tr');
                calculateRowTotal(tr);
                recalculatePositions();
                
                // Visual feedback checkmark
                const icon = btn.querySelector('i');
                icon.className = 'fas fa-check text-success';
                setTimeout(() => { icon.className = 'fas fa-calculator text-primary-custom'; }, 800);
                
                // Focus next row
                const nextRow = tr.nextElementSibling;
                if(nextRow && nextRow.classList.contains('grade-row')) {
                    const firstInput = nextRow.querySelector('.sba-c1');
                    if(firstInput) {
                        firstInput.focus();
                        firstInput.select();
                    }
                } else {
                    const saveBtn = document.getElementById('saveGradingMatrixBtn');
                    if(saveBtn) saveBtn.focus();
                }
            });
        });

        // Initial bulk calculation
        document.querySelectorAll('.grade-row').forEach(row => calculateRowTotal(row));
        recalculatePositions();
        
    } catch(err) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-4 text-danger fw-bold">Failed to load grading matrix: ' + err.message + '</td></tr>';
    }
};

function calculateRowTotal(row) {
    if (!row) return;

    // Sum the 4 SBA components (Max 15 each)
    let c1 = parseFloat(row.querySelector('.sba-c1').value);
    let c2 = parseFloat(row.querySelector('.sba-c2').value);
    let c3 = parseFloat(row.querySelector('.sba-c3').value);
    let c4 = parseFloat(row.querySelector('.sba-c4').value);
    
    if(isNaN(c1)) c1 = 0; if(c1 > 15) { row.querySelector('.sba-c1').value = 15; c1 = 15; }
    if(isNaN(c2)) c2 = 0; if(c2 > 15) { row.querySelector('.sba-c2').value = 15; c2 = 15; }
    if(isNaN(c3)) c3 = 0; if(c3 > 15) { row.querySelector('.sba-c3').value = 15; c3 = 15; }
    if(isNaN(c4)) c4 = 0; if(c4 > 15) { row.querySelector('.sba-c4').value = 15; c4 = 15; }
    if(c1 < 0) { row.querySelector('.sba-c1').value = 0; c1 = 0; }
    if(c2 < 0) { row.querySelector('.sba-c2').value = 0; c2 = 0; }
    if(c3 < 0) { row.querySelector('.sba-c3').value = 0; c3 = 0; }
    if(c4 < 0) { row.querySelector('.sba-c4').value = 0; c4 = 0; }
    
    let totalSbaRaw = c1 + c2 + c3 + c4; // Max 60
    let sbaScaled = (totalSbaRaw / 60) * 50; // Scaled to 50
    if(isNaN(sbaScaled)) sbaScaled = 0;
    
    row.querySelector('.sba-scaled').textContent = parseFloat(sbaScaled.toFixed(1));
    
    // Exam Out of 100
    let rawExam = parseFloat(row.querySelector('.exam-input').value);
    if(isNaN(rawExam)) rawExam = 0;
    if(rawExam > 100) { row.querySelector('.exam-input').value = 100; rawExam = 100; }
    if(rawExam < 0) { row.querySelector('.exam-input').value = 0; rawExam = 0; }
    
    let examScaled = (rawExam / 100) * 50; // Scaled to 50
    if(isNaN(examScaled)) examScaled = 0;

    row.querySelector('.exam-scaled').textContent = parseFloat(examScaled.toFixed(1));
    
    // Final Total
    const totalScore = parseFloat((sbaScaled + examScaled).toFixed(1));
    
    row.querySelector('.total-score').textContent = totalScore;
    row.querySelector('.numeric-total').value = totalScore;
}

function recalculatePositions() {
    const rows = Array.from(document.querySelectorAll('.grade-row'));
    
    // Create an object array of scores
    const studentScores = rows.map(row => {
        let sc = parseFloat(row.querySelector('.numeric-total').value) || 0;
        return {
            row: row,
            score: sc
        };
    });
    
    // Sort descending by score
    studentScores.sort((a, b) => b.score - a.score);
    
    // Assign position ranks
    let currentRank = 1;
    let actualPositionCount = 1;
    let previousScore = -1;
    
    studentScores.forEach((item, index) => {
        if(item.score === 0) {
            item.row.querySelector('.position-badge').textContent = '--';
            item.row.querySelector('.position-badge').className = 'badge bg-secondary position-badge fs-6';
            return;
        }

        if (item.score !== previousScore) {
            currentRank = actualPositionCount;
            previousScore = item.score;
        }
        
        let suffix = 'th';
        if (currentRank % 10 === 1 && currentRank % 100 !== 11) suffix = 'st';
        else if (currentRank % 10 === 2 && currentRank % 100 !== 12) suffix = 'nd';
        else if (currentRank % 10 === 3 && currentRank % 100 !== 13) suffix = 'rd';

        const badge = item.row.querySelector('.position-badge');
        badge.textContent = `${currentRank}${suffix}`;
        
        // Highlight top 3
        if(currentRank === 1) badge.className = 'badge bg-success position-badge fs-6 shadow';
        else if(currentRank === 2) badge.className = 'badge bg-info position-badge fs-6 shadow';
        else if(currentRank === 3) badge.className = 'badge bg-primary position-badge fs-6 shadow';
        else badge.className = 'badge bg-dark position-badge fs-6 shadow-sm';
        
        actualPositionCount++;
    });
}

window.saveGradingMatrix = async function() {
    const session = window.currentGradingSession;
    if(!session) return alert("Session expired.");
    
    const btn = document.getElementById('saveGradingMatrixBtn');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Saving...'; }
    
    try {
        // Fetch active term again
        const { data: activeTerm } = await supabaseClient
            .from('academic_settings')
            .select('id')
            .eq('is_active', true)
            .maybeSingle();
            
        if (!activeTerm) throw new Error("No active academic term found. Contact Administrator.");
        const termId = activeTerm.id;
        
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Authentication required to save grades.");
        
        // Build Upsert Payload
        const rows = document.querySelectorAll('#gradingTableBody tr[data-student-id]');
        const upsertPayload = [];
        
        rows.forEach(row => {
            const studentId = row.getAttribute('data-student-id');
            const remark = row.querySelector('.remark-input')?.value.trim();
            
            // Re-read inputs
            let c1 = parseInt(row.querySelector('.sba-c1').value) || null;
            let c2 = parseInt(row.querySelector('.sba-c2').value) || null;
            let c3 = parseInt(row.querySelector('.sba-c3').value) || null;
            let c4 = parseInt(row.querySelector('.sba-c4').value) || null;
            let exam = parseInt(row.querySelector('.exam-input').value) || null;
            
            let payload = {
                student_id: studentId,
                subject_id: session.subjectId,
                term_id: termId,
                graded_by: user.id
            };
            
            // Because we Unified the sheet, we pass both sets of data at once:
            payload.class_exercise = c1;
            payload.group_work = c2;
            payload.project_work = c3;
            payload.individual_assessment = c4;
            payload.raw_exam_score = exam;
            
            upsertPayload.push(payload);
        });
        
        // Because Supabase UPSERT relies on the unique constraint (student_id, subject_id, term_id),
        // we can safely pass this array.
        const { error } = await supabaseClient
            .from('grades')
            .upsert(upsertPayload, { onConflict: 'student_id, subject_id, term_id' });
            
        if (error) throw error;
        
        alert("✅ Grades saved successfully!");
        
    } catch(err) {
        alert("Failed to save grades: " + err.message);
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-2"></i> Save Matrix'; }
    }
};

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
            .maybeSingle();

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
                <td class="d-none d-md-table-cell"><span class="badge bg-light border text-dark shadow-sm">${s.student_id_number || '--'}</span></td>
                <td><strong>${s.first_name} ${s.last_name}</strong></td>
                <td class="d-none d-md-table-cell">${genderDisplay}</td>
                <td class="d-none d-md-table-cell">${dobParsed}</td>
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
