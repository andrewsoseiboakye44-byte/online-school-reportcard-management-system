// js/admin/historical-results.js

(function() {
    let _histStudent = null;
    let _histTerms = [];

    // Attach to Dashboard Initializer
    const coreInitModule = window.initModule;
    window.initModule = function(page) {
        if (coreInitModule) coreInitModule(page);
        if (page === 'historical-results') {
            initHistoricalResults();
        }
    };

    function initHistoricalResults() {
        const searchForm = document.getElementById('historySearchForm');
        if (searchForm) {
            searchForm.removeEventListener('submit', handleHistorySearch);
            searchForm.addEventListener('submit', handleHistorySearch);
        }
    }

    async function handleHistorySearch(e) {
        e.preventDefault();
        const studentIdNumber = document.getElementById('histSearchId').value.trim();
        if (!studentIdNumber) return;

        const btn = document.getElementById('btnHistSearch');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Searching...';
        btn.disabled = true;
        
        // Hide existing views
        document.getElementById('histEmptyState').style.display = 'none';
        document.getElementById('histProfileCard').style.display = 'none';

        try {
            // 1. Fetch Student Natively (Ignoring filters so graduated/inactive students show up)
            const { data: student, error: studentErr } = await supabaseClient
                .from('students')
                .select('id, class_id, first_name, last_name, student_id_number, status, gender, classes(name, department)')
                .ilike('student_id_number', studentIdNumber)
                .maybeSingle();

            if (studentErr || !student) {
                alert(`Student ID [${studentIdNumber}] not found in database records.`);
                document.getElementById('histEmptyState').style.display = 'flex';
                return;
            }

            _histStudent = student;
            
            // Render Profile Header
            document.getElementById('histStudentName').textContent = `${student.first_name} ${student.last_name}`;
            document.getElementById('histStudentIdLabel').textContent = `ID: ${student.student_id_number}`;
            
            const initials = student.first_name.charAt(0) + student.last_name.charAt(0);
            document.getElementById('histStudentInitials').textContent = initials.toUpperCase();
            
            const statusBadge = document.getElementById('histStudentStatus');
            statusBadge.className = `badge fs-6 ${student.status === 'graduated' ? 'bg-danger' : (student.status === 'active' ? 'bg-success' : 'bg-secondary')}`;
            statusBadge.textContent = student.status.toUpperCase();

            // 2. Fetch Grades grouping for this student
            // Querying grades table for this exact student ID.
            const { data: grades, error: gradesErr } = await supabaseClient
                .from('grades')
                .select('term_id')
                .eq('student_id', student.id);

            if (gradesErr) throw gradesErr;
            
            // Extract Unique Term IDs
            const uniqueTermIds = [...new Set((grades || []).map(g => g.term_id))];

            // 3. Fetch Mapping for the Available Terms
            const termSelect = document.getElementById('histTermSelect');
            termSelect.innerHTML = '<option value="">Select historical term...</option>';
            const generateBtn = document.getElementById('btnHistGenerate');
            generateBtn.disabled = true;

            if (uniqueTermIds.length === 0) {
                termSelect.innerHTML = '<option value="">No academic records found for this student.</option>';
            } else {
                const { data: terms, error: termErr } = await supabaseClient
                    .from('academic_settings')
                    .select('id, academic_year, current_term, term_start_date, term_end_date, next_term_begin_date, total_attendances')
                    .in('id', uniqueTermIds)
                    .order('academic_year', { ascending: false })
                    .order('current_term', { ascending: false });

                if (termErr) throw termErr;
                
                _histTerms = terms;

                terms.forEach(term => {
                    const opt = document.createElement('option');
                    opt.value = term.id;
                    opt.textContent = `${term.academic_year} - ${term.current_term}`;
                    termSelect.appendChild(opt);
                });
                
                termSelect.addEventListener('change', function() {
                    generateBtn.disabled = !this.value;
                });
            }

            document.getElementById('histProfileCard').style.display = 'block';

        } catch (err) {
            console.error("Archive Search failed:", err);
            alert("Archive Fetch failed: " + err.message);
            document.getElementById('histEmptyState').style.display = 'flex';
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    // Bind this to window so the UI can execute it
    window.generateHistoricalReport = async function() {
        if (!_histStudent) return;
        
        const termId = document.getElementById('histTermSelect').value;
        if (!termId) return;
        
        const termData = _histTerms.find(t => t.id === termId);
        if (!termData) return;

        const btn = document.getElementById('btnHistGenerate');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Generating PDF...';
        btn.disabled = true;

        try {
            // If the global report publisher module is loaded:
            if (typeof window.compileTermReportCard === 'function') {
                
                // Fetch full subjects dictionary required by the global renderer
                const { data: subjectsRaw } = await supabaseClient.from('subjects').select('id, name');
                const subjectDict = {};
                if (subjectsRaw) {
                    subjectsRaw.forEach(s => subjectDict[s.id] = s.name);
                }
                
                // Fetch Grade Settings
                const { data: gradingSystem } = await supabaseClient.from('grading_system').select('*').order('min_score', { ascending: false });
                
                // Fetch Historical Remarks & Attendance
                const { data: histRemarks } = await supabaseClient.from('remarks').select('*').eq('student_id', _histStudent.id).eq('term_id', termId).maybeSingle();
                const { data: histAttendance } = await supabaseClient.from('attendance').select('*').eq('student_id', _histStudent.id).eq('term_id', termId).maybeSingle();

                let classStudentIds = [_histStudent.id];
                let classGrades = [];
                let computedPosition = 'N/A';
                let classSubs = [];

                if (_histStudent.class_id) {
                    // Fetch all students in that class
                    const { data: classStudents } = await supabaseClient
                        .from('students')
                        .select('id')
                        .eq('class_id', _histStudent.class_id);
                    
                    if (classStudents && classStudents.length > 0) {
                        classStudentIds = classStudents.map(s => s.id);
                    }

                    // Fetch ALL Grades for the Class to compute Subject Positions & Class Position
                    const { data: cGrades } = await supabaseClient
                        .from('grades')
                        .select('*')
                        .eq('term_id', termId)
                        .in('student_id', classStudentIds);
                    if (cGrades) classGrades = cGrades;

                    // Fetch class subjects mapping
                    const { data: cSubs } = await supabaseClient
                        .from('class_subjects')
                        .select('subject_id, subjects(name)')
                        .eq('class_id', _histStudent.class_id);
                    if (cSubs) classSubs = cSubs;

                    // Replicate Ranking Algorithm
                    const subjectGroups = {};
                    const studentAgg = {};
                    classStudentIds.forEach(id => { studentAgg[id] = { totalScore: 0 }; });

                    classGrades.forEach(g => {
                        const sbaTotal = (g.class_exercise || 0) + (g.project_work || 0) + (g.individual_assessment || 0) + (g.group_work || 0);
                        const exTotal = g.raw_exam_score || 0;
                        
                        const sbaScaled = (sbaTotal / 60) * 50;
                        const exScaled = (exTotal / 100) * 50;
                        g._total_score = Math.round(sbaScaled + exScaled);
                        
                        if (!subjectGroups[g.subject_id]) subjectGroups[g.subject_id] = [];
                        subjectGroups[g.subject_id].push(g);
                        
                        if (studentAgg[g.student_id]) {
                            studentAgg[g.student_id].totalScore += g._total_score;
                        }
                    });
                    
                    // Subject Position Calc
                    for (let subId in subjectGroups) {
                        let list = subjectGroups[subId].sort((a,b) => b._total_score - a._total_score);
                        let currentRank = 1;
                        let prevScore = -1;
                        list.forEach((grd, idx) => {
                            if (grd._total_score === prevScore) { grd.position = currentRank; } 
                            else { grd.position = idx + 1; currentRank = idx + 1; }
                            prevScore = grd._total_score;
                        });
                    }

                    // Overall Class Position Calc
                    const rankedStudents = Object.keys(studentAgg).map(id => ({ id: id, totalScore: studentAgg[id].totalScore })).sort((a,b) => b.totalScore - a.totalScore);
                    let classCurrentRank = 1;
                    let classPrevScore = -1;
                    rankedStudents.forEach((r, idx) => {
                        if (r.totalScore === classPrevScore) { r.position = classCurrentRank; } 
                        else { r.position = idx + 1; classCurrentRank = idx + 1; }
                        classPrevScore = r.totalScore;
                        
                        let j = r.position % 10, k = r.position % 100;
                        if (j == 1 && k != 11) { r.ordinal = r.position + "st"; }
                        else if (j == 2 && k != 12) { r.ordinal = r.position + "nd"; }
                        else if (j == 3 && k != 13) { r.ordinal = r.position + "rd"; }
                        else { r.ordinal = r.position + "th"; }
                    });

                    const myRankObj = rankedStudents.find(r => r.id === _histStudent.id);
                    if (myRankObj) computedPosition = myRankObj.ordinal;
                }

                let myGrades = classGrades.length > 0 ? classGrades.filter(g => g.student_id === _histStudent.id) : [];
                
                if (myGrades.length === 0) {
                    const { data: histGrades } = await supabaseClient.from('grades').select('*').eq('student_id', _histStudent.id).eq('term_id', termId);
                    if (histGrades) {
                        histGrades.forEach(g => {
                            const sbaTotal = (g.class_exercise || 0) + (g.project_work || 0) + (g.individual_assessment || 0) + (g.group_work || 0);
                            const exTotal = g.raw_exam_score || 0;
                            const sbaScaled = (sbaTotal / 60) * 50;
                            const exScaled = (exTotal / 100) * 50;
                            g._total_score = Math.round(sbaScaled + exScaled);
                        });
                        myGrades = histGrades;
                    }
                }

                // Format the dynamic student payload
                const payloadStudent = {
                    ..._histStudent,
                    class_pop: classStudentIds.length,
                    position: computedPosition,
                    grades: myGrades,
                    remark: histRemarks || {},
                    attendance: histAttendance || {},
                    classSubjects: classSubs || []
                };

                // Generate
                const htmlContent = await window.compileTermReportCard(payloadStudent, termId, subjectDict, termData, gradingSystem || []);
                
                if (!htmlContent) {
                    throw new Error("Report compilation returned empty format.");
                }

                // Show in the Report Modal viewer built inside dashboard.html
                const rvModalBody = document.getElementById('globalPdfBody');
                if (rvModalBody) {
                    rvModalBody.innerHTML = htmlContent;
                    const rvModal = new bootstrap.Modal(document.getElementById('globalPdfModal'));
                    rvModal.show();
                } else {
                    alert("System Modal not found. The app layout is missing the report viewer.");
                }

            } else {
                throw new Error("Report Publishing engine is missing. Cannot simulate document compilation.");
            }

        } catch(err) {
            console.error(err);
            alert("Report Engine compilation failed: " + err.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    // Self-initialize if loaded dynamically after DOM mount
    if (document.getElementById('historySearchForm')) {
        initHistoricalResults();
    }
})();
