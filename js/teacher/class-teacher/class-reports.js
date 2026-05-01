// js/teacher/class-teacher/class-reports.js

(async function initClassReports() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        
        // 1. Get Term
        const { data: term } = await supabaseClient.from('academic_settings').select('*').eq('is_active', true).maybeSingle();
        if (!term) throw new Error("No active term.");
        window._crTerm = term;
        
        // 2. Get Class
        const adminSelectedClassId = localStorage.getItem('adminViewingClassId');
        let classQuery = supabaseClient.from('classes').select('*');
        let isAdminView = false;
        
        if (adminSelectedClassId) {
            classQuery = classQuery.eq('id', adminSelectedClassId);
            localStorage.removeItem('adminViewingClassId'); // Clear immediately so it's only valid for ONE jump
            isAdminView = true;
        } else {
            classQuery = classQuery.eq('form_master_id', session.user.id);
        }
        
        const { data: cls } = await classQuery.maybeSingle();
        
        if (!cls) {
            document.getElementById('crStudentsTableBody').innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted">You are not a Form Master or selected class is invalid.</td></tr>';
            return;
        }
        window._crClass = cls;
        
        // 3. Get Publishing Status
        const { data: pubStatus } = await supabaseClient.from('term_publishing_status').select('is_published').eq('term_id', term.id).eq('class_id', cls.id).maybeSingle();
        const isPublished = pubStatus && pubStatus.is_published;
        window._crIsPublished = isPublished;
        
        const badge = document.getElementById('crPublishBadge');
        if (isPublished) {
            badge.className = 'badge bg-success';
            badge.innerHTML = '<i class="fas fa-check-circle me-1"></i> Published to Parents';
            document.getElementById('crPublishCard').style.display = 'none';
        } else {
            badge.className = 'badge bg-warning text-dark';
            badge.innerHTML = '<i class="fas fa-lock me-1"></i> Draft Mode (Unpublished)';
        }
        
        const printAllBtn = document.getElementById('crPrintAllBtn');
        if(isAdminView && printAllBtn) {
            printAllBtn.disabled = false;
            printAllBtn.onclick = window.executeCrBulkPrint;
        }
        
        // 4. Fetch School Settings (Logo, etc) for PDF
        const { data: schoolSet } = await supabaseClient.from('school_settings').select('*').limit(1).maybeSingle();
        window._crSchoolSet = schoolSet || {};
        
        // 5. Build Class Roster and Compute Math
        await generateClassPerformanceMatrix(cls.id, term.id);
        
    } catch(err) {
        console.error("Class Reports Init Error:", err);
        const tbody = document.getElementById('crStudentsTableBody');
        if(tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-danger">${err.message}</td></tr>`;
    }
})();

