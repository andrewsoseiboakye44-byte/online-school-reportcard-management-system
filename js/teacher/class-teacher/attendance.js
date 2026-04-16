/**
 * attendance.js
 * Logic for Class Teacher Terminal Attendance Tracking
 */

(function() {
    let activeTerm = null;
    let assignedClass = null;
    let currentStudents = [];
    let existingAttendanceMap = {};

    const tbody = document.getElementById('attendanceTbody');
    const btnSave = document.getElementById('btnSaveAttendance');
    const totalAdminDaysEl = document.getElementById('totalAdminDays');
    const btnFillMax = document.getElementById('btnFillMaxAttendance');

    async function initAttendanceModule() {
        try {
            // 1. Fetch Active Term Configuration
            const { data: termData, error: termErr } = await supabaseClient
                .from('academic_settings')
                .select('*')
                .eq('is_active', true)
                .single();

            if (termErr || !termData) throw new Error("No active Academic Term configured by Admin.");
            activeTerm = termData;
            
            // Set Headers
            document.getElementById('attendanceTermLabel').textContent = `${activeTerm.academic_year} - ${activeTerm.current_term}`;
            totalAdminDaysEl.textContent = activeTerm.total_attendances || 0;

            // 2. Determine Logged In Teacher and their Class
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) throw new Error("Authentication session missing. Please re-login.");

            const { data: classData, error: classErr } = await supabaseClient
                .from('classes')
                .select('id, name')
                .eq('form_master_id', session.user.id)
                .single();

            if (classErr || !classData) {
                renderEmptyState("You are not currently assigned as a Class Teacher (Form Master) for any active class.");
                return;
            }
            assignedClass = classData;

            // 3. Fetch Students in that class
            const { data: students, error: studentErr } = await supabaseClient
                .from('students')
                .select('id, student_id_number, first_name, last_name')
                .eq('class_id', assignedClass.id)
                .eq('status', 'active')
                .order('first_name', { ascending: true });

            if (studentErr) throw studentErr;
            if (!students || students.length === 0) {
                renderEmptyState(`No active students registered in ${assignedClass.name}.`);
                return;
            }
            currentStudents = students;

            // 4. Fetch Existing Terminal Attendance Data
            const studentIds = students.map(s => s.id);
            const { data: attendanceData, error: attendanceErr } = await supabaseClient
                .from('attendance')
                .select('*')
                .eq('term_id', activeTerm.id)
                .in('student_id', studentIds);

            if (attendanceErr) throw attendanceErr;
            
            // Map existing data: { student_id: days_present }
            attendanceData.forEach(record => {
                existingAttendanceMap[record.student_id] = record.days_present;
            });

            // 5. Render Spreadsheet
            renderSpreadsheet();

        } catch (error) {
            console.error(error);
            renderEmptyState(`<i class="fas fa-exclamation-triangle text-danger me-2"></i> Error: ${error.message}`);
        }
    }

    function renderEmptyState(message) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-5">
                    <p class="text-muted fs-5 mb-0">${message}</p>
                </td>
            </tr>
        `;
        if (btnSave) btnSave.disabled = true;
        if (btnFillMax) btnFillMax.disabled = true;
    }

    function calculatePercentage(daysPresent) {
        const total = activeTerm.total_attendances;
        if (!total || total === 0) return 0;
        const pct = (daysPresent / total) * 100;
        return Math.min(100, Math.max(0, pct)).toFixed(1);
    }

    function renderSpreadsheet() {
        const totalParams = activeTerm.total_attendances || 0;
        
        let html = '';
        currentStudents.forEach(student => {
            const currentDays = existingAttendanceMap[student.id] !== undefined ? existingAttendanceMap[student.id] : '';
            const pctDisplay = currentDays !== '' ? `${calculatePercentage(currentDays)}%` : '--';
            
            const pctColorClass = currentDays !== '' && calculatePercentage(currentDays) < 50 ? 'text-danger fw-bold' : 'text-success fw-bold';

            html += `
                <tr data-student-id="${student.id}">
                    <td class="ps-3 text-muted">${student.student_id_number || 'N/A'}</td>
                    <td><strong>${student.first_name} ${student.last_name}</strong></td>
                    <td class="text-center">
                        <input type="number" 
                               class="form-control text-center mx-auto att-input" 
                               style="width: 100px; font-weight: bold;" 
                               min="0" max="${totalParams}" 
                               value="${currentDays}" 
                               placeholder="0"
                               data-student-id="${student.id}">
                    </td>
                    <td class="text-center align-middle">
                        <span class="attendance-pct ${pctColorClass} fs-5" id="pct-${student.id}">${pctDisplay}</span>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        btnSave.disabled = false;
        btnFillMax.disabled = false;

        // Attach event listeners for real-time calculation
        document.querySelectorAll('.att-input').forEach(input => {
            input.addEventListener('input', function() {
                let val = parseInt(this.value);
                const max = parseInt(this.getAttribute('max'));
                
                // Enforce max constraint gracefully
                if (val > max) {
                    this.value = max;
                    val = max;
                }
                if (val < 0) {
                    this.value = 0;
                    val = 0;
                }

                const studentId = this.getAttribute('data-student-id');
                const pctSpan = document.getElementById(`pct-${studentId}`);
                
                if (isNaN(val) || this.value === '') {
                    pctSpan.textContent = '--';
                    pctSpan.className = 'attendance-pct text-muted fs-5';
                } else {
                    const pct = calculatePercentage(val);
                    pctSpan.textContent = `${pct}%`;
                    pctSpan.className = `attendance-pct fs-5 ${pct < 50 ? 'text-danger fw-bold' : 'text-success fw-bold'}`;
                }
            });
        });
    }

    if (btnFillMax) {
        btnFillMax.addEventListener('click', () => {
            const max = activeTerm.total_attendances || 0;
            document.querySelectorAll('.att-input').forEach(input => {
                input.value = max;
                
                // Dispatch input event to trigger UI calc
                input.dispatchEvent(new Event('input'));
            });
        });
    }

    if (btnSave) {
        btnSave.addEventListener('click', async function() {
            const originalText = this.innerHTML;
            this.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
            this.disabled = true;

            try {
                const upsertPayload = [];
                const inputs = document.querySelectorAll('.att-input');
                
                let hasInvalid = false;

                inputs.forEach(input => {
                    const studentId = input.getAttribute('data-student-id');
                    const val = parseInt(input.value);
                    if (!isNaN(val)) {
                        if(val > activeTerm.total_attendances) hasInvalid = true;

                        upsertPayload.push({
                            student_id: studentId,
                            term_id: activeTerm.id,
                            days_present: val
                        });
                    }
                });

                if (hasInvalid) throw new Error("Some records exceed maximum configured total attendances.");
                if (upsertPayload.length === 0) throw new Error("No attendance values entered to save.");

                // Upsert to Supabase
                const { error } = await supabaseClient
                    .from('attendance')
                    .upsert(upsertPayload, { onConflict: 'student_id, term_id' });

                if (error) throw error;

                if (typeof showToast === 'function') {
                    showToast('Success', 'Terminal Attendance successfully saved and linked to report cards!', 'success');
                } else {
                    alert('Attendance successfully saved!');
                }

                // Update local map gracefully
                upsertPayload.forEach(p => {
                    existingAttendanceMap[p.student_id] = p.days_present;
                });

            } catch (err) {
                if (typeof showToast === 'function') {
                    showToast('Error', err.message, 'danger');
                } else {
                    alert('Error saving attendance: ' + err.message);
                }
            } finally {
                this.innerHTML = originalText;
                this.disabled = false;
            }
        });
    }

    // Initialize
    initAttendanceModule();

})();
