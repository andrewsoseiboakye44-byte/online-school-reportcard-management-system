// Shared utility functions

/**
 * Calculates the letter grade, remark, and badge for a given raw score based on the dynamic grading system.
 * @param {number} rawScore - The total score to evaluate (out of 100)
 * @param {Array} gradingScale - Array of grading bounds from the database
 * @returns {Object} { grade, remark, badge_class }
 */
window.calculateGradeWithSystem = function(rawScore, gradingScale) {
    if (!gradingScale || gradingScale.length === 0) {
        return { grade: '--', remark: 'No Scale Found', badge_class: 'bg-secondary' };
    }
    
    // Iterate through the scale to find the matching bound
    for (const rule of gradingScale) {
        const minS = parseFloat(rule.min_score);
        const maxS = parseFloat(rule.max_score);
        if (rawScore >= minS && rawScore <= maxS) {
            return {
                grade: rule.grade,
                remark: rule.remark,
                badge_class: rule.badge_class || 'bg-secondary'
            };
        }
    }
    
    return { grade: 'F', remark: 'Failed', badge_class: 'bg-danger' };
};