async function generateClassPerformanceMatrix(classId, termId) {
    // A. Students
    const { data: students } = await supabaseClient.from('students').select('*').eq('class_id', classId).eq('status', 'active');
    
    // B. Registered Subjects for the Class
    let { data: classSubs } = await supabaseClient.from('class_subjects').select('subject_id, subjects(name)').eq('class_id', classId);
    
    // C. All Grades for this class & term
    let grades = [], remarks = [], attendance = [];
    if (students.length > 0) {
        const studentIds = students.map(s => s.id);
        const [{ data: g }, { data: r }, { data: a }] = await Promise.all([
            supabaseClient.from('grades').select('*').eq('term_id', termId).in('student_id', studentIds),
            supabaseClient.from('remarks').select('*').eq('term_id', termId).in('student_id', studentIds),
            supabaseClient.from('attendance').select('*').eq('term_id', termId).in('student_id', studentIds)
        ]);
        grades = g || [];
        remarks = r || [];
        attendance = a || [];
    }
    
    // Auto-rescue unmapped subjects (If a Teacher graded a subject not officially mapped to the Class)
    const { data: allSubjects } = await supabaseClient.from('subjects').select('id, name');
    let dynamicClassSubs = classSubs ? [...classSubs] : [];
    if (grades.length > 0 && allSubjects) {
        grades.forEach(g => {
            if (!dynamicClassSubs.find(cs => cs.subject_id === g.subject_id)) {
                const sName = allSubjects.find(s => s.id === g.subject_id)?.name || 'Unknown Subject';
                dynamicClassSubs.push({ subject_id: g.subject_id, subjects: { name: sName } });
            }
        });
    }
    classSubs = dynamicClassSubs;
    
    // E. Grading System Scale
    const { data: gradingSystem } = await supabaseClient.from('grading_system').select('*').order('min_score', { ascending: false });
    window._crGradingSystem = gradingSystem || [];
    
    // Build and inject grading legend into the hidden report template
    let legendHtml = '';
    if (window._crGradingSystem.length > 0) {
        legendHtml += `<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 3px;">` + window._crGradingSystem.map(gs => `<span style="white-space: nowrap;"><strong>${gs.min_score}-${gs.max_score}:</strong> ${gs.grade} (${gs.remark})</span>`).join('') + `</div>`;
    } else {
        legendHtml += `<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 3px;"><span style="white-space: nowrap;"><strong>90-100:</strong> A (Excellent)</span><span style="white-space: nowrap;"><strong>80-89:</strong> B (Very Good)</span><span style="white-space: nowrap;"><strong>70-79:</strong> C (Good)</span><span style="white-space: nowrap;"><strong>60-69:</strong> D (Average)</span><span style="white-space: nowrap;"><strong>0-59:</strong> F (Fail)</span></div>`;
    }
    const legObj = document.getElementById('rcGradingLegend');
    if (legObj) {
        legObj.innerHTML = `<strong>GRADING KEY / LEGEND:</strong><br>${legendHtml}`;
    }
    
    // Aggregate Data per student
    const studentDataMap = {};
    students.forEach(s => {
        studentDataMap[s.id] = {
            student: s,
            totalScore: 0,
            subjectCount: 0,
            average: 0,
            grades: [],
            remarkObj: remarks ? remarks.find(r => r.student_id === s.id) : null,
            attObj: attendance ? attendance.find(a => a.student_id === s.id) : null
        };
    });
    
    if (grades) {
        const subjectGroups = {};
        
        grades.forEach(g => {
            const rawSbaTotal = (g.class_exercise || 0) + (g.project_work || 0) + (g.individual_assessment || 0) + (g.group_work || 0);
            const rawExTotal = g.raw_exam_score || 0;
            
            // Standard Scale: SBA (out of 60) scaled to 50%, Exam (out of 100) scaled to 50%
            const sbaScaled = (rawSbaTotal / 60) * 50;
            const exScaled = (rawExTotal / 100) * 50;
            const finalMark = Math.round(sbaScaled + exScaled);
            
            g._sba_total = sbaScaled;
            g._exam_total = exScaled;
            g._total_score = finalMark;
            
            if (!subjectGroups[g.subject_id]) subjectGroups[g.subject_id] = [];
            subjectGroups[g.subject_id].push(g);
        });
        
        for (let subId in subjectGroups) {
            let list = subjectGroups[subId].sort((a,b) => b._total_score - a._total_score);
            let currentRank = 1;
            let prevScore = -1;
            list.forEach((grd, idx) => {
                if (grd._total_score === prevScore) {
                    grd._position = currentRank;
                } else {
                    grd._position = idx + 1;
                    currentRank = idx + 1;
                }
                prevScore = grd._total_score;
            });
        }
        
        grades.forEach(g => {
            if (studentDataMap[g.student_id]) {
                const sbaTotal = g._sba_total;
                const exTotal = g._exam_total;
                const finalMark = g._total_score;
                
                studentDataMap[g.student_id].totalScore += finalMark;
                studentDataMap[g.student_id].subjectCount++;
                    const evalMap = processGradeWithSystem(finalMark, window._crGradingSystem);
                    studentDataMap[g.student_id].grades.push({
                        subjectId: g.subject_id,
                        sbaTotal: sbaTotal.toFixed(2),
                        examScore: exTotal.toFixed(2),
                        totalScore: finalMark,
                        grade: evalMap.grade,
                        remark: evalMap.remark,
                        position: getOrdinalSuffix(g._position)
                });
            }
        });
    }
    
    // Calculate Averages and Sort for Positions
    const rankedList = Object.values(studentDataMap).map(d => {
        // Assume maximum subjects registered by class
        d.expectedSubjects = classSubs ? classSubs.length : 0;
        d.average = d.expectedSubjects > 0 ? (d.totalScore / (d.expectedSubjects * 100)) * 100 : 0;
        return d;
    }).sort((a, b) => b.totalScore - a.totalScore); // Sort descending by total score
    
    // Assign Positions
    let currentRank = 1;
    let prevScore = -1;
    rankedList.forEach((r, idx) => {
        if (r.totalScore === prevScore) {
            r.position = currentRank; // Tie
        } else {
            r.position = idx + 1;
            currentRank = idx + 1;
        }
        prevScore = r.totalScore;
    });
    
    window._crRankedList = rankedList;
    window._crClassSubs = classSubs; // Needed for PDF name mapping
    
    renderMatrixUI(rankedList);
}

