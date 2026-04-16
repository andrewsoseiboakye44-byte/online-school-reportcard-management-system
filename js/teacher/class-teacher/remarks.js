/**
 * remarks.js
 * Logic for Class Teacher Remarks Processing
 */

(function() {
    let activeTerm = null;
    let assignedClass = null;
    let currentStudents = [];
    let selectedStudentId = null;

    const rosterList = document.getElementById('remarksStudentList');
    const formCard = document.getElementById('remarksFormCard');
    const emptyState = document.getElementById('remarksEmptyState');
    
    // Form Elements
    const remarkStudentName = document.getElementById('remarkStudentName');
    const remarkStatusBadge = document.getElementById('remarkStatusBadge');
    const selClassRemark = document.getElementById('selClassRemark');
    const selConduct = document.getElementById('selConduct');
    const selInterest = document.getElementById('selInterest');
    const txtHeadteacherRemark = document.getElementById('txtHeadteacherRemark');
    const btnSaveRemarks = document.getElementById('btnSaveRemarks');

    async function initRemarks() {
        try {
            // 1. Fetch Active Term
            const { data: termData, error: termErr } = await supabaseClient
                .from('academic_settings')
                .select('*')
                .eq('is_active', true)
                .single();

            if (termErr || !termData) throw new Error("No active Academic Term configured. Please contact the administrator.");
            activeTerm = termData;

            // 2. Fetch Logged-in Teacher & Class
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) throw new Error("Session invalid. Please login again.");

            const { data: classData, error: classErr } = await supabaseClient
                .from('classes')
                .select('id, name')
                .eq('form_master_id', session.user.id)
                .single();

            if (classErr || !classData) {
                renderError("You are not assigned as a Form Master for any active class.");
                return;
            }
            assignedClass = classData;

            // 3. Fetch Student Roster
            const { data: students, error: studentErr } = await supabaseClient
                .from('students')
                .select('id, student_id_number, first_name, last_name')
                .eq('class_id', assignedClass.id)
                .eq('status', 'active')
                .order('first_name', { ascending: true });

            if (studentErr) throw studentErr;

            if (!students || students.length === 0) {
                renderError(`No active students found in ${assignedClass.name}.`);
                return;
            }
            currentStudents = students;

            // Render lateral roster
            renderStudentList();

        } catch (err) {
            console.error(err);
            renderError(`<i class="fas fa-exclamation-circle text-danger me-2"></i> ${err.message}`);
        }
    }

    function renderError(msg) {
        rosterList.innerHTML = `<div class="p-4 text-center text-muted"><p>${msg}</p></div>`;
        formCard.style.display = 'none';
        emptyState.style.display = 'flex';
    }

    function renderStudentList() {
        let html = '';
        currentStudents.forEach(student => {
            html += `
                <button type="button" class="list-group-item list-group-item-action border-start-0 border-end-0 remark-student-btn" data-id="${student.id}">
                    <div class="d-flex justify-content-between align-items-center">
                        <strong>${student.first_name} ${student.last_name}</strong>
                        <span class="badge bg-light text-dark shadow-sm" id="badge-${student.id}"><i class="fas fa-search me-1"></i></span>
                    </div>
                    <small class="text-muted"><i class="fas fa-id-card fa-xs me-1"></i> ${student.student_id_number || 'No ID'}</small>
                </button>
            `;
        });
        rosterList.innerHTML = html;

        // Attach Listeners
        document.querySelectorAll('.remark-student-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                // Remove active from all
                document.querySelectorAll('.remark-student-btn').forEach(b => b.classList.remove('active', 'bg-light'));
                
                // Add active
                this.classList.add('active', 'bg-light');
                const studentId = this.getAttribute('data-id');
                const studentData = currentStudents.find(s => s.id === studentId);
                
                loadStudentRemarks(studentData);
            });
        });
    }

    async function loadStudentRemarks(student) {
        selectedStudentId = student.id;
        
        // UI Transitions
        emptyState.style.display = 'none';
        formCard.style.display = 'block';
        remarkStudentName.innerHTML = `<i class="fas fa-circle-notch fa-spin text-primary-green me-2"></i> Loading ${student.first_name}...`;
        
        // Reset form
        selClassRemark.value = '';
        selConduct.value = '';
        selInterest.value = '';
        txtHeadteacherRemark.value = '';
        remarkStatusBadge.textContent = 'Checking...';
        remarkStatusBadge.className = 'badge bg-secondary shadow-sm';

        try {
            // Check Database for existing remarks for THIS SPECIFIC term and student
            const { data: remark, error: remarkErr } = await supabaseClient
                .from('remarks')
                .select('*')
                .eq('student_id', student.id)
                .eq('term_id', activeTerm.id)
                .single();

            remarkStudentName.innerHTML = `<i class="fas fa-user-graduate text-primary-red me-2"></i> ${student.first_name} ${student.last_name}`;

            if (remarkErr && remarkErr.code !== 'PGRST116') {
                throw remarkErr;
            }

            if (remark) {
                // Populate existing records
                if (remark.class_teacher_remark) selClassRemark.value = remark.class_teacher_remark;
                if (remark.conduct) selConduct.value = remark.conduct;
                if (remark.interest) selInterest.value = remark.interest;
                if (remark.headteacher_remark) {
                    txtHeadteacherRemark.value = remark.headteacher_remark;
                } else {
                    txtHeadteacherRemark.value = '';
                }

                remarkStatusBadge.textContent = 'Saved';
                remarkStatusBadge.className = 'badge bg-success shadow-sm';
            } else {
                remarkStatusBadge.textContent = 'Pending Remarks';
                remarkStatusBadge.className = 'badge bg-warning text-dark shadow-sm';
            }

        } catch (err) {
            console.error(err);
            remarkStudentName.innerHTML = `<span class="text-danger">Error Loading Profile</span>`;
            if(typeof showToast === 'function') showToast('Error', err.message, 'danger');
        }
    }

    // Save Button Logic
    if (btnSaveRemarks) {
        btnSaveRemarks.addEventListener('click', async function() {
            if (!selectedStudentId) return;

            // Validation
            if (!selClassRemark.value || !selConduct.value || !selInterest.value) {
                if(typeof showToast === 'function') {
                    showToast('Validation Error', 'Please select a dropdown option for all 3 categories.', 'warning');
                } else {
                    alert('Please select an option for Class Remark, Conduct, and Interest.');
                }
                return;
            }

            const originalHtml = this.innerHTML;
            this.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
            this.disabled = true;

            try {
                const upsertData = {
                    student_id: selectedStudentId,
                    term_id: activeTerm.id,
                    class_teacher_remark: selClassRemark.value,
                    conduct: selConduct.value,
                    interest: selInterest.value
                };

                const { error } = await supabaseClient
                    .from('remarks')
                    .upsert(upsertData, { onConflict: 'student_id, term_id' });

                if (error) throw error;

                if(typeof showToast === 'function') {
                    showToast('Success', 'Remarks saved successfully!', 'success');
                } else {
                    alert('Remarks saved successfully!');
                }

                remarkStatusBadge.textContent = 'Saved';
                remarkStatusBadge.className = 'badge bg-success shadow-sm';
                
                // Optional: Update sidebar badge visually
                const sBadge = document.getElementById(`badge-${selectedStudentId}`);
                if (sBadge) sBadge.innerHTML = '<i class="fas fa-check text-success"></i>';

            } catch (err) {
                console.error(err);
                if(typeof showToast === 'function') {
                    showToast('Save Failed', err.message, 'danger');
                } else {
                    alert('Save Failed: ' + err.message);
                }
            } finally {
                this.innerHTML = originalHtml;
                this.disabled = false;
            }
        });
    }

    // Boot the module
    initRemarks();

})();
