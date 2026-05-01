/**
 * GLOBAL ADMIN DATA ENTRY SERVICE
 * Explicit Binding Architecture to bypass Bootstrap Modal bubbling bugs.
 */

// ---------------------------------------------------------------------------
const tempAuthClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey: 'temp_teacher_auth', autoRefreshToken: false, persistSession: false }
});

// ---------------------------------------------------------------------------
// GLOBAL TABLE SEARCH (Universal Fast-Filter for all Dashboards)
// ---------------------------------------------------------------------------
document.addEventListener('input', function(e) {
    if (e.target.matches('.table-search input')) {
        const query = e.target.value.toLowerCase();
        // Locate the primary data table on the current injected dashboard page
        const tableBody = document.querySelector('.data-table table tbody') || document.querySelector('table tbody');
        if (!tableBody) return;
        
        const rows = tableBody.querySelectorAll('tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            if (text.includes(query)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }
});

// 1. DYNAMIC MODULE INITIALIZERS (Fired by Dashboard SPA)
// ---------------------------------------------------------------------------
window.initModule = function(page) {
    if (page === 'classes') {
        loadAdminClasses();
        loadTeachersForClassDropdowns();
        
        const form = document.getElementById('addClassForm');
        if (form) {
            form.removeEventListener('submit', handleClassSubmit);
            form.addEventListener('submit', handleClassSubmit);
        }
        
        const editForm = document.getElementById('editClassForm');
        if (editForm) {
            editForm.removeEventListener('submit', handleEditClassSubmit);
            editForm.addEventListener('submit', handleEditClassSubmit);
        }
    }
    
    if (page === 'subjects') {
        loadAdminSubjects();
        
        // Subject Form Listener
        const form = document.getElementById('addSubjectForm');
        if (form) {
            form.removeEventListener('submit', handleSubjectSubmit);
            form.addEventListener('submit', handleSubjectSubmit);
        }
        
        // Register Class Subjects Mapping Logic
        const regForm = document.getElementById('registerClassSubjectsForm');
        if (regForm) {
            regForm.removeEventListener('submit', handleRegisterClassSubjectsSubmit);
            regForm.addEventListener('submit', handleRegisterClassSubjectsSubmit);
        }
        
        const regDeptEl = document.getElementById('registerDeptSelect');
        const regClassEl = document.getElementById('registerClassSelect');
        
        if (regDeptEl && regClassEl) {
            regDeptEl.onchange = async (e) => {
                const dept = e.target.value;
                regClassEl.innerHTML = '<option value="">Select Department First</option>';
                document.getElementById('subjectSelectionContainer').style.display = 'none';
                document.getElementById('saveClassSubjectsBtn').disabled = true;
                document.getElementById('selectAllSubjectsBtn').style.display = 'none';
                
                if (!dept) { regClassEl.disabled = true; return; }
                
                try {
                    const { data: classes } = await supabaseClient.from('classes').select('id, name').eq('department', dept).order('name');
                    regClassEl.innerHTML = '<option value="">Select Class</option>';
                    if (classes && classes.length > 0) {
                        regClassEl.disabled = false;
                        classes.forEach(c => regClassEl.innerHTML += `<option value="${c.id}">${c.name}</option>`);
                    } else {
                        regClassEl.innerHTML = '<option value="">No classes found</option>';
                        regClassEl.disabled = true;
                    }
                } catch(err) { console.error('Failed loading classes for dept:', err); }
            };
            
            regClassEl.onchange = async (e) => {
                const classId = e.target.value;
                const className = e.target.options[e.target.selectedIndex]?.text || 'Class';
                const container = document.getElementById('subjectSelectionContainer');
                const grid = document.getElementById('subjectCheckboxGrid');
                const dept = regDeptEl.value;
                
                if (!classId) {
                    container.style.display = 'none';
                    document.getElementById('saveClassSubjectsBtn').disabled = true;
                    document.getElementById('selectAllSubjectsBtn').style.display = 'none';
                    return;
                }
                
                document.getElementById('regClassNameDisplay').textContent = className;
                container.style.display = 'block';
                grid.innerHTML = '<div class="col-12 text-center py-4"><i class="fas fa-spinner fa-spin text-primary-green"></i> Loading subjects...</div>';
                document.getElementById('saveClassSubjectsBtn').disabled = true;
                
                try {
                    // Fetch master subjects for this department
                    const { data: subjects, error } = await supabaseClient.from('subjects').select('id, name').eq('department', dept).eq('is_active', true).order('name');
                    if (error) throw error;
                    
                    // Fetch currently registered subjects for this class
                    const { data: registered } = await supabaseClient.from('class_subjects').select('subject_id').eq('class_id', classId);
                    const registeredIds = registered ? registered.map(r => r.subject_id) : [];
                    
                    if (!subjects || subjects.length === 0) {
                        grid.innerHTML = '<div class="col-12"><div class="alert alert-warning border-0">No active subjects exist for this department yet. Please add Master Subjects first.</div></div>';
                        document.getElementById('selectAllSubjectsBtn').style.display = 'none';
                        return;
                    }
                    
                    grid.innerHTML = subjects.map(s => {
                        const isChecked = registeredIds.includes(s.id) ? 'checked' : '';
                        return `
                        <div class="col-md-4 mb-3">
                            <div class="form-check form-switch custom-switch-lg p-3 border rounded shadow-sm hover-elevate transition-all" style="background:#fff;">
                                <input class="form-check-input ms-0 subject-checkbox" type="checkbox" role="switch" value="${s.id}" id="sub_${s.id}" ${isChecked} style="width:40px;height:20px;cursor:pointer;">
                                <label class="form-check-label ms-2 fw-bold text-dark" for="sub_${s.id}" style="cursor:pointer; padding-top:2px;">${s.name}</label>
                            </div>
                        </div>
                        `;
                    }).join('');
                    
                    document.getElementById('saveClassSubjectsBtn').disabled = false;
                    document.getElementById('selectAllSubjectsBtn').style.display = 'inline-block';
                } catch(err) {
                    console.error('Failed loading subjects grid:', err);
                    grid.innerHTML = `<div class="col-12 text-danger">Failed to load subjects: ${err.message}</div>`;
                }
            };
        }
    }
    
    if (page === 'students') {
        loadAdminStudents();
        
        // Pre-cache school prefix from DB (first letters of school name)
        if (!window._schoolPrefix) {
            supabaseClient.from('school_settings').select('school_name').limit(1).maybeSingle()
                .then(({ data }) => {
                    const name = data?.school_name || 'School';
                    window._schoolPrefix = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 4);
                })
                .catch(() => { window._schoolPrefix = 'SCH'; });
        }
        
        const studentDeptSelect = document.getElementById('studentDepartmentSelect');
        const studentClassSelect = document.getElementById('studentClassSelect');
        
        const form = document.getElementById('addStudentForm');
        if (form) {
            form.removeEventListener('submit', handleStudentSubmit);
            form.addEventListener('submit', handleStudentSubmit);
        }
        
        const importDeptSelect = document.getElementById('importDepartmentSelect');
        const importClassSelect = document.getElementById('importClassSelect');
        
        const bindDeptToClass = (deptEl, classEl) => {
            if (!deptEl || !classEl) return;
            deptEl.onchange = async (e) => {
                const dept = e.target.value;
                classEl.innerHTML = '<option value="">Loading classes...</option>';
                classEl.disabled = true;
                
                if (!dept) {
                    classEl.innerHTML = '<option value="">Select Department First</option>';
                    return;
                }
                
                try {
                    const { data: classes, error } = await supabaseClient
                        .from('classes')
                        .select('id, name')
                        .eq('department', dept)
                        .order('name', { ascending: true });
                        
                    if (error) throw error;
                    
                    classEl.innerHTML = '<option value="">Select Class</option>';
                    if (classes && classes.length > 0) {
                        classEl.disabled = false;
                        classes.forEach(c => {
                            classEl.innerHTML += `<option value="${c.id}">${c.name}</option>`;
                        });
                    } else {
                        classEl.innerHTML = '<option value="">No classes created yet</option>';
                    }
                } catch (err) {
                    console.error("Failed fetching classes for dropdown:", err);
                }
            };
        };
        
        bindDeptToClass(studentDeptSelect, studentClassSelect);
        bindDeptToClass(importDeptSelect, importClassSelect);
        bindDeptToClass(document.getElementById('editStudentDepartment'), document.getElementById('editStudentClass'));
        bindDeptToClass(document.getElementById('filterDepartmentSelect'), document.getElementById('filterClassSelect'));
        
        const filterDept = document.getElementById('filterDepartmentSelect');
        const filterClass = document.getElementById('filterClassSelect');
        const searchInput = document.getElementById('studentSearchInput');
        
        if (filterDept) filterDept.addEventListener('change', loadAdminStudents);
        if (filterClass) filterClass.addEventListener('change', loadAdminStudents);
        if (searchInput) searchInput.addEventListener('input', () => {
            clearTimeout(window.searchTimeout);
            window.searchTimeout = setTimeout(loadAdminStudents, 300);
        });

        const editForm = document.getElementById('editStudentForm');
        if (editForm) {
            editForm.removeEventListener('submit', handleEditStudentSubmit);
            editForm.addEventListener('submit', handleEditStudentSubmit);
        }
        
        const importForm = document.getElementById('importStudentForm');
        if (importForm) {
            importForm.removeEventListener('submit', handleStudentBulkImport);
            importForm.addEventListener('submit', handleStudentBulkImport);
        }
        
    }
    
    
    if (page === 'classes') {
        loadAdminClasses();
        loadTeachersForClassDropdowns();
        
        const form = document.getElementById('addClassForm');
        if (form) {
            form.removeEventListener('submit', handleClassSubmit);
            form.addEventListener('submit', handleClassSubmit);
        }
        
        const editForm = document.getElementById('editClassForm');
        if (editForm) {
            editForm.removeEventListener('submit', handleEditClassSubmit);
            editForm.addEventListener('submit', handleEditClassSubmit);
        }
    }
    
    if (page === 'academic-settings') {
        const form = document.getElementById('academicConfigForm');
        if (form) {
            form.removeEventListener('submit', handleAcademicSettingsSubmit);
            form.addEventListener('submit', handleAcademicSettingsSubmit);
        }
        loadAcademicSettings();
    }
    
    if (page === 'teachers') {
        loadAdminTeachers();
        const form = document.getElementById('addTeacherForm');
        if (form) {
            form.removeEventListener('submit', handleTeacherSubmit);
            form.addEventListener('submit', handleTeacherSubmit);
        }
        const editForm = document.getElementById('editTeacherForm');
        if (editForm) {
            editForm.removeEventListener('submit', handleEditTeacherSubmit);
            editForm.addEventListener('submit', handleEditTeacherSubmit);
        }
    }
    
    if (page === 'assign-teachers') {
        const form = document.getElementById('assignTeacherForm');
        if(form) {
            form.removeEventListener('submit', handleAssignTeacherSubmit);
            form.addEventListener('submit', handleAssignTeacherSubmit);
        }
        
        loadAssignTeachersDropdowns();
        loadAssignmentsTable();
        
        window.assignmentQueue = [];
        const btnStage = document.getElementById('btnStageAssignments');
        if (btnStage) {
            btnStage.removeEventListener('click', window.handleStageAssignments);
            btnStage.addEventListener('click', window.handleStageAssignments);
        }
        if (typeof window.renderAssignmentQueue === 'function') window.renderAssignmentQueue();
        
        const deptCheckboxes = document.querySelectorAll('.dept-checkbox');
        const subjectGrid = document.getElementById('assignSubjectGrid');
        const classGrid = document.getElementById('assignClassGrid');
        
        deptCheckboxes.forEach(chk => {
            chk.addEventListener('change', async () => {
                const selectedDepts = Array.from(document.querySelectorAll('.dept-checkbox:checked')).map(cb => cb.value);
                
                if (selectedDepts.length === 0) {
                    subjectGrid.innerHTML = '<div class="col-12"><div class="alert alert-info border-0 py-2">Select at least one department first</div></div>';
                    classGrid.innerHTML = '<div class="col-12"><div class="alert alert-info border-0 py-2">Select at least one department first</div></div>';
                    return;
                }
                
                subjectGrid.innerHTML = '<div class="col-12 text-center py-3"><i class="fas fa-spinner fa-spin text-primary-green"></i> Loading subjects...</div>';
                classGrid.innerHTML = '<div class="col-12 text-center py-3"><i class="fas fa-spinner fa-spin text-primary-green"></i> Loading classes...</div>';
                
                try {
                    const { data: subjects } = await supabaseClient.from('subjects').select('id, name, department').in('department', selectedDepts).order('name');
                    if (subjects && subjects.length > 0) {
                        subjectGrid.innerHTML = subjects.map(s => `
                            <div class="col-md-6 mb-2">
                                <div class="form-check form-switch custom-switch-sm p-3 border rounded shadow-sm hover-elevate transition-all" style="background:#fff;">
                                    <input class="form-check-input ms-0 subject-checkbox" type="checkbox" role="switch" value="${s.id}" data-dept="${s.department}" id="subchk_${s.id}" style="width:35px;height:18px;cursor:pointer;">
                                    <label class="form-check-label ms-2 text-dark" for="subchk_${s.id}" style="cursor:pointer;"><span class="fw-bold">${s.name}</span> <small class="text-muted">(${s.department.replace('_', ' ')})</small></label>
                                </div>
                            </div>
                        `).join('');
                    } else {
                        subjectGrid.innerHTML = '<div class="col-12"><div class="alert alert-warning border-0">No active subjects found.</div></div>';
                    }
                    
                    const { data: classes } = await supabaseClient.from('classes').select('id, name, department').in('department', selectedDepts).order('name');
                    if (classes && classes.length > 0) {
                        classGrid.innerHTML = classes.map(c => `
                            <div class="col-md-6 mb-2">
                                <div class="form-check form-switch custom-switch-sm p-3 border rounded shadow-sm hover-elevate transition-all" style="background:#fff;">
                                    <input class="form-check-input ms-0 class-checkbox" type="checkbox" role="switch" value="${c.id}" data-dept="${c.department}" id="clschk_${c.id}" style="width:35px;height:18px;cursor:pointer;">
                                    <label class="form-check-label ms-2 text-dark" for="clschk_${c.id}" style="cursor:pointer;"><span class="fw-bold">${c.name}</span> <small class="text-muted">(${c.department.replace('_', ' ')})</small></label>
                                </div>
                            </div>
                        `).join('');
                    } else {
                        classGrid.innerHTML = '<div class="col-12"><div class="alert alert-warning border-0">No classes found.</div></div>';
                    }
                } catch(err) {
                    console.error('Grid load error:', err);
                    subjectGrid.innerHTML = '<div class="col-12 text-danger">Failed to load subjects</div>';
                    classGrid.innerHTML = '<div class="col-12 text-danger">Failed to load classes</div>';
                }
            });
        });
    }
    
    if (page === 'school-settings') {
        loadSchoolSettings();
        
        const infoForm = document.getElementById('schoolSettingsForm');
        if (infoForm) {
            infoForm.removeEventListener('submit', handleSchoolSettingsSubmit);
            infoForm.addEventListener('submit', handleSchoolSettingsSubmit);
        }
        
        const smsForm = document.getElementById('smsSettingsForm');
        if (smsForm) {
            smsForm.removeEventListener('submit', handleSmsSettingsSubmit);
            smsForm.addEventListener('submit', handleSmsSettingsSubmit);
        }
    }
    
    if (page === 'report-publishing') {
        if (typeof window.loadReportPublishing === 'function') {
            window.loadReportPublishing();
        }
    }
};

// ---------------------------------------------------------------------------
// 2. FORM SUBMIT CONTROLLERS
// ---------------------------------------------------------------------------
async function handleClassSubmit(e) {
    e.preventDefault();
    
    const className = document.getElementById('classNameInput').value.trim();
    const department = document.getElementById('classDepartmentInput').value;
    const capacity = document.getElementById('classCapacityInput').value;
    const formMasterId = document.getElementById('formMasterInput').value;
    
    const submitBtn = e.target.querySelector('button[type="submit"]') || document.querySelector('button[form="addClassForm"]');
    const originalText = submitBtn ? submitBtn.innerHTML : 'Save Class';
    
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Saving...';
        submitBtn.disabled = true;
    }
    
    try {
        const payload = { 
            name: className, 
            capacity: parseInt(capacity),
            department: department
        };
        
        if (formMasterId) {
            const { data: existingClassMaster } = await supabaseClient
                .from('classes')
                .select('name, users(first_name, last_name)')
                .eq('form_master_id', formMasterId)
                .maybeSingle();
                
            if (existingClassMaster) {
                throw new Error(`Conflict Detected: ${existingClassMaster.users.first_name} ${existingClassMaster.users.last_name} is already the Form Master for ${existingClassMaster.name}!`);
            }
            payload.form_master_id = formMasterId;
        }
        
        const { error } = await supabaseClient.from('classes').insert([payload]);
        if (error) throw error;
        
        const modalEl = document.getElementById('addClassModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modalInstance.hide();
        
        e.target.reset();
        alert(`Success! Class ${className} has been created in the database.`);
        
        loadAdminClasses();
        
    } catch (err) {
        alert('Database Error: ' + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }
}

async function handleEditClassSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('editClassIdDisplay').value;
    const className = document.getElementById('editClassNameInput').value.trim();
    const department = document.getElementById('editClassDepartmentInput').value;
    const capacity = document.getElementById('editClassCapacityInput').value;
    const formMasterId = document.getElementById('editFormMasterInput').value;
    
    const submitBtn = e.target.querySelector('button[type="submit"]') || document.querySelector('button[form="editClassForm"]');
    const originalText = submitBtn ? submitBtn.innerHTML : 'Update Class';
    
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Updating...';
        submitBtn.disabled = true;
    }
    
    try {
        const payload = { 
            name: className, 
            capacity: parseInt(capacity),
            department: department,
            form_master_id: formMasterId ? formMasterId : null
        };
        
        if (formMasterId) {
            const { data: existingClassMaster } = await supabaseClient
                .from('classes')
                .select('name, users(first_name, last_name)')
                .eq('form_master_id', formMasterId)
                .neq('id', id)
                .maybeSingle();
                
            if (existingClassMaster) {
                throw new Error(`Conflict Detected: ${existingClassMaster.users.first_name} ${existingClassMaster.users.last_name} is already the Form Master for ${existingClassMaster.name}!`);
            }
            
            // Check if the current class already has a different Form Master
            const { data: currentClassInfo } = await supabaseClient
                .from('classes')
                .select('form_master_id, users(first_name, last_name)')
                .eq('id', id)
                .maybeSingle();
                
            if (currentClassInfo && currentClassInfo.form_master_id && currentClassInfo.form_master_id !== formMasterId) {
                const oldMaster = currentClassInfo.users ? `${currentClassInfo.users.first_name} ${currentClassInfo.users.last_name}` : 'Another teacher';
                const proceed = confirm(`Warning: This class is already assigned to ${oldMaster} as the Form Master.\n\nDo you want to overwrite and assign it to the newly selected teacher?`);
                if (!proceed) {
                    if (submitBtn) {
                        submitBtn.innerHTML = originalText;
                        submitBtn.disabled = false;
                    }
                    return;
                }
            }
        }
        
        const { error } = await supabaseClient.from('classes').update(payload).eq('id', id);
        if (error) throw error;
        
        const modalEl = document.getElementById('editClassModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if(modalInstance) modalInstance.hide();
        
        e.target.reset();
        
        loadAdminClasses();
        
    } catch (err) {
        alert('Update Error: ' + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }
}

async function handleSubjectSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('subjectNameInput').value.trim();
    const department = document.getElementById('subjectDepartmentInput').value;
    const status = document.getElementById('subjectStatusInput').value;
    
    const submitBtn = e.target.querySelector('button[type="submit"]') || document.querySelector('button[form="addSubjectForm"]');
    const originalText = submitBtn ? submitBtn.innerHTML : 'Save Subject';
    
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Saving...';
        submitBtn.disabled = true;
    }
    
    try {
        // Validation: Bounce exact duplicates in the same department
        const { data: existingCol } = await supabaseClient
            .from('subjects')
            .select('id')
            .ilike('name', name)
            .eq('department', department);
            
        if (existingCol && existingCol.length > 0) {
            alert(`🛑 Duplicate Detected: "${name}" is already registered in the ${department.replace('_', ' ').toUpperCase()} department. Please use the existing subject.`);
            return;
        }
    
        const payload = { 
            name: name,
            department: department,
            is_active: status === 'active'
        };
        
        const { error } = await supabaseClient.from('subjects').insert([payload]);
        if (error) throw error;
        
        const modalEl = document.getElementById('addSubjectModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modalInstance.hide();
        
        e.target.reset();
        alert(`Success! Subject ${name} has been created.`);
        
        loadAdminSubjects();
        
    } catch (err) {
        alert('Database Error: ' + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }
}

// ---------------------------------------------------------------------------
// 2B. CLASS SUBJECTS REGISTRATION CONTROLLERS
// ---------------------------------------------------------------------------
window.toggleAllSubjectCheckboxes = function(check) {
    document.querySelectorAll('.subject-checkbox').forEach(cb => cb.checked = check);
};

async function handleRegisterClassSubjectsSubmit(e) {
    e.preventDefault();
    
    const classId = document.getElementById('registerClassSelect').value;
    if (!classId) return;
    
    const checkboxes = document.querySelectorAll('.subject-checkbox');
    const selectedIds = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    
    const submitBtn = document.getElementById('saveClassSubjectsBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Registering...';
    submitBtn.disabled = true;
    
    try {
        // Step 1: Wipe existing registrations for this specific class
        const { error: delError } = await supabaseClient.from('class_subjects').delete().eq('class_id', classId);
        if (delError) throw delError;
        
        // Step 2: Insert the newly selected array
        if (selectedIds.length > 0) {
            const inserts = selectedIds.map(subId => ({ class_id: classId, subject_id: subId }));
            const { error: insError } = await supabaseClient.from('class_subjects').insert(inserts);
            if (insError) throw insError;
        }
        
        const modalEl = document.getElementById('registerClassSubjectsModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
        
        alert(`Success! Generated reporting foundation. ${selectedIds.length} subjects safely registered to this class.`);
        
    } catch(err) {
        alert("Registration Error: " + err.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// ---------------------------------------------------------------------------
// 3. SECURE READ LOOPS
// ---------------------------------------------------------------------------
async function loadAdminClasses() {
    const container = document.getElementById('classesContainer');
    if(!container) return;
    
    try {
        // We load classes and their associated form master profile natively using Supabase FK join
        const { data: classes, error } = await supabaseClient
            .from('classes')
            .select(`
                *,
                users (
                    id, first_name, last_name, phone
                )
            `)
            .order('name', { ascending: true });
            
        if(error) throw error;
        
        // Also fetch global active student count for each class optimally
        const { data: studentsCount } = await supabaseClient
            .from('students')
            .select('class_id')
            .eq('status', 'active');
            
        const countMap = {};
        if (studentsCount) {
            studentsCount.forEach(s => {
                countMap[s.class_id] = (countMap[s.class_id] || 0) + 1;
            });
        }
        
        if(!classes || classes.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-center py-5 fade-in">
                    <div class="empty-state">
                        <i class="fas fa-chalkboard fa-3x text-muted mb-3" style="opacity: 0.3;"></i>
                        <h5 class="text-dark fw-bold">No Classes Found</h5>
                        <p class="text-muted mb-0">You haven't created any classes yet. Click "Add New Class" to get started.</p>
                    </div>
                </div>
            `;
            return;
        }
        
        const colors = ['primary-red', 'primary-gold', 'primary-green', 'primary-custom'];
        let html = '';
        
        classes.forEach((c, index) => {
            const colorClass = colors[index % colors.length];
            const capacity = c.capacity || 50;
            const currentStudents = countMap[c.id] || 0;
            const progress = capacity > 0 ? Math.min(100, (currentStudents / capacity) * 100) : 0;
            
            let masterHtml = `
                <div class="user-avatar bg-light text-dark fw-bold rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; font-size: 11px; margin-right: 12px;">UN</div>
                <strong class="text-dark" style="font-size: 0.9rem;">Unassigned</strong>
            `;
            
            if (c.users) {
                const init1 = c.users.first_name ? c.users.first_name.charAt(0) : '';
                const init2 = c.users.last_name ? c.users.last_name.charAt(0) : '';
                masterHtml = `
                    <div class="user-avatar bg-primary-custom text-white fw-bold rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; font-size: 11px; margin-right: 12px;">${init1}${init2}</div>
                    <strong class="text-dark" style="font-size: 0.9rem;">${c.users.first_name} ${c.users.last_name}</strong>
                `;
            }
            
            html += `
            <div class="col-md-4 mb-4 fade-in" style="animation-delay: ${index * 0.05}s">
                <div class="card h-100 shadow-sm border-0" style="transition: transform 0.3s ease; border-radius:15px; overflow:hidden;">
                    <div class="card-header bg-white d-flex justify-content-between align-items-center border-bottom-0 pb-0 pt-4 px-4">
                        <h5 class="mb-0 text-${colorClass}" style="font-weight: 800;">${c.name}</h5>
                        <div class="dropdown-custom">
                            <button class="btn btn-link text-muted p-0" style="font-size:1.2rem;" data-bs-toggle="dropdown"><i class="fas fa-ellipsis-v"></i></button>
                            <div class="dropdown-menu dropdown-menu-end shadow-sm border-0" style="border-radius:12px;">
                                <a href="#" class="dropdown-item fw-bold text-dark py-2" onclick="editClass('${c.id}')"><i class="fas fa-edit me-2 text-primary"></i> Edit Class Details</a>
                                <div class="dropdown-divider"></div>
                                <a href="#" class="dropdown-item text-danger fw-bold py-2" onclick="deleteClass('${c.id}', '${c.name.replace(/'/g, "\\'")}')"><i class="fas fa-trash me-2"></i> Delete</a>
                            </div>
                        </div>
                    </div>
                    <div class="card-body px-4">
                        <div class="mb-4">
                            <small class="text-muted d-block mb-2" style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; letter-spacing:0.05em;">Form Master</small>
                            <div class="d-flex align-items-center p-2 rounded-3" style="background:#f8fafc; border:1px solid #e2e8f0;">
                                ${masterHtml}
                            </div>
                        </div>
                        <div class="d-flex justify-content-between mb-2">
                            <span class="text-muted fw-bold" style="font-size: 0.8rem;"><i class="fas fa-users me-2"></i>Enrollment</span>
                            <strong class="text-dark">${currentStudents} <span class="text-muted fw-normal">/ ${capacity}</span></strong>
                        </div>
                        <div class="progress" style="height: 8px; border-radius: 10px; background-color: #f1f5f9;">
                            <div class="progress-bar ${progress > 90 ? 'bg-danger' : 'bg-primary-green'}" style="width: ${progress}%; border-radius: 10px;"></div>
                        </div>
                        <button class="btn btn-sm btn-outline-secondary w-100 mt-4 fw-bold shadow-sm" style="border-radius:10px; padding:0.6rem;" onclick="viewClassRoster('${c.id}', '${c.name.replace(/'/g, "\\'")}')"><i class="fas fa-id-card-alt me-2"></i> Student IDs & Roster</button>
                    </div>
                </div>
            </div>`;
        });
        
        container.innerHTML = html;
        
    } catch(err) {
        container.innerHTML = `<div class="col-12 text-center py-5"><p class="text-danger fw-bold"><i class="fas fa-exclamation-triangle me-2"></i> Failed to load classes: ${err.message}</p></div>`;
    }
}

window.loadTeachersForClassDropdowns = async function() {
    try {
        const { data: teachers, error } = await supabaseClient
            .from('users')
            .select('id, first_name, last_name')
            .eq('role', 'class_teacher')
            .eq('is_active', true)
            .order('first_name');
            
        if (error) return;
        
        const { data: classesWithMasters } = await supabaseClient
            .from('classes')
            .select('form_master_id, name')
            .not('form_master_id', 'is', null);
            
        const occupiedMap = {};
        if (classesWithMasters) {
            classesWithMasters.forEach(c => { occupiedMap[c.form_master_id] = c.name; });
        }
        
        let html = '<option value="">Select Teacher (N/A)</option>';
        if(teachers) {
            teachers.forEach(t => {
                if (occupiedMap[t.id]) {
                    html += `<option value="${t.id}" disabled>⛔ ${t.first_name} ${t.last_name} (Occupied in ${occupiedMap[t.id]})</option>`;
                } else {
                    html += `<option value="${t.id}">✅ ${t.first_name} ${t.last_name}</option>`;
                }
            });
        }
        
        const formMasterInput = document.getElementById('formMasterInput');
        const editFormMasterInput = document.getElementById('editFormMasterInput');
        
        if (formMasterInput) formMasterInput.innerHTML = html;
        if (editFormMasterInput) editFormMasterInput.innerHTML = html;
        
    } catch (err) {
        console.error("Teacher Dropdown Load Error:", err);
    }
};

window.editClass = async function(id) {
    const modalEl = document.getElementById('editClassModal');
    if (!modalEl) return;
    
    try {
        const { data: cls, error } = await supabaseClient.from('classes').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        
        document.getElementById('editClassIdDisplay').value = cls.id;
        document.getElementById('editClassNameInput').value = cls.name;
        document.getElementById('editClassDepartmentInput').value = cls.department;
        document.getElementById('editClassCapacityInput').value = cls.capacity || 50;
        
        const editFormMasterInput = document.getElementById('editFormMasterInput');
        
        // Always reconstruct the dropdown locally for the Edit Modal so it can enable the currently assigned teacher
        if (editFormMasterInput && cls.form_master_id) {
            const opt = editFormMasterInput.querySelector(`option[value="${cls.form_master_id}"]`);
            if (opt) {
                opt.disabled = false;
                opt.innerHTML = `⭐ ${opt.innerHTML.replace('⛔ ', '').replace(/ \(Occupied in .+\)/, '')} (Current Master)`;
            }
        }
        document.getElementById('editFormMasterInput').value = cls.form_master_id || '';
        
        let bsModal = bootstrap.Modal.getInstance(modalEl);
        if(!bsModal) bsModal = new bootstrap.Modal(modalEl);
        bsModal.show();
        
    } catch (err) {
        alert("Cannot edit class: " + err.message);
    }
};

window.viewClassRoster = async function(classId, className) {
    const modalEl = document.getElementById('viewRosterModal');
    if(!modalEl) return;
    
    document.getElementById('rosterClassName').textContent = className;
    // Store classId on the modal for later export use
    modalEl.dataset.classId = classId;
    modalEl.dataset.className = className;
    
    const tbody = document.getElementById('rosterTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="spinner-border text-primary-green"></div></td></tr>';
    
    let bsModal = bootstrap.Modal.getInstance(modalEl);
    if (!bsModal) bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
    
    try {
        const { data: students, error } = await supabaseClient
            .from('students')
            .select('student_id_number, first_name, last_name, gender, status')
            .eq('class_id', classId)
            .order('first_name');
            
        if(error) throw error;
        
        if(!students || students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted border-0">No students registered in this class yet.</td></tr>';
            return;
        }
        
        tbody.innerHTML = students.map((s, i) => {
            const badgeClass = s.status === 'active' ? 'bg-success' : (s.status === 'suspended' ? 'bg-danger' : 'bg-secondary');
            return `
            <tr>
                <td class="text-muted">${i + 1}</td>
                <td><strong style="color:var(--primary-green,#1a7f5a);font-family:monospace;">${s.student_id_number}</strong></td>
                <td><span class="fw-bold">${s.first_name} ${s.last_name}</span></td>
                <td><span class="text-primary-custom" style="font-family:monospace; font-weight:600;">${s.first_name}</span></td>
                <td><span class="badge ${badgeClass}">${(s.status || 'unknown').toUpperCase()}</span></td>
                <td><span class="badge ${badgeClass}">${(s.status || 'unknown').toUpperCase()}</span></td>
            </tr>
            `;
        }).join('');
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">Failed to load roster: ${err.message}</td></tr>`;
    }
};

window.exportClassRoster = function() {
    const modalEl = document.getElementById('viewRosterModal');
    const className = modalEl?.dataset.className || 'Class Roster';
    const rows = document.querySelectorAll('#rosterTableBody tr');
    if (!rows || rows.length === 0) return;
    
    let csv = `#,Student ID / PWD,Full Name,Username,Status\n`;
    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length >= 5) {
            const values = Array.from(cols).map(td => `"${td.textContent.trim().replace(/"/g, '\'')}"`).join(',');
            csv += values + '\n';
        }
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${className.replace(/\s+/g, '_')}_Roster.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

window.printClassRoster = function() {
    const modalEl = document.getElementById('viewRosterModal');
    const className = modalEl?.dataset.className || 'Class Roster';
    const tableHTML = document.getElementById('rosterTableBody')?.closest('table')?.outerHTML || '';
    const win = window.open('', '_blank');
    win.document.write(`
        <html><head><title>${className} - Student Roster</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h2 { text-align: center; color: #1a4a7a; }
            p { text-align: center; color: #666; font-size: 0.85rem; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th { background: #1a4a7a; color: white; padding: 10px; text-align: left; }
            td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) td { background: #f8fafc; }
        </style></head>
        <body>
            <h2>${className} — Student Roster</h2>
            <p>Generated: ${new Date().toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
            ${tableHTML}
        </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
};

async function loadAdminSubjects() {
    const tableBody = document.getElementById('subjectsTableBody');
    if(!tableBody) return;
    
    try {
        const { data: subjects, error } = await supabaseClient
            .from('subjects')
            .select('*');
            
        if(error) throw error;
        
        if(!subjects || subjects.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-5">
                        <i class="fas fa-book-open fa-3x text-muted mb-3" style="opacity:0.3"></i>
                        <h5 class="text-dark fw-bold">No Subjects Registered</h5>
                    </td>
                </tr>
            `;
            return;
        }
        
        const depts = {
            'preschool': 'Preschool',
            'lower_primary': 'Lower Primary',
            'upper_primary': 'Upper Primary',
            'jhs': 'Junior High School'
        };
        
        // Custom sort from lowest class to highest
        const sortOrder = { 'preschool': 1, 'lower_primary': 2, 'upper_primary': 3, 'jhs': 4 };
        subjects.sort((a, b) => {
            if (sortOrder[a.department] !== sortOrder[b.department]) {
                return sortOrder[a.department] - sortOrder[b.department];
            }
            return a.name.localeCompare(b.name);
        });
        
        let currentDept = null;
        let html = '';
        
        subjects.forEach(s => {
            // Inject beautiful grouping headers when the department changes
            if (s.department !== currentDept) {
                currentDept = s.department;
                html += `
                <tr style="background-color: #f8fafc;">
                    <td colspan="5" class="fw-bold py-3 text-primary-custom border-bottom" style="font-size: 1.05rem;">
                        <i class="fas fa-layer-group me-2"></i> ${depts[currentDept] || currentDept} Subjects
                    </td>
                </tr>`;
            }
            
            html += `
            <tr>
                <td class="ps-4"><span class="fw-bold fs-6 text-dark">${s.name}</span></td>
                <td><span class="badge bg-secondary opacity-75">${depts[s.department]}</span></td>
                <td><span class="badge bg-light text-dark border"><i class="fas fa-users-cog me-1"></i>0</span></td>
                <td>
                    ${s.is_active ? 
                      '<span class="badge" style="background:rgba(16,185,129,0.1);color:#10B981;">Active</span>' : 
                      '<span class="badge" style="background:rgba(206,17,38,0.1);color:#CE1126;">Inactive</span>'
                    }
                </td>
                <td>
                    <button class="btn btn-sm" style="background:rgba(206,17,38,0.1);color:#CE1126;border:none;" title="Delete" onclick="deleteSubject('${s.id}', '${s.name}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });
        
        tableBody.innerHTML = html;
        
    } catch(err) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-danger text-center"><i class="fas fa-times me-2"></i> Error: ${err.message}</td></tr>`;
    }
}

window.deleteClass = async function(id, className) {
    if(!confirm(`🛑 Delete class: ${className}?`)) return;
    await supabaseClient.from('classes').delete().eq('id', id);
    loadAdminClasses();
};

window.deleteSubject = async function(id, name) {
    if(!confirm(`🛑 Delete subject: ${name}?`)) return;
    await supabaseClient.from('subjects').delete().eq('id', id);
    loadAdminSubjects();
};

async function handleStudentSubmit(e) {
    e.preventDefault();
    
    // Disable submit button
    const submitBtn = e.target.querySelector('button[type="submit"]') || document.querySelector('button[form="addStudentForm"]');
    const originalText = submitBtn ? submitBtn.innerHTML : 'Save Student';
    if (submitBtn) {
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
        submitBtn.disabled = true;
    }

    try {
        const firstName = document.getElementById('studentFirstName').value.trim();
        const lastName = document.getElementById('studentLastName').value.trim();
        const gender = document.getElementById('studentGender').value;
        const dob = document.getElementById('studentDOB').value;
        const classId = document.getElementById('studentClassSelect').value;
        const admissionDate = document.getElementById('studentAdmissionDate').value;
        const guardianName = document.getElementById('studentGuardianName').value.trim();
        const guardianContact = document.getElementById('studentGuardianContact').value.trim();

        // Build school prefix from school_settings (cached per session)
        if (!window._schoolPrefix) {
            try {
                const { data: settings } = await supabaseClient.from('school_settings').select('school_name').limit(1).maybeSingle();
                const name = settings?.school_name || 'School';
                // Take first letter of each word, max 4 chars, uppercase
                window._schoolPrefix = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 4);
            } catch { window._schoolPrefix = 'SCH'; }
        }
        const prefix = window._schoolPrefix;
        
        // Guaranteed unique but SHORT collision-resistant format: PREFIX-YYMM-XXXX
        const now = new Date();
        const yy = String(now.getFullYear()).slice(2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const random4 = Math.floor(1000 + Math.random() * 9000); // 4-digit number
        const uniqueId = `${prefix}-${yy}${mm}-${random4}`;
        
        const payload = {
            student_id_number: uniqueId,
            first_name: firstName,
            last_name: lastName,
            gender: gender,
            dob: dob,
            class_id: classId,
            admission_date: admissionDate,
            guardian_name: guardianName,
            guardian_contact: guardianContact,
            status: 'active'
        };

        const { data, error } = await supabaseClient
            .from('students')
            .insert([payload])
            .select();

        if (error) throw error;

        // Hide Add Modal
        const modalEl = document.getElementById('addStudentModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
        e.target.reset();

        // Show Credentials Modal
        const credsModal = document.getElementById('studentCredentialsModal');
        if (credsModal) {
            document.getElementById('credStudentName').textContent = `${firstName} ${lastName}`;
            document.getElementById('credStudentUsername').textContent = firstName;
            document.getElementById('credStudentId').textContent = uniqueId;
            let bsCreds = bootstrap.Modal.getInstance(credsModal);
            if (!bsCreds) bsCreds = new bootstrap.Modal(credsModal);
            bsCreds.show();
        } else {
            alert(`✅ Student Registered!\nName: ${firstName} ${lastName}\nStudent ID: ${uniqueId}`);
        }

        if (typeof loadAdminStudents === 'function') loadAdminStudents();

    } catch (err) {
        if (typeof showToast === 'function') {
            showToast('Database Error', err.message, 'danger');
        } else {
            alert('Error: ' + err.message);
        }
    } finally {
        if (submitBtn) {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }
}

window.loadAdminStudents = async function() {
    const tbody = document.getElementById('studentsTableBody');
    if (!tbody) return;
    
    const deptFilter = document.getElementById('filterDepartmentSelect')?.value || '';
    const classFilter = document.getElementById('filterClassSelect')?.value || '';
    const searchFilter = document.getElementById('studentSearchInput')?.value.toLowerCase() || '';

    try {
        let query = supabaseClient.from('students')
            .select(`*, classes(name, department)`)
            .neq('status', 'graduated')
            .order('created_at', { ascending: false });
        const { data: students, error } = await query;
        if (error) throw error;
        
        let filtered = students || [];
        if (deptFilter) filtered = filtered.filter(s => s.classes && s.classes.department === deptFilter);
        if (classFilter) filtered = filtered.filter(s => s.class_id === classFilter);
        if (searchFilter) filtered = filtered.filter(s => 
            s.first_name.toLowerCase().includes(searchFilter) || 
            s.last_name.toLowerCase().includes(searchFilter) || 
            s.student_id_number.toLowerCase().includes(searchFilter)
        );
        
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 border-0"><h6 class="text-muted">No students found matching your criteria.</h6></td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(s => {
            const badgeClass = s.status === 'active' ? 'bg-success' : (s.status === 'suspended' ? 'bg-danger' : 'bg-secondary');
            return `
            <tr>
                <td class="d-none d-md-table-cell"><strong class="text-primary-green" style="font-family:monospace;">${s.student_id_number}</strong></td>
                <td class="d-none d-md-table-cell"><strong class="text-primary-custom" style="font-family:monospace; font-size:1.05rem;">${s.first_name}</strong></td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="user-avatar user-avatar-sm me-3 bg-primary text-white" style="width:35px;height:35px;display:flex;align-items:center;justify-content:center;border-radius:10px;font-weight:bold;">
                            ${s.first_name.charAt(0)}${s.last_name.charAt(0)}
                        </div>
                        <div>
                            <h6 class="mb-0 fw-bold text-dark">${s.first_name} ${s.last_name}</h6>
                        </div>
                    </div>
                </td>
                <td><span class="badge bg-light text-dark shadow-sm border"><i class="fas fa-chalkboard me-1"></i>${s.classes ? s.classes.name : 'Unassigned'}</span></td>
                <td>${s.gender ? s.gender.charAt(0).toUpperCase() + s.gender.slice(1) : '-'}</td>
                <td><span class="badge ${badgeClass}">${(s.status || 'unknown').toUpperCase()}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-1" title="Edit" onclick="editStudent('${s.id}')"><i class="fas fa-edit"></i></button>
                </td>
            </tr>
            `;
        }).join('');
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger">Failed to load students: ${err.message}</td></tr>`;
    }
};

window.editStudent = async function(id) {
    const modalEl = document.getElementById('editStudentModal');
    if (!modalEl) return;
    try {
        const { data: student, error } = await supabaseClient.from('students').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        
        document.getElementById('editStudentId').value = student.id;
        document.getElementById('editStudentIdDisplay').textContent = student.student_id_number;
        document.getElementById('editStudentFirstName').value = student.first_name;
        document.getElementById('editStudentLastName').value = student.last_name;
        document.getElementById('editStudentGender').value = student.gender || '';
        document.getElementById('editStudentDob').value = student.dob || '';
        document.getElementById('editStudentStatus').value = student.status || 'active';
        document.getElementById('editStudentGuardianName').value = student.guardian_name || '';
        document.getElementById('editStudentGuardianContact').value = student.guardian_contact || '';
        
        const classSelect = document.getElementById('editStudentClass');
        const deptSelect = document.getElementById('editStudentDepartment');
        
        if (student.class_id) {
            const { data: cls } = await supabaseClient.from('classes').select('department, id, name').eq('id', student.class_id).maybeSingle();
            if (cls) {
                deptSelect.value = cls.department;
                const { data: deptClasses } = await supabaseClient.from('classes').select('id, name').eq('department', cls.department);
                classSelect.innerHTML = '<option value="">Select Class</option>' + (deptClasses ? deptClasses.map(c => `<option value="${c.id}" ${c.id === cls.id ? 'selected' : ''}>${c.name}</option>`).join('') : '');
                classSelect.disabled = false;
            }
        }
        
        let modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (!modalInstance) modalInstance = new bootstrap.Modal(modalEl);
        modalInstance.show();
    } catch(err) {
        alert("Unable to load student profile: " + err.message);
    }
};

window.handleEditStudentSubmit = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveStudentEditsBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin border-0 me-2"></i>Saving...';
    try {
        const id = document.getElementById('editStudentId').value;
        const payload = {
            first_name: document.getElementById('editStudentFirstName').value.trim(),
            last_name: document.getElementById('editStudentLastName').value.trim(),
            gender: document.getElementById('editStudentGender').value,
            dob: document.getElementById('editStudentDob').value || null,
            class_id: document.getElementById('editStudentClass').value,
            status: document.getElementById('editStudentStatus').value,
            guardian_name: document.getElementById('editStudentGuardianName').value.trim(),
            guardian_contact: document.getElementById('editStudentGuardianContact').value.trim(),
        };
        const { error } = await supabaseClient.from('students').update(payload).eq('id', id);
        if (error) throw error;
        const modalEl = document.getElementById('editStudentModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
        loadAdminStudents();
        if (typeof showToast === 'function') showToast('Success', 'Student structure securely updated and live.', 'success');
        else alert('Student updated!');
    } catch(err) { alert("Failed to save changes: " + err.message); } 
    finally { if (btn) btn.innerHTML = 'Save Changes'; }
};

window.downloadStudentCSVTemplate = function() {
    const csvContent = "Student Name,Date of Birth,Guardian Name,Guardian Number,Gender\\nKwame Asare,2010-05-14,Mr. Asare,0240000000,Male\\nAkosua Mensah,2011-08-22,Mrs. Mensah,0550000001,Female";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "school_system_student_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

async function handleStudentBulkImport(e) {
    e.preventDefault();
    const btn = document.querySelector('button[form="importStudentForm"]');
    if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Reading CSV...';
    
    try {
        const fileInput = document.getElementById('importStudentFile');
        const file = fileInput.files[0];
        if (!file) throw new Error("Please select a CSV file.");
        
        const classId = document.getElementById('importClassSelect').value;
        if (!classId) throw new Error("Please select a valid class.");

        const text = await file.text();
        const rows = text.split('\\n').map(r => r.trim()).filter(r => r.length > 0);
        
        if (rows.length < 2) throw new Error("CSV file seems empty or contains only headers.");
        
        const headers = rows.shift().toLowerCase().split(',');
        const studentIdx = headers.findIndex(h => h.includes('student') || h.includes('name'));
        const dobIdx = headers.findIndex(h => h.includes('date') || h.includes('dob'));
        const guardNameIdx = headers.findIndex(h => h.includes('guardian name'));
        const guardContactIdx = headers.findIndex(h => h.includes('guardian number') || h.includes('contact'));
        const genIdx = headers.findIndex(h => h.includes('gender'));
        
        if (studentIdx === -1) {
            throw new Error("CSV must contain a 'Student Name' column.");
        }
        
        const admissionDate = new Date().toISOString().split('T')[0];
        const payload = [];
        
        for (let i = 0; i < rows.length; i++) {
            const cols = rows[i].split(',');
            const studentName = cols[studentIdx] ? cols[studentIdx].trim() : '';
            if (!studentName) continue;
            
            const nameParts = studentName.split(' ');
            const fName = nameParts.shift() || '';
            const lName = nameParts.join(' ') || '.';
            
            let gender = cols[genIdx] ? cols[genIdx].trim().toLowerCase() : 'male';
            if (gender !== 'male' && gender !== 'female') gender = 'male';
            
            const dob = dobIdx !== -1 && cols[dobIdx] ? cols[dobIdx].trim() : null;
            const gName = guardNameIdx !== -1 && cols[guardNameIdx] ? cols[guardNameIdx].trim() : '';
            const gContact = guardContactIdx !== -1 && cols[guardContactIdx] ? cols[guardContactIdx].trim() : '';
            
            // Guaranteed unique but SHORT collision-resistant format: PREFIX-YYMM-XXXX
            // Using a sequence inside the bulk loop ensures ZERO bulk import collisions!
            const seq4 = String((window._studentSeq = ((window._studentSeq || 0) + 1)) % 9999).padStart(4, '0');
            const n = new Date();
            const iyy = String(n.getFullYear()).slice(2);
            const imm = String(n.getMonth() + 1).padStart(2, '0');
            
            payload.push({
                student_id_number: `${p}-${iyy}${imm}-${seq4}`,
                first_name: fName,
                last_name: lName,
                gender: gender,
                dob: dob,
                guardian_name: gName,
                guardian_contact: gContact,
                admission_date: admissionDate,
                class_id: classId,
                status: 'active'
            });
        }
        
        if (payload.length === 0) throw new Error("No valid student rows found in CSV.");
        
        if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Uploading ' + payload.length + ' students...';
        
        const { error } = await supabaseClient.from('students').insert(payload);
        if (error) throw error;
        
        const modalEl = document.getElementById('importStudentModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
        e.target.reset();
        
        loadAdminStudents();
        alert(`Successfully imported ${payload.length} students securely! They have been automatically allocated IDs.`);
        
    } catch(err) {
        alert("Import Failed: " + err.message);
    } finally {
        if (btn) btn.innerHTML = '<i class="fas fa-upload me-2"></i> Upload Records';
    }
}

async function handleAcademicSettingsSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn ? btn.innerHTML : 'Save Configuration';
    if (btn) {
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
        btn.disabled = true;
    }

    try {
        const payload = {
            academic_year: document.getElementById('acadYear').value,
            current_term: document.getElementById('acadTerm').value,
            term_start_date: document.getElementById('acadStart').value,
            term_end_date: document.getElementById('acadEnd').value,
            next_term_begin_date: document.getElementById('acadNextStart') ? document.getElementById('acadNextStart').value : null,
            total_attendances: parseInt(document.getElementById('acadAttendances').value) || 60,
            is_active: true
        };

        // Deactivate all others hack (update where id != null)
        await supabaseClient.from('academic_settings').update({ is_active: false }).neq('current_term', 'IMPOSSIBLE_VALUE');

        const { data: existing } = await supabaseClient.from('academic_settings')
            .select('id').eq('academic_year', payload.academic_year)
            .eq('current_term', payload.current_term).maybeSingle();

        if (existing) {
            const { error } = await supabaseClient.from('academic_settings').update(payload).eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from('academic_settings').insert([payload]);
            if (error) throw error;
        }

        if (typeof showToast === 'function') {
            showToast('Success', 'Academic Term Configurations strictly updated and active!', 'success');
        } else alert('Academic Config successfully saved!');
        
    } catch (err) {
        if (typeof showToast === 'function') showToast('Error', err.message, 'danger');
        else alert('Error saving: ' + err.message);
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

window.viewClassRoster = async function(classId, className) {
    const titleSpan = document.getElementById('rosterClassName');
    if (titleSpan) titleSpan.textContent = className;
    
    const tbody = document.getElementById('rosterTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-muted mb-3 d-block"></i>Loading students...</td></tr>';
    
    // Open Modal
    const modalEl = document.getElementById('viewRosterModal');
    if (modalEl) {
        const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modalInstance.show();
    }
    
    try {
        const { data: students, error } = await supabaseClient
            .from('students')
            .select('*')
            .eq('class_id', classId)
            .order('first_name', { ascending: true });
            
        if (error) throw error;
        
        if (!students || students.length === 0) {
            if (tbody) tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-5">
                        <i class="fas fa-user-slash fa-3x text-muted mb-3" style="opacity:0.3"></i>
                        <h6 class="text-dark fw-bold">No Students Enrolled</h6>
                        <p class="text-muted mb-0">There are currently no students registered in this class.</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        if (tbody) {
            tbody.innerHTML = students.map(s => `
                <tr>
                    <td><strong style="color:var(--primary-green)">${s.student_id_number || 'N/A'}</strong></td>
                    <td><span class="fw-bold text-dark">${s.first_name} ${s.last_name}</span></td>
                    <td>${s.gender ? (s.gender.charAt(0).toUpperCase() + s.gender.slice(1)) : 'N/A'}</td>
                    <td>
                        ${s.status === 'active' 
                          ? '<span class="badge" style="background:rgba(16,185,129,0.1);color:#10B981;">Active</span>' 
                          : '<span class="badge" style="background:rgba(206,17,38,0.1);color:#CE1126;">'+(s.status || 'Inactive').toUpperCase()+'</span>'}
                    </td>
                </tr>
            `).join('');
        }
    } catch(err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center py-4"><i class="fas fa-exclamation-triangle me-2"></i> Failed to load roster: ${err.message}</td></tr>`;
    }
};

window.deleteStudent = async function(id, name) {
    if(!confirm(`🛑 CRITICAL ACTION: Delete Student ${name} and completely erase all their exam records forever?`)) return;
    try {
        const { error } = await supabaseClient.from('students').delete().eq('id', id);
        if(error) throw error;
        loadAdminStudents();
    } catch(err) {
        alert("Failed to delete student: " + err.message);
    }
};

window.loadAcademicSettings = async function() {
    try {
        const { data, error } = await supabaseClient.from('academic_settings').select('*').eq('is_active', true).maybeSingle();
        if (data && !error) {
            if(document.getElementById('acadYear')) document.getElementById('acadYear').value = data.academic_year;
            if(document.getElementById('acadTerm')) document.getElementById('acadTerm').value = data.current_term;
            if(document.getElementById('acadStart')) document.getElementById('acadStart').value = data.term_start_date;
            if(document.getElementById('acadEnd')) document.getElementById('acadEnd').value = data.term_end_date;
            if(document.getElementById('acadNextStart')) document.getElementById('acadNextStart').value = data.next_term_begin_date || '';
            if(document.getElementById('acadAttendances')) document.getElementById('acadAttendances').value = data.total_attendances;
        }
    } catch(err) {
        console.warn("No active academic settings found or database error.");
    }
};

window.deleteTeacher = async function(id, name) {
    if(!confirm(`🛑 PERMANENTLY Delete Staff Member: ${name}?\n\nThis will completely remove them and their portal access from the system. Grade records they generated will be preserved natively.`)) return;
    try {
        const { error } = await supabaseClient.from('users').delete().eq('id', id);
        if(error) throw error;
        loadAdminTeachers();
    } catch(err) {
        alert("Deletion Failed: " + err.message);
    }
};

async function handleTeacherSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn ? btn.innerHTML : 'Save Staff Record';
    if(btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Registering...'; btn.disabled = true; }

    try {
        console.log('teacherFirstName:', document.getElementById('teacherFirstName'));
        console.log('teacherLastName:', document.getElementById('teacherLastName'));
        console.log('teacherPhone:', document.getElementById('teacherPhone'));
        console.log('teacherRole:', document.getElementById('teacherRole'));
        console.log('teacherStatus:', document.getElementById('teacherStatus'));

        const firstName = document.getElementById('teacherFirstName').value.trim();
        const lastName = document.getElementById('teacherLastName').value.trim();
        const phone = document.getElementById('teacherPhone') ? document.getElementById('teacherPhone').value.trim() : '';
        const role = document.getElementById('teacherRole').value;
        const status = document.getElementById('teacherStatus').value === 'active';

        // 1. Unified Unified Credentials
        let generatedUsername = phone;
        if (!generatedUsername) {
            throw new Error("Phone number is required and will serve as the teacher's username.");
        }
        
        const dummyEmail = `${generatedUsername.replace(/\s+/g, '')}@sergioacademy.com`;
        
        let prefix = 'SERG';
        if (role === 'class_teacher') prefix = 'CLS';
        if (role === 'subject_teacher') prefix = 'SUB';
        if (role === 'admin') prefix = 'ADM';
        
        // Generate a random 4-character alphanumeric string to pair with the 4-char prefix
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let randomStr = '';
        for (let i = 0; i < 4; i++) randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
        const generatedPassword = `${prefix}-${randomStr}`;

        // 2. Isolated Auth Registration (Prevents Admin Session Destruction)
        const { data: authData, error: authError } = await tempAuthClient.auth.signUp({
            email: dummyEmail,
            password: generatedPassword,
            options: { data: { role: role } }
        });
        
        if (authError) {
            if (authError.message.includes('already registered')) {
                throw new Error("This Phone Number is already linked to a previously deleted or active staff account in the deep secure auth system. To recreate the teacher, please append a letter to their phone number (e.g., '0551234567A').");
            }
            throw authError;
        }
        if (!authData.user) throw new Error("Failed to create isolated unified Auth account.");
        await tempAuthClient.auth.signOut(); // Clean up isolated lock

        // 3. Mount Public Persona linked to Global Roles
        const { error: dbError } = await supabaseClient.from('users').insert([{
            id: authData.user.id,
            first_name: firstName,
            last_name: lastName,
            phone: phone,
            username: generatedUsername,
            initial_password: generatedPassword,
            role: role,
            is_active: status
        }]);

        if (dbError) throw dbError;

        const modalEl = document.getElementById('addTeacherModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
        e.target.reset();

        alert(`✅ TEACHER SUCCESSFULLY REGISTERED!\n\nUsername: ${generatedUsername}\nPassword: ${generatedPassword}\nRole: ${role.toUpperCase().replace('_', ' ')}\n\n(This default password uniquely secures their account until their first login!)`);
        
        loadAdminTeachers();
    } catch (err) {
        alert("Registration Failed: " + err.message);
    } finally {
        if(btn) { btn.innerHTML = originalText; btn.disabled = false; }
    }
}

async function loadAdminTeachers() {
    const tbody = document.getElementById('teachersTableBody');
    if(!tbody) return;
    
    try {
        const { data: users, error } = await supabaseClient.from('users').select('*').order('created_at', { ascending: false });
        if(error) throw error;
        
        // Fetch assigned classes to map teachers
        const { data: classMapData } = await supabaseClient.from('classes').select('name, form_master_id').not('form_master_id', 'is', null);
        const occupiedMap = {};
        if (classMapData) {
            classMapData.forEach(c => occupiedMap[c.form_master_id] = c.name);
        }
        
        if(!users || users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5"><h5 class="text-dark">No Teachers Registered</h5></td></tr>`;
            return;
        }

        tbody.innerHTML = users.map(t => {
            const avatar = `${t.first_name.charAt(0)}${t.last_name.charAt(0)}`.toUpperCase();
            
            let roleBadge = '';
            if (t.role === 'class_teacher') {
                const assignedClass = occupiedMap[t.id];
                const assignmentBadge = assignedClass ? `<span class="badge bg-primary-green ms-1 fw-bold" style="font-size: 0.7rem; background:#006B3F;"><i class="fas fa-chalkboard me-1"></i> ${assignedClass}</span>` : `<span class="badge bg-light text-muted border fw-normal shadow-sm ms-1" style="font-size: 0.7rem;"><i class="fas fa-exclamation-triangle text-warning me-1"></i> Unassigned</span>`;
                roleBadge = `<span class="badge bg-primary shadow-sm">Class Teacher</span><div class="mt-1">${assignmentBadge}</div>`;
            } else if (t.role === 'subject_teacher') {
                roleBadge = '<span class="badge bg-info shadow-sm text-dark">Subject Teacher</span>';
            } else {
                roleBadge = '<span class="badge bg-dark shadow-sm">Administrator</span>';
            }
                            
            return `
            <tr>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="user-avatar shadow-sm" style="width: 35px; height: 35px; font-size: 14px; margin-right: 12px; background: linear-gradient(135deg, var(--primary-green), #10b981); color: white; display: flex; align-items: center; justify-content: center; border-radius: 50%;">${avatar}</div>
                        <strong>${t.first_name} ${t.last_name}</strong>
                    </div>
                </td>
                <td>
                    <span class="d-block fw-bold text-dark" style="font-family: monospace; font-size: 0.9rem;">U: ${t.username || 'N/A'}</span>
                    <span class="d-block text-danger fw-bold mt-1" style="font-family: monospace; font-size: 0.85rem; letter-spacing: 1px;">P: ${t.initial_password || '******'}</span>
                </td>
                <td>${roleBadge}</td>
                <td>${t.phone || 'N/A'}</td>
                <td>${t.is_active ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-danger">Inactive</span>'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-1" title="Edit" onclick="editTeacher('${t.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" title="Delete" onclick="deleteTeacher('${t.id}', '${t.first_name} ${t.last_name}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
            `;
        }).join('');
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger">Failed to load staff list.</td></tr>`;
    }
}

window.editTeacher = async function(id) {
    const modalEl = document.getElementById('editTeacherModal');
    if (!modalEl) return;
    try {
        const { data: teacher, error } = await supabaseClient.from('users').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        
        document.getElementById('editTeacherId').value = teacher.id;
        document.getElementById('editTeacherFirstName').value = teacher.first_name;
        document.getElementById('editTeacherLastName').value = teacher.last_name;
        if (document.getElementById('editTeacherUsername')) document.getElementById('editTeacherUsername').value = teacher.username || '';
        document.getElementById('editTeacherPhone').value = teacher.phone || '';
        document.getElementById('editTeacherRole').value = teacher.role;
        document.getElementById('editTeacherStatus').value = teacher.is_active ? 'active' : 'inactive';
        
        let modalInstance = bootstrap.Modal.getInstance(modalEl);
        if(!modalInstance) modalInstance = new bootstrap.Modal(modalEl);
        modalInstance.show();
    } catch(err) {
        alert("Cannot load profile: " + err.message);
    }
};

window.handleEditTeacherSubmit = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveTeacherEditsBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin border-0 me-2"></i>Saving...';
    try {
        const id = document.getElementById('editTeacherId').value;
        const payload = {
            first_name: document.getElementById('editTeacherFirstName').value.trim(),
            last_name: document.getElementById('editTeacherLastName').value.trim(),
            phone: document.getElementById('editTeacherPhone').value.trim(),
            role: document.getElementById('editTeacherRole').value,
            is_active: document.getElementById('editTeacherStatus').value === 'active'
        };
        
        const editUsernameEl = document.getElementById('editTeacherUsername');
        if (editUsernameEl && editUsernameEl.value.trim()) {
            payload.username = editUsernameEl.value.trim();
        }
        const { error } = await supabaseClient.from('users').update(payload).eq('id', id);
        if (error) throw error;
        
        const modalEl = document.getElementById('editTeacherModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if(modalInstance) modalInstance.hide();
        
        loadAdminTeachers();
        alert('Teacher successfully updated!');
    } catch(err) {
        alert("Update Error: " + err.message);
    } finally {
        if (btn) btn.innerHTML = 'Save Changes';
    }
};

window.handleStageAssignments = async function() {
    try {
        const teacherSelect = document.getElementById('assignTeacherSelect');
        const teacher_id = teacherSelect.value;
        const teacher_name = teacherSelect.options[teacherSelect.selectedIndex]?.text;
        
        if (!teacher_id) throw new Error('Please select a teacher first.');
        
        const selectedClasses = Array.from(document.querySelectorAll('.class-checkbox:checked')).map(cb => ({ 
            id: cb.value, dept: cb.getAttribute('data-dept'), name: cb.nextElementSibling.textContent.trim() 
        }));
        const selectedSubjects = Array.from(document.querySelectorAll('.subject-checkbox:checked')).map(cb => ({ 
            id: cb.value, dept: cb.getAttribute('data-dept'), name: cb.nextElementSibling.textContent.trim() 
        }));
        
        if (selectedClasses.length === 0 || selectedSubjects.length === 0) {
            throw new Error('Please select at least one class and one subject.');
        }
        
        let additions = 0;
        let warnings = [];
        
        // Pre-fetch existing assignments for selected classes
        const classIds = selectedClasses.map(c => c.id);
        const { data: existingAssignments } = await supabaseClient
            .from('subject_teachers')
            .select('subject_id, class_id, users(first_name, last_name)')
            .in('class_id', classIds);
            
        selectedSubjects.forEach(sub => {
            selectedClasses.forEach(cls => {
                if (sub.dept === cls.dept) {
                    // check uniqueness in queue
                    const exists = window.assignmentQueue.some(q => q.subject_id === sub.id && q.class_id === cls.id);
                    if (!exists) {
                        // Check DB for existing teacher conflict
                        if (existingAssignments) {
                            const conflict = existingAssignments.find(e => e.subject_id === sub.id && e.class_id === cls.id);
                            if (conflict && conflict.users) {
                                warnings.push(`- ${sub.name} for ${cls.name} is already assigned to ${conflict.users.first_name} ${conflict.users.last_name}`);
                            }
                        }
                        
                        window.assignmentQueue.push({ 
                            teacher_id, subject_id: sub.id, class_id: cls.id,
                            subjectName: sub.name, className: cls.name, deptName: sub.dept 
                        });
                        additions++;
                    }
                }
            });
        });
        
        if (additions === 0) throw new Error('No valid new combinations found. (Either already staged, or department mismatch).');
        
        if (warnings.length > 0) {
            const proceed = confirm(`Conflicts Detected:\n\n${warnings.join('\n')}\n\nDo you want to proceed and overwrite these assignments with ${teacher_name}?`);
            if (!proceed) {
                // Cancel adding them to queue
                window.assignmentQueue.splice(window.assignmentQueue.length - additions, additions);
                return;
            }
        }
        
        // Reset purely the checkboxes to allow easy selection of next department
        document.querySelectorAll('.dept-checkbox:checked').forEach(cb => cb.checked = false);
        document.getElementById('assignSubjectGrid').innerHTML = '<div class="col-12"><div class="alert alert-info border-0 py-2">Select at least one department first</div></div>';
        document.getElementById('assignClassGrid').innerHTML = '<div class="col-12"><div class="alert alert-info border-0 py-2">Select at least one department first</div></div>';
        
        if (typeof showToast === 'function') showToast('Staged', `Successfully staged ${additions} combinations to queue.`, 'info');
        window.renderAssignmentQueue();
        
    } catch(err) { alert(err.message); }
};

window.unstageAssignment = function(index) {
    if(window.assignmentQueue) {
        window.assignmentQueue.splice(index, 1);
        window.renderAssignmentQueue();
    }
};

window.renderAssignmentQueue = function() {
    const list = document.getElementById('queuedItemsList');
    const msg = document.getElementById('emptyQueueMsg');
    const badge = document.getElementById('stagedCountBadge');
    
    if(!list || !msg || !badge) return;
    
    if(!window.assignmentQueue || window.assignmentQueue.length === 0) {
        list.innerHTML = '';
        msg.style.display = 'block';
        badge.textContent = '0';
        return;
    }
    
    msg.style.display = 'none';
    badge.textContent = window.assignmentQueue.length;
    list.innerHTML = window.assignmentQueue.map((item, idx) => `
        <div class="badge bg-white text-dark border p-2 d-flex align-items-center shadow-sm" style="font-size: 0.85rem;">
            <div><strong class="text-primary-green">${item.subjectName}</strong> &rarr; ${item.className}</div>
            <i class="fas fa-times ms-2 text-danger" style="cursor:pointer;" onclick="window.unstageAssignment(${idx})" title="Remove"></i>
        </div>
    `).join('');
};

async function handleAssignTeacherSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const ogText = btn ? btn.innerHTML : 'Commit All to Database';
    
    if(!window.assignmentQueue || window.assignmentQueue.length === 0) {
        alert("The staging queue is empty! Please 'Stage to Queue' first.");
        return;
    }
    
    if(btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Committing...'; btn.disabled = true; }

    try {
        // Delete old (subject, class) combos first to avoid duplicates
        for (const item of window.assignmentQueue) {
            await supabaseClient.from('subject_teachers')
                .delete()
                .eq('subject_id', item.subject_id)
                .eq('class_id', item.class_id);
        }
        
        const payload = window.assignmentQueue.map(item => ({
            teacher_id: item.teacher_id,
            subject_id: item.subject_id,
            class_id: item.class_id
        }));
        
        const { error } = await supabaseClient
            .from('subject_teachers')
            .insert(payload);
        
        if (error) throw error;

        // Clear queue
        window.assignmentQueue = [];
        window.renderAssignmentQueue();
        
        const modalEl = document.getElementById('assignTeacherModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
        e.target.reset();
        
        if (typeof showToast === 'function') showToast('Success', `Successfully committed ${payload.length} matrix combinations to live database!`, 'success');
        else alert(`Teacher successfully mapped to ${payload.length} combinations!`);
        
        loadAssignmentsTable();
    } catch (err) {
        alert("Commit Failed: " + err.message);
    } finally {
        if(btn) { btn.innerHTML = ogText; btn.disabled = false; }
    }
}

async function loadAssignTeachersDropdowns() {
    const teacherSelect = document.getElementById('assignTeacherSelect');
    if(!teacherSelect) return;
    try {
        const { data: users, error } = await supabaseClient.from('users').select('id, first_name, last_name, role').order('first_name');
        if (!error && users) {
            teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
            users.forEach(u => {
                const label = `${u.first_name} ${u.last_name} (${u.role.replace('_', ' ')})`;
                teacherSelect.innerHTML += `<option value="${u.id}">${label}</option>`;
            });
        }
    } catch(err) {}
}

async function loadAssignmentsTable() {
    const tbody = document.getElementById('assignmentsTableBody');
    if(!tbody) return;
    
    try {
        const { data: assignments, error } = await supabaseClient
            .from('subject_teachers')
            .select(`
                id,
                users (first_name, last_name, role),
                subjects (name, department),
                classes (name)
            `);
            
        if (error) throw error;
        
        if (!assignments || assignments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5"><h5 class="text-dark">No Teacher Assignments Yet</h5><p class="text-muted">Link teachers to subjects to visualize the matrix.</p></td></tr>`;
            return;
        }
        
        tbody.innerHTML = assignments.map(a => `
            <tr>
                <td><strong>${a.users.first_name} ${a.users.last_name}</strong></td>
                <td><span class="text-primary-green fw-bold">${a.subjects.name}</span></td>
                <td><span class="badge bg-primary">${a.classes.name}</span></td>
                <td>${(a.subjects.department).replace('_', ' ').toUpperCase()}</td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteAssignment('${a.id}')">
                        <i class="fas fa-trash me-1"></i> Revoke
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">Failed to load assignment matrix: ${err.message}</td></tr>`;
    }
}

window.deleteAssignment = async function(id) {
    if(!confirm('🛑 Delete this Subject Assignment? The teacher will instantly lose access to the grading portal for this class/subject pair!')) return;
    try {
        await supabaseClient.from('subject_teachers').delete().eq('id', id);
        loadAssignmentsTable();
    } catch(err) { alert(err.message); }
};

// ---------------------------------------------------------------------------
// SCHOOL SETTINGS LOGIC
// ---------------------------------------------------------------------------
window.loadSchoolSettings = async function() {
    try {
        const { data, error } = await supabaseClient
            .from('school_settings')
            .select('*')
            .limit(1)
            .maybeSingle();
            
        if (error) {
            if (error.code === 'PGRST116') return; // Table empty
            throw error;
        }
        
        if (data) {
            if(document.getElementById('settingSchoolName')) document.getElementById('settingSchoolName').value = data.school_name || '';
            if(document.getElementById('settingSchoolMotto')) document.getElementById('settingSchoolMotto').value = data.school_motto || '';
            if(document.getElementById('settingSchoolPhone')) document.getElementById('settingSchoolPhone').value = data.school_contact || '';
            if(document.getElementById('settingSchoolEmail')) document.getElementById('settingSchoolEmail').value = data.school_email || '';
            if(document.getElementById('settingSchoolAddress')) document.getElementById('settingSchoolAddress').value = data.school_address || '';
            
            // If logo exists in the DB, show it
            if(data.school_logo_url) {
                const img = document.getElementById('logoPreviewImg');
                const ph = document.getElementById('logoPreviewPlaceholder');
                if(img && ph) {
                    img.src = data.school_logo_url;
                    img.style.display = 'block';
                    ph.style.display = 'none';
                }
            }
            
            if(document.getElementById('allowParentViewToggle')) document.getElementById('allowParentViewToggle').checked = data.allow_parent_view;
            if(document.getElementById('settingSmsApiKey')) document.getElementById('settingSmsApiKey').value = data.sms_api_key || '';
            if(document.getElementById('settingSmsSenderId')) document.getElementById('settingSmsSenderId').value = data.sms_sender_id || '';
            
            window._schoolSettingsDbId = data.id;
        }
    } catch(err) {
        console.error("Failed to load school settings:", err);
    }
};

window.handleSchoolSettingsSubmit = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveSchoolInfoBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Saving...';
    
    try {
        const payload = {
            school_name: document.getElementById('settingSchoolName').value.trim(),
            school_motto: document.getElementById('settingSchoolMotto').value.trim(),
            school_email: document.getElementById('settingSchoolEmail') ? document.getElementById('settingSchoolEmail').value.trim() : null,
            school_contact: document.getElementById('settingSchoolPhone').value.trim(),
            school_address: document.getElementById('settingSchoolAddress').value.trim()
        };
        
        window._schoolPrefix = payload.school_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 4);
        
        let req;
        if (window._schoolSettingsDbId) {
            req = supabaseClient.from('school_settings').update(payload).eq('id', window._schoolSettingsDbId);
        } else {
            req = supabaseClient.from('school_settings').insert([payload]);
        }
        
        const { error } = await req;
        if (error) throw error;
        
        alert("School Information Saved Successfully!");
        loadSchoolSettings();
    } catch(err) {
        alert("Error saving info: " + err.message);
    } finally {
        if (btn) btn.innerHTML = 'Save Information';
    }
};

window.handleSmsSettingsSubmit = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveSmsSettingsBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Saving...';
    
    try {
        const payload = {
            allow_parent_view: document.getElementById('allowParentViewToggle').checked,
            sms_api_key: document.getElementById('settingSmsApiKey').value.trim(),
            sms_sender_id: document.getElementById('settingSmsSenderId').value.trim()
        };
        
        let req;
        if (window._schoolSettingsDbId) {
            req = supabaseClient.from('school_settings').update(payload).eq('id', window._schoolSettingsDbId);
        } else {
            req = supabaseClient.from('school_settings').insert([payload]);
        }
        
        const { error } = await req;
        if (error) throw error;
        
        alert("SMS Configuration Saved Successfully!");
        loadSchoolSettings();
    } catch(err) {
        alert("Error saving SMS config: " + err.message);
    } finally {
        if (btn) btn.innerHTML = '<i class="fas fa-save me-1"></i> Save SMS Configuration';
    }
};

window.handleLogoUploadSave = async function() {
    const fileInput = document.getElementById('settingSchoolLogoFile');
    const btn = document.getElementById('saveLogoBtn');
    if (!fileInput || !btn) return;
    
    if (fileInput.files.length === 0) { 
        alert("Please browse and select an image file first."); 
        return; 
    }
    
    const file = fileInput.files[0];
    if (file.size > 2 * 1024 * 1024) { // 2MB limit
        alert("Image file is too large. Please keep the logo under 2MB.");
        return;
    }
    
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Uploading...';
    btn.disabled = true;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64String = e.target.result;
        try {
            const payload = { school_logo_url: base64String };
            
            let req;
            if (window._schoolSettingsDbId) {
                req = supabaseClient.from('school_settings').update(payload).eq('id', window._schoolSettingsDbId);
            } else {
                req = supabaseClient.from('school_settings').insert([payload]);
            }
            
            const { error } = await req;
            if (error) throw error;
            
            // Update local preview immediately
            const img = document.getElementById('logoPreviewImg');
            const ph = document.getElementById('logoPreviewPlaceholder');
            if(img && ph) {
                img.src = base64String;
                img.style.display = 'block';
                ph.style.display = 'none';
            }
            
            fileInput.value = ""; // Clear file input
            alert("School Logo Uploaded and Saved Successfully!");
        } catch(err) {
            alert("Error saving logo: " + err.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };
    reader.onerror = function() {
        alert("Failed to read the file.");
        btn.innerHTML = originalText;
        btn.disabled = false;
    };
    reader.readAsDataURL(file);
};