function renderMatrixUI(rankedList) {
    const tbody = document.getElementById('crStudentsTableBody');
    document.getElementById('crTotalStudents').textContent = rankedList.length;
    
    let totalAvgSum = 0;
    let remarksCount = 0;
    
    const html = rankedList.map(r => {
        totalAvgSum += r.average;
        if(r.remarkObj && r.remarkObj.class_teacher_remark) remarksCount++;
        
        return `
        <tr>
            <td class="d-none d-md-table-cell"><strong class="text-primary-green">${r.student.student_id_number}</strong></td>
            <td class="fw-bold">${r.student.first_name} ${r.student.last_name}</td>
            <td>${Math.round(r.totalScore)} <span class="text-muted small">/ ${r.expectedSubjects * 100}</span></td>
            <td><strong class="text-info">${r.average.toFixed(1)}%</strong></td>
            <td><span class="badge bg-light text-dark shadow-sm px-2">${getOrdinalSuffix(r.position)}</span></td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-danger fw-bold" onclick="generateReportPDF('${r.student.id}')" title="Preview/Download Report">
                    <i class="fas fa-file-pdf"></i> PDF
                </button>
            </td>
        </tr>
        `;
    }).join('');
    
    tbody.innerHTML = rankedList.length > 0 ? html : '<tr><td colspan="6" class="text-center py-4">No students active.</td></tr>';
    
    if(rankedList.length > 0) {
        document.getElementById('crClassAvg').textContent = (totalAvgSum / rankedList.length).toFixed(1) + '%';
    }
    document.getElementById('crRemarksCompleted').textContent = remarksCount;
}

window.populateReportCardDOM = function(studentData) {
    if (!studentData) return null;
    
    const dom = document.getElementById('reportCardDOM');
    if (!dom) { alert('Report Component Missing!'); return null; }
    
    // Watermark
    document.getElementById('draftWatermark').style.display = window._crIsPublished ? 'none' : 'block';
    
    // School Setup
    if(window._crSchoolSet.school_logo_url) {
        document.getElementById('rcSchoolLogo').src = window._crSchoolSet.school_logo_url;
    }
    document.getElementById('rcSchoolName').textContent = window._crSchoolSet.school_name || 'SCHOOL NAME';
    document.getElementById('rcSchoolMotto').textContent = window._crSchoolSet.school_motto || 'Excellence and Discipline';
    document.getElementById('rcSchoolAddress').textContent = window._crSchoolSet.school_address || 'P.O.Box 123';
    document.getElementById('rcSchoolContact').textContent = window._crSchoolSet.school_contact || '020-000-0000';
    if(document.getElementById('rcSchoolEmail')) document.getElementById('rcSchoolEmail').textContent = window._crSchoolSet.school_email || 'info@school.com';
    
    // Term Title
    document.getElementById('rcTermTitle').textContent = `TERMINAL REPORT - ${window._crTerm.current_term} (${window._crTerm.academic_year})`;
    
    // Student Setup
    document.getElementById('rcStudentName').textContent = `${studentData.student.first_name} ${studentData.student.last_name}`;
    if(document.getElementById('rcAcadYear')) document.getElementById('rcAcadYear').textContent = window._crTerm.academic_year || '--';
    document.getElementById('rcClassName').textContent = window._crClass.name;
    if(document.getElementById('rcCurrentTerm')) document.getElementById('rcCurrentTerm').textContent = window._crTerm.current_term || '--';
    document.getElementById('rcIndexNumber').textContent = studentData.student.student_id_number;
    document.getElementById('rcClassPop').textContent = window._crRankedList.length;
    
    const termMaxAtt = window._crTerm.total_attendances || 0;
    const stuAtt = studentData.attObj ? studentData.attObj.days_present : 0;
    document.getElementById('rcAttendance').textContent = `${stuAtt} / ${termMaxAtt}`;
    if(document.getElementById('rcTermStartDate')) document.getElementById('rcTermStartDate').textContent = window._crTerm.term_start_date || 'N/A';
    document.getElementById('rcVacationDate').textContent = window._crTerm.term_end_date || 'N/A';
    if(document.getElementById('rcNextTermDate')) document.getElementById('rcNextTermDate').textContent = window._crTerm.next_term_begin_date || 'N/A';
    
    // Summary
    document.getElementById('rcTotalMarks').textContent = Math.round(studentData.totalScore);
    document.getElementById('rcAverage').textContent = studentData.average.toFixed(2) + '%';
    document.getElementById('rcClassPosition').textContent = getOrdinalSuffix(studentData.position);
    
    // Remarks
    document.getElementById('rcTeacherRemarks').innerHTML = studentData.remarkObj ? (studentData.remarkObj.class_teacher_remark || 'No remark given.') : 'No remark given.';
    document.getElementById('rcConduct').innerHTML = studentData.remarkObj ? (studentData.remarkObj.conduct || 'N/A') : 'N/A';
    document.getElementById('rcInterest').innerHTML = studentData.remarkObj ? (studentData.remarkObj.interest || 'N/A') : 'N/A';
    document.getElementById('rcHeadteacherRemarks').innerHTML = (studentData.remarkObj && studentData.remarkObj.headteacher_remark) ? studentData.remarkObj.headteacher_remark : 'Promoted to the next class / Continued satisfactory work.';
    
    // Grades Matrix
    const gBody = document.getElementById('rcGradesBody');
    
    // Match the grades to subjects
    let tRows = '';
    window._crClassSubs.forEach(csub => {
        const grd = studentData.grades.find(g => g.subjectId === csub.subject_id);
        const subName = csub.subjects ? csub.subjects.name : 'Unknown';
        
        if (grd) {
            tRows += `
            <tr>
                <td class="subject-name">${subName}</td>
                <td>${grd.sbaTotal}</td>
                <td>${grd.examScore}</td>
                <td><strong>${grd.totalScore}</strong></td>
                <td><strong style="font-size:12px;">${grd.grade}</strong></td>
                <td><strong style="font-size:11px;">${grd.position}</strong></td>
                <td class="text-start" style="font-size:10px;">${grd.remark}</td>
            </tr>
            `;
        } else {
            tRows += `
            <tr>
                <td class="subject-name">${subName}</td>
                <td>-</td>
                <td>-</td>
                <td><strong>-</strong></td>
                <td>-</td>
                <td>-</td>
                <td class="text-start">-</td>
            </tr>
            `;
        }
    });
    
    gBody.innerHTML = tRows;
    
    // Generate HTML snapshot
    document.getElementById('printReportContainer').style.display = 'block'; 
    const clonedNode = dom.cloneNode(true);
    clonedNode.id = 'reportCardModalClone_' + studentData.student.id; 
    clonedNode.style.boxShadow = '0 0 20px rgba(0,0,0,0.15)';
    document.getElementById('printReportContainer').style.display = 'none';
    
    return clonedNode;
};

window.generateReportPDF = async function(studentId) {
    const studentData = window._crRankedList.find(r => r.student.id === studentId);
    if (!studentData) return;
    
    // Process the template
    const clonedNode = window.populateReportCardDOM(studentData);
    if (!clonedNode) return;


    // Inject into viewer modal
    const modalBody = document.getElementById('rvModalBody');
    modalBody.innerHTML = '';
    modalBody.appendChild(clonedNode);
    
    // Manage Warnings & Locks
    const downloadBtn = document.getElementById('rvDownloadBtn');
    const warningBadge = document.getElementById('rvPublishWarning');
    
    // We treat Admin as having bypass privileges, but for strict fidelity, let's keep it visually watermarked if unpublished.
    if(window._crIsPublished) {
        warningBadge.classList.add('d-none');
        downloadBtn.disabled = false;
        
        // Remove watermark from clone if it exists
        const watermark = clonedNode.querySelector('#draftWatermark');
        if(watermark) watermark.style.display = 'none';
        
    } else {
        warningBadge.classList.remove('d-none');
        downloadBtn.disabled = true; // Lock download
        
        const watermark = clonedNode.querySelector('#draftWatermark');
        if(watermark) watermark.style.display = 'block';
    }
    
    // Wire PDF Generator exclusively to the Modal Button
    downloadBtn.onclick = () => {
        if(!window._crIsPublished) return; // double-check
        
        const filenameOpt = `${studentData.student.first_name}_${studentData.student.last_name}_${window._crTerm.current_term}_Report.pdf`;
        const opt = {
            margin:       0,
            filename:     filenameOpt,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'in', format: 'A4', orientation: 'portrait' }
        };
        
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Generating...';
        downloadBtn.disabled = true;
        
        html2pdf().set(opt).from(clonedNode).save().then(() => {
            downloadBtn.innerHTML = '<i class="fas fa-download me-2"></i> Download PDF';
            downloadBtn.disabled = false;
        }).catch(e => {
            alert("Failed to render PDF: " + e.message);
            downloadBtn.innerHTML = '<i class="fas fa-download me-2"></i> Download PDF';
            downloadBtn.disabled = false;
        });
    };
    
    // Show Modal
    const bsModal = new bootstrap.Modal(document.getElementById('reportViewerModal'));
    bsModal.show();
};

window.executeCrBulkPrint = async function() {
    const btn = document.getElementById('crPrintAllBtn');
    if(!btn || !window._crRankedList || window._crRankedList.length === 0) return;
    
    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Generating Bulk PDF...';
    
    // Show Loading Overlay
    const overlay = document.createElement('div');
    overlay.id = 'crBulkPrintOverlay';
    overlay.style = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.85); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:white;';
    overlay.innerHTML = `
        <div class="spinner-border text-primary" style="width: 4rem; height: 4rem;" role="status"></div>
        <h3 class="mt-4 fw-bold">Generating Bulk Report PDF</h3>
        <p class="text-muted">Compiling <span>${window._crRankedList.length}</span> individual report cards natively...</p>
    `;
    document.body.appendChild(overlay);
    
    try {
        let masterHtml = '';
        for(let stuData of window._crRankedList) {
             const clonedNode = window.populateReportCardDOM(stuData);
             if(!clonedNode) continue;
             
             // Strip shadow for raw PDF print
             clonedNode.style.boxShadow = 'none';
             
             // Append to string safely by grabbing outerHTML
             masterHtml += `<div>${clonedNode.outerHTML}</div><div class="html2pdf__page-break"></div>`;
        }
        
        // Hide overlay, mount to engine
        const hiddenBin = document.createElement('div');
        hiddenBin.style.position = 'absolute';
        hiddenBin.style.left = '-9999px';
        hiddenBin.style.top = '-9999px';
        hiddenBin.style.width = '800px';
        hiddenBin.style.backgroundColor = '#ffffff';
        hiddenBin.innerHTML = masterHtml;
        document.body.appendChild(hiddenBin);
        
        const classNameRaw = window._crClass.name.replace(/\s+/g,'_');
        const opt = {
            margin:       0,
            filename:     `${classNameRaw}_BulkReports.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, windowWidth: 800, logging: false },
            jsPDF:        { unit: 'in', format: 'A4', orientation: 'portrait' },
            pagebreak:    { mode: 'css' }
        };
        
        await new Promise(r => setTimeout(r, 2000));
        await html2pdf().set(opt).from(hiddenBin).save();
        
        document.body.removeChild(hiddenBin);
        overlay.remove();
        btn.innerHTML = oldText;
        btn.disabled = false;
        
    } catch(err) {
        console.error(err);
        overlay.innerHTML = `
            <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
            <h3 class="mb-3 text-danger">Generation Failed</h3>
            <p>${err.message}</p>
            <button class="btn btn-light mt-4" onclick="document.getElementById('crBulkPrintOverlay').remove()">Close Error</button>
        `;
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
};

function processGradeWithSystem(totalScore, gradingScale) {
    if (!gradingScale || gradingScale.length === 0) {
        if (totalScore >= 80) return { grade: '1', remark: 'Excellent' };
        if (totalScore >= 70) return { grade: '2', remark: 'Very Good' };
        if (totalScore >= 60) return { grade: '3', remark: 'Good' };
        if (totalScore >= 50) return { grade: '4', remark: 'Credit' };
        if (totalScore >= 40) return { grade: '5', remark: 'Pass' };
        return { grade: '9', remark: 'Fail' };
    }
    
    for (let i = 0; i < gradingScale.length; i++) {
        const minS = parseFloat(gradingScale[i].min_score);
        const maxS = parseFloat(gradingScale[i].max_score);
        if (totalScore >= minS && totalScore <= maxS) {
            return {
                grade: gradingScale[i].grade,
                remark: gradingScale[i].remark
            };
        }
    }
    return { grade: 'F', remark: 'Ungraded' };
}

function getOrdinalSuffix(i) {
    var j = i % 10, k = i % 100;
    if (j == 1 && k != 11) { return i + "st"; }
    if (j == 2 && k != 12) { return i + "nd"; }
    if (j == 3 && k != 13) { return i + "rd"; }
    return i + "th";
}
